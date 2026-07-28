import { Types } from 'mongoose';
import { REDIS_TIMER_PREFIX } from '../config/constants';
import { redis } from '../config/redis';
import { BookingModel } from '../models/booking.model';
import { PropertyModel } from '../models/property.model';
import { UnitModel } from '../models/unit.model';
import { UserModel } from '../models/user.model';
import { createBooking, findBookingById, setBookingWebhookProcessed, updateBookingStatus } from '../repositories/bookings.repository';
import { findUserById } from '../repositories/users.repository';
import { publishBookingEvent } from '../queue/bookingEvents.producer';
import { BookingStatus, canTransition } from '../types/booking';
import { AppError } from '../utils/AppError';
import { dateRange } from '../utils/dates';
import { logger } from '../utils/logger';
import { calculateCommission, calculatePayout } from './commission.service';
import { paystackService } from './paystack.service';

type BookingApiStatus =
  | 'pending'
  | 'payment_held'
  | 'confirmed'
  | 'declined'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'paid_out';

interface BookingApiView {
  id: string;
  propertyId: string;
  roomType?: string;
  status: BookingApiStatus;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  ttlSeconds: number;
  createdAt: string;
  guestDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  priceBreakdown: {
    nightlyRate: number;
    nights: number;
    serviceFee: number;
    cleaningFee: number;
    total: number;
  };
}

function toBookingApiStatus(status: BookingStatus): BookingApiStatus {
  if (status === BookingStatus.CANCELLED_BY_GUEST || status === BookingStatus.CANCELLED_BY_HOST) {
    return 'cancelled';
  }

  if (status === BookingStatus.ESCALATED) {
    return 'pending';
  }

  if (status === BookingStatus.DISPUTED) {
    return 'cancelled';
  }

  return status;
}

function splitNameParts(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      firstName: '',
      lastName: '',
    };
  }

  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  return {
    firstName,
    lastName,
  };
}

async function getBookingTtlSeconds(bookingId: string, status: BookingStatus): Promise<number> {
  if (status !== BookingStatus.PAYMENT_HELD && status !== BookingStatus.PENDING) {
    return 0;
  }

  const ttl = await redis.ttl(`${REDIS_TIMER_PREFIX}${bookingId}`);
  return ttl >= 0 ? ttl : 0;
}

async function mapToBookingApiView(booking: {
  _id: Types.ObjectId;
  guestId: Types.ObjectId;
  unitId: Types.ObjectId;
  totalAmount: number;
  checkIn: Date;
  checkOut: Date;
  createdAt: Date;
  status: BookingStatus;
}): Promise<BookingApiView> {
  const [unit, guest] = await Promise.all([
    UnitModel.findById(booking.unitId).lean(),
    UserModel.findById(booking.guestId).lean(),
  ]);

  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  const nights = Math.max(1, dateRange(checkIn, checkOut).length);
  const nightlyRate = unit?.pricePerNight ?? Math.max(0, Math.round(booking.totalAmount / nights));
  const bookingId = String(booking._id);
  const ttlSeconds = await getBookingTtlSeconds(bookingId, booking.status);
  const nameParts = splitNameParts(guest?.name ?? '');

  return {
    id: bookingId,
    propertyId: unit ? String(unit.propertyId) : '',
    roomType: unit?.name,
    status: toBookingApiStatus(booking.status),
    guestCount: unit?.maxGuests ?? 1,
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
    ttlSeconds,
    createdAt: new Date(booking.createdAt).toISOString(),
    guestDetails: {
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: guest?.email ?? '',
      phone: guest?.phoneNumber ?? '',
    },
    priceBreakdown: {
      nightlyRate,
      nights,
      serviceFee: 0,
      cleaningFee: 0,
      total: booking.totalAmount,
    },
  };
}

async function resolveUnitForPropertyBooking(input: {
  propertyId: string;
  roomType?: string;
  nightlyRate?: number;
}): Promise<string> {
  const filters: Record<string, unknown> = {
    propertyId: new Types.ObjectId(input.propertyId),
    isAvailable: true,
  };

  if (input.roomType) {
    filters.name = input.roomType;
  }

  if (typeof input.nightlyRate === 'number' && Number.isFinite(input.nightlyRate)) {
    filters.pricePerNight = input.nightlyRate;
  }

  let unit = await UnitModel.findOne(filters).lean();

  if (!unit) {
    unit = await UnitModel.findOne({
      propertyId: new Types.ObjectId(input.propertyId),
      isAvailable: true,
    }).lean();
  }

  if (!unit) {
    throw new AppError('No available room found for this property', 404, 'UNIT_NOT_FOUND');
  }

  return String(unit._id);
}

