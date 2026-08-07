import { Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { env } from '../config/env';
import { BookingModel } from '../models/booking.model';
import { PayoutModel } from '../models/payout.model';
import { PropertyModel } from '../models/property.model';
import { UnitModel } from '../models/unit.model';
import { UserModel } from '../models/user.model';
import { createBooking, findBookingById, setBookingWebhookProcessed, updateBookingStatus } from '../repositories/bookings.repository';
import { createPayout, findPayoutByBookingId, setPayoutPendingByBookingId } from '../repositories/payouts.repository';
import { findUserById } from '../repositories/users.repository';
import { BookingStatus, canTransition } from '../types/booking';
import { AppError } from '../utils/AppError';
import { dateRange } from '../utils/dates';
import { logger } from '../utils/logger';
import { calculateCommission, calculatePayout } from './commission.service';
import { refundBookingPayment } from './payments.service';
import { processHostPayoutRequest } from './payouts.service';

type BookingApiStatus =
  | 'pending'
  | 'payment_failed'
  | 'confirmed'
  | 'declined'
  | 'checked_in'
  | 'payout_requested'
  | 'cancelled'
  | 'paid_out';

interface BookingApiView {
  id: string;
  propertyId: string;
  roomType?: string;
  status: BookingApiStatus;
  payoutAmount: number;
  payoutTransferStatus?: 'pending' | 'completed' | 'failed';
  checkedInAt?: string;
  paidOutAt?: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
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

interface BookingStateHistoryItem {
  status: BookingStatus;
  timestamp: Date | string;
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

  if (status === BookingStatus.COMPLETED) {
    return 'paid_out';
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveCheckoutEmail(input: { requestEmail?: string; accountEmail?: string }): string {
  const requestEmail = input.requestEmail?.trim().toLowerCase();
  if (requestEmail && isValidEmail(requestEmail)) {
    return requestEmail;
  }

  const accountEmail = input.accountEmail?.trim().toLowerCase();
  if (accountEmail && isValidEmail(accountEmail)) {
    return accountEmail;
  }

  throw new AppError('Please enter a valid email address', 400, 'INVALID_CHECKOUT_EMAIL');
}

async function mapToBookingApiView(booking: {
  _id: Types.ObjectId;
  guestId: Types.ObjectId;
  unitId: Types.ObjectId;
  totalAmount: number;
  payoutAmount: number;
  checkIn: Date;
  checkOut: Date;
  createdAt: Date;
  status: BookingStatus;
  stateHistory?: BookingStateHistoryItem[];
}): Promise<BookingApiView> {
  const [unit, guest, payout] = await Promise.all([
    UnitModel.findById(booking.unitId).lean(),
    UserModel.findById(booking.guestId).lean(),
    PayoutModel.findOne({ bookingId: booking._id }).lean(),
  ]);

  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  const nights = Math.max(1, dateRange(checkIn, checkOut).length);
  const bookingServiceFee = env.BOOKING_SERVICE_FEE_NGN;
  const baseAmount = Math.max(0, booking.totalAmount - bookingServiceFee);
  const nightlyRate = unit?.pricePerNight ?? Math.max(0, Math.round(baseAmount / nights));
  const bookingId = String(booking._id);
  const nameParts = splitNameParts(guest?.name ?? '');
  const stateHistory = Array.isArray(booking.stateHistory) ? booking.stateHistory : [];
  const checkedInState = [...stateHistory].reverse().find((entry) => entry.status === BookingStatus.CHECKED_IN);
  const paidOutState = [...stateHistory].reverse().find((entry) => entry.status === BookingStatus.PAID_OUT);
  const checkedInAt = checkedInState ? new Date(checkedInState.timestamp).toISOString() : undefined;
  const paidOutAt = paidOutState ? new Date(paidOutState.timestamp).toISOString() : undefined;

  return {
    id: bookingId,
    propertyId: unit ? String(unit.propertyId) : '',
    roomType: unit?.name,
    status: toBookingApiStatus(booking.status),
    payoutAmount: booking.payoutAmount,
    payoutTransferStatus: payout?.status,
    checkedInAt,
    paidOutAt,
    guestCount: unit?.maxGuests ?? 1,
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
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
  email?: string;
}): Promise<{
  bookingId: string;
  status: BookingStatus;
}> {
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

  if (property.bookingEnabled === false) {
    throw new AppError('Property is not accepting bookings right now', 409, 'PROPERTY_BOOKING_DISABLED');
  }

  const checkIn = new Date(input.checkIn);
  const checkOut = new Date(input.checkOut);
  const nights = Math.max(1, dateRange(checkIn, checkOut).length);
  const bookingSubtotal = unit.pricePerNight * nights;
  const serviceFee = env.BOOKING_SERVICE_FEE_NGN;
  const totalAmount = bookingSubtotal + serviceFee;
  const commissionAmount = calculateCommission(bookingSubtotal);
  const payoutAmount = calculatePayout(bookingSubtotal);
  resolveCheckoutEmail({
    requestEmail: input.email,
    accountEmail: guest.email,
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
    stateHistory: ([{ status: BookingStatus.PENDING, timestamp: new Date() }] as unknown) as never,
  });

  logger.info({ bookingId: String(booking._id) }, 'booking created and awaiting payment initialization');
  return {
    bookingId: String(booking._id),
    status: booking.status,
  };
}

export async function createBookingFromPropertyRequest(input: {
  guestId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  email?: string;
  roomType?: string;
  nightlyRate?: number;
}): Promise<{
  bookingId: string;
  status: BookingStatus;
}> {
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
    email: input.email,
  });
}

export async function getBookingStatus(bookingId: string): Promise<{ status: BookingStatus }> {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  return {
    status: booking.status,
  };
}

export async function getBookingApiStatus(bookingId: string): Promise<{
  bookingId: string;
  status: BookingApiStatus;
}> {
  const result = await getBookingStatus(bookingId);

  return {
    bookingId,
    status: toBookingApiStatus(result.status),
  };
}

export async function getBookingStats(input: {
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ totalPendingBookings: number; totalConfirmedBookings: number; totalCheckedInBookings: number; totalPaidOutBookings: number }> {
  const baseFilter = input.requesterRole === 'host'
    ? { hostId: new Types.ObjectId(input.requesterId) }
    : {};

  const [totalPendingBookings, totalConfirmedBookings, totalCheckedInBookings, totalPaidOutBookings] = await Promise.all([
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
    BookingModel.countDocuments({
      ...baseFilter,
      status: BookingStatus.PAID_OUT,
    }),
  ]);

  return {
    totalPendingBookings,
    totalConfirmedBookings,
    totalCheckedInBookings,
    totalPaidOutBookings,
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

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.ESCALATED) {
    return { status: booking.status };
  }

  if (input.decision === 'decline') {
    await refundBookingPayment(input.bookingId);
    await transitionBooking(input.bookingId, BookingStatus.DECLINED);
  }

  await setBookingWebhookProcessed(input.bookingId, input.webhookId);

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

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.ESCALATED) {
    return { status: booking.status };
  }

  await transitionBooking(input.bookingId, BookingStatus.CONFIRMED);

  return { status: BookingStatus.CONFIRMED };
}

export async function decideBookingByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
  action: 'check-in';
}): Promise<{ status: BookingApiStatus }> {
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
  };
}

