import { Types } from 'mongoose';
import { REDIS_TIMER_PREFIX } from '../config/constants';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { BookingModel } from '../models/booking.model';
import { PropertyModel } from '../models/property.model';
import { UnitModel } from '../models/unit.model';
import { UserModel } from '../models/user.model';
import { createBooking, findBookingById, findBookingByPaystackReference, setBookingWebhookProcessed, updateBookingStatus } from '../repositories/bookings.repository';
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

function isCardPaymentMethod(paymentMethod?: string): boolean {
  return !paymentMethod || paymentMethod === 'card';
}

function isTransferLikePaymentMethod(paymentMethod?: string): boolean {
  return paymentMethod === 'bank_transfer' || paymentMethod === 'transfer';
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
  const bookingServiceFee = env.BOOKING_SERVICE_FEE_NGN;
  const baseAmount = Math.max(0, booking.totalAmount - bookingServiceFee);
  const nightlyRate = unit?.pricePerNight ?? Math.max(0, Math.round(baseAmount / nights));
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
      serviceFee: bookingServiceFee,
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
  paymentMethod?: 'card' | 'bank_transfer' | 'transfer';
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
  const bookingSubtotal = unit.pricePerNight * nights;
  const serviceFee = env.BOOKING_SERVICE_FEE_NGN;
  const totalAmount = bookingSubtotal + serviceFee;
  const commissionAmount = calculateCommission(bookingSubtotal);
  const payoutAmount = calculatePayout(bookingSubtotal);

  const checkoutPayload = {
    amount: totalAmount,
    email: guest.email,
    currency: 'NGN',
    metadata: {
      guestId: input.guestId,
      unitId: input.unitId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    },
    callbackUrl: env.PAYSTACK_BOOKING_CALLBACK_URL,
  };

  const checkout = isCardPaymentMethod(input.paymentMethod)
    ? await paystackService.initializePreauth(checkoutPayload)
    : await paystackService.initializeTransaction(checkoutPayload);

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
    paystackReference: checkout.reference,
    paymentMethod: input.paymentMethod ?? 'card',
    stateHistory: ([{ status: BookingStatus.PENDING, timestamp: new Date() }] as unknown) as never,
  });

  logger.info({ bookingId: String(booking._id) }, 'booking created and checkout initialized');
  return {
    bookingId: String(booking._id),
    status: booking.status,
    paystackReference: checkout.reference,
    paystackCheckoutUrl: checkout.authorizationUrl,
  };
}

export async function createBookingFromPropertyRequest(input: {
  guestId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  roomType?: string;
  nightlyRate?: number;
  paymentMethod?: 'card' | 'bank_transfer' | 'transfer';
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
    paymentMethod: input.paymentMethod,
  });
}

export async function initializeBookingPreauthorization(input: {
  guestId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  roomType?: string;
  nightlyRate?: number;
  paymentMethod?: 'card' | 'bank_transfer' | 'transfer';
}): Promise<{
  bookingId: string;
  reference: string;
  accessCode: string;
  checkoutUrl: string;
  amount: number;
  currency: 'NGN';
  status: BookingStatus;
}> {
  const checkout = await createBookingFromPropertyRequest({
    guestId: input.guestId,
    propertyId: input.propertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    roomType: input.roomType,
    nightlyRate: input.nightlyRate,
    paymentMethod: input.paymentMethod,
  });

  const booking = await findBookingById(checkout.bookingId);
  if (!booking) {
    throw new AppError('Booking not found after initialization', 500, 'BOOKING_INIT_FAILED');
  }

  const checkoutUrl = new URL(checkout.paystackCheckoutUrl);
  const pathSegments = checkoutUrl.pathname.split('/').filter(Boolean);
  const accessCode = checkoutUrl.searchParams.get('access_code') ?? pathSegments[pathSegments.length - 1] ?? null;
  if (!accessCode) {
    throw new AppError('Unable to resolve Paystack access code', 502, 'PAYSTACK_ACCESS_CODE_MISSING');
  }

  return {
    bookingId: checkout.bookingId,
    reference: checkout.paystackReference,
    accessCode,
    checkoutUrl: checkout.paystackCheckoutUrl,
    amount: booking.totalAmount * 100,
    currency: 'NGN',
    status: booking.status,
  };
}