async function transitionBooking(bookingId: string, to: BookingStatus): Promise<void> {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (!canTransition(booking.status, to)) {
    throw new AppError(`Invalid transition ${booking.status} -> ${to}`, 409, 'INVALID_TRANSITION');
  }

  await updateBookingStatus(bookingId, to);
  logger.info({ bookingId, to }, 'booking status transitioned');
}

export async function createBookingRequest(input: {
  guestId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
}): Promise<{ bookingId: string; status: BookingStatus; paystackReference: string; paystackCheckoutUrl: string }> {
  const guest = await findUserById(input.guestId);
  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const unit = await UnitModel.findById(new Types.ObjectId(input.unitId)).lean();
  if (!unit) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  if (unit.isAvailable === false) {
    throw new AppError('Unit is currently unavailable', 409, 'UNIT_UNAVAILABLE');
  }

  const property = await PropertyModel.findById(unit.propertyId).lean();
  if (!property) {
    throw new AppError('Property not found for unit', 404, 'PROPERTY_NOT_FOUND');
  }

  const checkIn = new Date(input.checkIn);
  const checkOut = new Date(input.checkOut);
  const nights = Math.max(1, dateRange(checkIn, checkOut).length);
  const totalAmount = unit.pricePerNight * nights;
  const commissionAmount = calculateCommission(totalAmount);
  const payoutAmount = calculatePayout(totalAmount);


  const preauth = await paystackService.initializePreauth({
    amount: totalAmount,
    email: guest.email,
    metadata: {
      guestId: input.guestId,
      unitId: input.unitId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    },
  });

  const booking = await createBooking({
    guestId: new Types.ObjectId(input.guestId),
    hostId: property.hostId,
    unitId: unit._id,
    checkIn,
    checkOut,
    totalAmount,
    commissionAmount,
    payoutAmount,
    status: BookingStatus.PENDING,
    paystackReference: preauth.reference,
    stateHistory: ([{ status: BookingStatus.PENDING, timestamp: new Date() }] as unknown) as never,
  });

  logger.info({ bookingId: String(booking._id) }, 'booking created and checkout initialized');
  return {
    bookingId: String(booking._id),
    status: booking.status,
    paystackReference: preauth.reference,
    paystackCheckoutUrl: preauth.authorizationUrl,
  };
}

export async function createBookingFromPropertyRequest(input: {
  guestId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  roomType?: string;
  nightlyRate?: number;
}): Promise<{ bookingId: string; status: BookingStatus; paystackReference: string; paystackCheckoutUrl: string }> {
  const unitId = await resolveUnitForPropertyBooking({
    propertyId: input.propertyId,
    roomType: input.roomType,
    nightlyRate: input.nightlyRate,
  });

  return createBookingRequest({
    guestId: input.guestId,
    unitId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
  });
}

export async function confirmBookingPayment(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'guest' | 'admin';
}): Promise<{ bookingId: string; status: BookingStatus }> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const isAdmin = input.requesterRole === 'admin';
  const isGuestOwner = input.requesterRole === 'guest' && String(booking.guestId) === input.requesterId;
  if (!isAdmin && !isGuestOwner) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status === BookingStatus.PAYMENT_HELD) {
    return { bookingId: String(booking._id), status: booking.status };
  }

  if (booking.status !== BookingStatus.PENDING) {
    throw new AppError('Booking is not awaiting payment confirmation', 409, 'INVALID_BOOKING_STATE');
  }

  const verification = await paystackService.verifyTransaction(booking.paystackReference);
  if (!verification.paid) {
    throw new AppError('Payment has not been completed', 409, 'PAYMENT_NOT_COMPLETED');
  }

  await transitionBooking(String(booking._id), BookingStatus.PAYMENT_HELD);
  await publishBookingEvent('booking.pending', {
    bookingId: String(booking._id),
  });

  logger.info({ bookingId: String(booking._id) }, 'payment confirmed and host confirmation requested');
  return { bookingId: String(booking._id), status: BookingStatus.PAYMENT_HELD };
}

export async function confirmBookingPaymentFromWebhook(input: {
  paystackReference: string;
  webhookId: string;
}): Promise<{ processed: boolean; bookingId?: string; status?: BookingStatus }> {
  const booking = await BookingModel.findOne({ paystackReference: input.paystackReference }).lean();
  if (!booking) {
    logger.warn({ reference: input.paystackReference }, 'paystack webhook reference not mapped to booking');
    return { processed: false };
  }

  const bookingId = String(booking._id);
  if (booking.lastWebhookId && booking.lastWebhookId === input.webhookId) {
    logger.info({ bookingId, webhookId: input.webhookId }, 'duplicate paystack webhook ignored');
    return { processed: true, bookingId, status: booking.status };
  }

  if (booking.status === BookingStatus.PAYMENT_HELD) {
    await setBookingWebhookProcessed(bookingId, input.webhookId);
    return { processed: true, bookingId, status: booking.status };
  }

  if (booking.status !== BookingStatus.PENDING) {
    await setBookingWebhookProcessed(bookingId, input.webhookId);
    logger.info({ bookingId, status: booking.status }, 'paystack webhook ignored for non-pending booking');
    return { processed: true, bookingId, status: booking.status };
  }

  await transitionBooking(bookingId, BookingStatus.PAYMENT_HELD);
  await setBookingWebhookProcessed(bookingId, input.webhookId);
  await publishBookingEvent('booking.pending', {
    bookingId,
  });

  logger.info({ bookingId }, 'payment confirmed from paystack webhook');
  return { processed: true, bookingId, status: BookingStatus.PAYMENT_HELD };
}