export async function markBookingCheckedIn(bookingId: string): Promise<void> {
  await transitionBooking(bookingId, BookingStatus.CHECKED_IN);
}

export async function markBookingCheckedInByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ status: BookingApiStatus }> {
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
  };
}

export async function withdrawBookingPayoutByHost(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'host' | 'admin';
}): Promise<{ status: BookingApiStatus; paidOutAmount: number }> {
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
      paidOutAmount: booking.payoutAmount,
    };
  }

  if (booking.status !== BookingStatus.CHECKED_IN && booking.status !== BookingStatus.COMPLETED) {
    throw new AppError('Booking is not ready for payout withdrawal', 409, 'BOOKING_NOT_READY_FOR_PAYOUT');
  }

  const host = await findUserById(String(booking.hostId));
  if (!host?.bankDetails?.recipientCode) {
    throw new AppError('Host bank payout details are missing', 409, 'HOST_PAYOUT_ACCOUNT_MISSING');
  }

  const transferReference = `manual_${input.bookingId}_${Date.now()}`;
  const existingPayout = await findPayoutByBookingId(input.bookingId);

  if (existingPayout?.status === 'completed') {
    return {
      status: 'payout_requested',
      paidOutAmount: existingPayout.amount,
    };
  }

  try {
    if (existingPayout?.status === 'failed') {
      await setPayoutPendingByBookingId(input.bookingId, transferReference);
    }
    else {
      await createPayout({
        bookingId: booking._id,
        hostId: booking.hostId,
        amount: booking.payoutAmount,
        status: 'pending',
        transferReference,
      });
    }
  }
  catch (error: unknown) {
    const mongoError = error as MongoServerError;
    if (mongoError?.code !== 11000) {
      throw error;
    }
  }

  await processHostPayoutRequest(input.bookingId);

  const refreshedBooking = await findBookingById(input.bookingId);
  if (!refreshedBooking) {
    throw new AppError('Booking not found after payout request', 500, 'BOOKING_UPDATE_FAILED');
  }

  return {
    status: refreshedBooking.status === BookingStatus.PAID_OUT ? 'paid_out' : 'payout_requested',
    paidOutAmount: booking.payoutAmount,
  };
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

  if (booking.status === BookingStatus.CONFIRMED) {
    await refundBookingPayment(bookingId);
  }

  await transitionBooking(bookingId, to);
  return { status: to };
}

export async function escalateExpiredBookings(): Promise<number> {
  return 0;
}