export async function confirmBookingPreauthorization(input: {
  reference: string;
  requesterId: string;
  requesterRole: 'guest' | 'admin';
}): Promise<{ bookingId: string; reference: string; status: BookingStatus }> {
  const booking = await findBookingByPaystackReference(input.reference);
  if (!booking) {
    throw new AppError('Booking not found for preauthorization reference', 404, 'BOOKING_NOT_FOUND');
  }

  const isAdmin = input.requesterRole === 'admin';
  const isGuestOwner = input.requesterRole === 'guest' && String(booking.guestId) === input.requesterId;
  if (!isAdmin && !isGuestOwner) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status === BookingStatus.PAYMENT_HELD) {
    return {
      bookingId: String(booking._id),
      reference: input.reference,
      status: booking.status,
    };
  }

  if (booking.status !== BookingStatus.PENDING) {
    throw new AppError('Booking is not awaiting preauthorization confirmation', 409, 'INVALID_BOOKING_STATE');
  }

  const isCardPayment = isCardPaymentMethod(booking.paymentMethod);
  if (isCardPayment) {
    const verification = await paystackService.verifyPreauth(input.reference);
    if (!verification.authorized) {
      throw new AppError('Preauthorization has not been completed', 409, 'PREAUTH_NOT_COMPLETED');
    }
  } else {
    const verification = await paystackService.verifyTransaction(input.reference);
    if (!verification.paid) {
      throw new AppError('Payment has not been completed', 409, 'PAYMENT_NOT_COMPLETED');
    }
  }

  const unit = await UnitModel.findById(booking.unitId).lean();
  const property = unit ? await PropertyModel.findById(unit.propertyId).lean() : null;
  const isTransferLike = isTransferLikePaymentMethod(booking.paymentMethod);
  const bypassHostConfirmation = Boolean(isTransferLike && property?.instantBookEligible);

  if (bypassHostConfirmation) {
    await transitionBooking(String(booking._id), BookingStatus.CONFIRMED);
    return {
      bookingId: String(booking._id),
      reference: input.reference,
      status: BookingStatus.CONFIRMED,
    };
  }

  await transitionBooking(String(booking._id), BookingStatus.PAYMENT_HELD);
  await publishBookingEvent('booking.pending', {
    bookingId: String(booking._id),
  });

  return {
    bookingId: String(booking._id),
    reference: input.reference,
    status: BookingStatus.PAYMENT_HELD,
  };
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

  let paid = false;
  try {
    const preauth = await paystackService.verifyPreauth(booking.paystackReference);
    paid = preauth.authorized;
  } catch {
    const transaction = await paystackService.verifyTransaction(booking.paystackReference);
    paid = transaction.paid;
  }

  if (!paid) {
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
    if (isCardPaymentMethod(booking.paymentMethod)) {
      await paystackService.capturePreauth({
        reference: booking.paystackReference,
        amount: booking.totalAmount,
        currency: 'NGN',
      });
    }
    await transitionBooking(input.bookingId, BookingStatus.CONFIRMED);
  } else {
    if (isCardPaymentMethod(booking.paymentMethod)) {
      await paystackService.releasePreauth(booking.paystackReference);
    } else {
      await paystackService.refundTransaction(booking.paystackReference);
    }
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

  if (isCardPaymentMethod(booking.paymentMethod)) {
    await paystackService.capturePreauth({
      reference: booking.paystackReference,
      amount: booking.totalAmount,
      currency: 'NGN',
    });
  }
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
    if (isCardPaymentMethod(booking.paymentMethod)) {
      await paystackService.capturePreauth({
        reference: booking.paystackReference,
        amount: booking.totalAmount,
        currency: 'NGN',
      });
    }
    await transitionBooking(input.bookingId, BookingStatus.CONFIRMED);
  } else {
    if (isCardPaymentMethod(booking.paymentMethod)) {
      await paystackService.releasePreauth(booking.paystackReference);
    } else {
      await paystackService.refundTransaction(booking.paystackReference);
    }
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
    if (isCardPaymentMethod(booking.paymentMethod)) {
      await paystackService.releasePreauth(booking.paystackReference);
    } else {
      await paystackService.refundTransaction(booking.paystackReference);
    }
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
      try {
        if (isCardPaymentMethod(booking.paymentMethod)) {
          await paystackService.releasePreauth(booking.paystackReference);
        } else {
          await paystackService.refundTransaction(booking.paystackReference);
        }
      } catch (error) {
        logger.error({ err: error, bookingId: String(booking._id) }, 'failed to release preauthorization on timeout');
      }

      await transitionBooking(String(booking._id), BookingStatus.DECLINED);
      escalated += 1;
    }
  }

  return escalated;
}