export async function getBookingStatus(bookingId: string): Promise<{ status: BookingStatus; ttlSeconds: number | null }> {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const ttl = booking.status === BookingStatus.PAYMENT_HELD
    ? await redis.ttl(`${REDIS_TIMER_PREFIX}${bookingId}`)
    : -1;

  return {
    status: booking.status,
    ttlSeconds: ttl >= 0 ? ttl : null,
  };
}

export async function getBookingApiStatus(bookingId: string): Promise<{
  bookingId: string;
  status: BookingApiStatus;
  ttlSeconds: number;
}> {
  const result = await getBookingStatus(bookingId);

  return {
    bookingId,
    status: toBookingApiStatus(result.status),
    ttlSeconds: result.ttlSeconds ?? 0,
  };
}

export async function getBookingStats(input: {
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ totalPendingBookings: number; totalConfirmedBookings: number; totalCheckedInBookings: number }> {
  const baseFilter = input.requesterRole === 'host'
    ? { hostId: new Types.ObjectId(input.requesterId) }
    : {};

  const [totalPendingBookings, totalConfirmedBookings, totalCheckedInBookings] = await Promise.all([
    BookingModel.countDocuments({
      ...baseFilter,
      status: BookingStatus.PENDING,
    }),
    BookingModel.countDocuments({
      ...baseFilter,
      status: BookingStatus.CONFIRMED,
    }),
    BookingModel.countDocuments({
      ...baseFilter,
      status: BookingStatus.CHECKED_IN,
    }),
  ]);

  return {
    totalPendingBookings,
    totalConfirmedBookings,
    totalCheckedInBookings,
  };
}

export async function getBookingDetails(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'guest' | 'host' | 'admin';
}): Promise<unknown> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const isAdmin = input.requesterRole === 'admin';
  const isHostOwner = input.requesterRole === 'host' && String(booking.hostId) === input.requesterId;
  const isGuestOwner = input.requesterRole === 'guest' && String(booking.guestId) === input.requesterId;

  if (!isAdmin && !isHostOwner && !isGuestOwner) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  return booking;
}

export async function getBookingApiDetails(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'guest' | 'host' | 'admin';
}): Promise<BookingApiView> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const isAdmin = input.requesterRole === 'admin';
  const isHostOwner = input.requesterRole === 'host' && String(booking.hostId) === input.requesterId;
  const isGuestOwner = input.requesterRole === 'guest' && String(booking.guestId) === input.requesterId;

  if (!isAdmin && !isHostOwner && !isGuestOwner) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  return mapToBookingApiView(booking);
}

export async function listBookings(input: {
  requesterId: string;
  requesterRole: 'guest' | 'host' | 'admin';
}): Promise<BookingApiView[]> {
  const filter = input.requesterRole === 'guest'
    ? { guestId: new Types.ObjectId(input.requesterId) }
    : input.requesterRole === 'host'
      ? { hostId: new Types.ObjectId(input.requesterId) }
      : {};

  const bookings = await BookingModel.find(filter).sort({ createdAt: -1 }).lean();
  const mapped = await Promise.all(bookings.map((booking) => mapToBookingApiView(booking)));
  return mapped;
}

export async function processHostDecision(input: {
  bookingId: string;
  decision: 'accept' | 'decline';
  webhookId: string;
}): Promise<{ status: BookingStatus }> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.lastWebhookId && booking.lastWebhookId === input.webhookId) {
    logger.info({ bookingId: input.bookingId, webhookId: input.webhookId }, 'duplicate webhook ignored');
    return { status: booking.status };
  }

  if (booking.status !== BookingStatus.PAYMENT_HELD && booking.status !== BookingStatus.ESCALATED) {
    return { status: booking.status };
  }

  if (input.decision === 'accept') {
    await paystackService.capturePreauth(booking.paystackReference);
    await transitionBooking(input.bookingId, BookingStatus.CONFIRMED);
  } else {
    await paystackService.releasePreauth(booking.paystackReference);
    await transitionBooking(input.bookingId, BookingStatus.DECLINED);
  }

  await setBookingWebhookProcessed(input.bookingId, input.webhookId);
  await redis.del(`${REDIS_TIMER_PREFIX}${input.bookingId}`);

  const updated = await findBookingById(input.bookingId);
  if (!updated) {
    throw new AppError('Booking not found after update', 500, 'BOOKING_UPDATE_FAILED');
  }

  logger.info({ bookingId: input.bookingId, status: updated.status }, 'host decision processed');
  return { status: updated.status };
}

export async function acceptBookingByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ status: BookingStatus }> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (input.requesterRole === 'host' && String(booking.hostId) !== input.requesterId) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status !== BookingStatus.PAYMENT_HELD && booking.status !== BookingStatus.ESCALATED) {
    return { status: booking.status };
  }

  await paystackService.capturePreauth(booking.paystackReference);
  await transitionBooking(input.bookingId, BookingStatus.CONFIRMED);

  return { status: BookingStatus.CONFIRMED };
}

export async function decideBookingByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
  action: 'accept' | 'decline' | 'check-in';
}): Promise<{ status: BookingApiStatus; ttlSeconds: number }> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (input.requesterRole === 'host' && String(booking.hostId) !== input.requesterId) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (input.action === 'check-in') {
    await markBookingCheckedIn(input.bookingId);
    return {
      status: 'checked_in',
      ttlSeconds: 0,
    };
  }

  if (booking.status !== BookingStatus.PAYMENT_HELD && booking.status !== BookingStatus.ESCALATED) {
    return {
      status: toBookingApiStatus(booking.status),
      ttlSeconds: 0,
    };
  }

  if (input.action === 'accept') {
    await paystackService.capturePreauth(booking.paystackReference);
    await transitionBooking(input.bookingId, BookingStatus.CONFIRMED);
  } else {
    await paystackService.releasePreauth(booking.paystackReference);
    await transitionBooking(input.bookingId, BookingStatus.DECLINED);
  }

  await redis.del(`${REDIS_TIMER_PREFIX}${input.bookingId}`);

  return {
    status: input.action === 'accept' ? 'confirmed' : 'declined',
    ttlSeconds: 0,
  };
}

export async function markBookingCheckedIn(bookingId: string): Promise<void> {
  await transitionBooking(bookingId, BookingStatus.CHECKED_IN);
}

export async function markBookingCheckedInByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ status: BookingApiStatus; ttlSeconds: number }> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (input.requesterRole === 'host' && String(booking.hostId) !== input.requesterId) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  await markBookingCheckedIn(input.bookingId);

  return {
    status: 'checked_in',
    ttlSeconds: 0,
  };
}

export async function withdrawBookingPayoutByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ status: BookingApiStatus; ttlSeconds: number }> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (input.requesterRole === 'host' && String(booking.hostId) !== input.requesterId) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status === BookingStatus.PAID_OUT) {
    return {
      status: 'paid_out',
      ttlSeconds: 0,
    };
  }

  if (booking.status === BookingStatus.CHECKED_IN) {
    await transitionBooking(input.bookingId, BookingStatus.COMPLETED);
    await transitionBooking(input.bookingId, BookingStatus.PAID_OUT);
    return {
      status: 'paid_out',
      ttlSeconds: 0,
    };
  }

  if (booking.status === BookingStatus.COMPLETED) {
    await transitionBooking(input.bookingId, BookingStatus.PAID_OUT);
    return {
      status: 'paid_out',
      ttlSeconds: 0,
    };
  }

  throw new AppError('Booking is not ready for payout withdrawal', 409, 'BOOKING_NOT_READY_FOR_PAYOUT');
}

export async function cancelBooking(
  bookingId: string,
  role: 'guest' | 'host',
): Promise<{ status: BookingStatus }> {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const to = role === 'guest' ? BookingStatus.CANCELLED_BY_GUEST : BookingStatus.CANCELLED_BY_HOST;

  if (!canTransition(booking.status, to)) {
    throw new AppError(`Invalid transition ${booking.status} -> ${to}`, 409, 'INVALID_TRANSITION');
  }

  if (booking.status === BookingStatus.PAYMENT_HELD) {
    await paystackService.releasePreauth(booking.paystackReference);
  }

  await transitionBooking(bookingId, to);
  return { status: to };
}

export async function escalateExpiredBookings(): Promise<number> {
  const bookings = await BookingModel.find({ status: BookingStatus.PAYMENT_HELD }).lean();
  let escalated = 0;

  for (const booking of bookings) {
    const key = `${REDIS_TIMER_PREFIX}${String(booking._id)}`;
    const exists = await redis.exists(key);
    if (!exists) {
      await transitionBooking(String(booking._id), BookingStatus.ESCALATED);
      escalated += 1;
    }
  }

  return escalated;
}
