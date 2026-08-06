import crypto from 'crypto';
import { MongoServerError } from 'mongodb';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { PaymentModel, PaymentStatus } from '../models/payment.model';
import { PaymentWebhookEventModel } from '../models/paymentWebhookEvent.model';
import { findBookingById, updateBookingStatus } from '../repositories/bookings.repository';
import { findUserById } from '../repositories/users.repository';
import { publishBookingEvent } from '../queue/bookingEvents.producer';
import { BookingStatus, canTransition } from '../types/booking';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { paystackService } from './paystack.service';

function toMinorAmount(amountNgn: number): number {
  return Math.round(amountNgn * 100);
}

function generateInternalReference(bookingId: string): string {
  const bookingSuffix = bookingId.replace(/[^a-zA-Z0-9]/g, '').slice(-4) || 'bkng';
  const timeToken = Date.now().toString(36);
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `kp_${bookingSuffix}_${timeToken}_${randomSuffix}`;
}

async function transitionBookingForPayment(bookingId: string, to: BookingStatus): Promise<void> {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (!canTransition(booking.status, to)) {
    return;
  }

  await updateBookingStatus(bookingId, to);
}

async function markPaymentFromVerify(reference: string): Promise<PaymentStatus> {
  const payment = await PaymentModel.findOne({ gatewayReference: reference }).lean();
  if (!payment) {
    throw new AppError('Payment reference not found', 404, 'PAYMENT_NOT_FOUND');
  }

  if (payment.status !== PaymentStatus.PENDING) {
    return payment.status;
  }

  const verification = await paystackService.verifyTransaction(reference);
  const gatewayStatus = verification.status;
  const normalizedStatus = gatewayStatus.toLowerCase();

  if (normalizedStatus === 'success') {
    const updated = await PaymentModel.findOneAndUpdate(
      { gatewayReference: reference, status: PaymentStatus.PENDING },
      {
        status: PaymentStatus.SUCCESS,
        paidAt: verification.paidAt ?? new Date(),
        latestGatewayStatus: gatewayStatus,
      },
      { returnDocument: 'after' },
    ).lean();

    if (!updated) {
      const latest = await PaymentModel.findOne({ gatewayReference: reference }).lean();
      return latest?.status ?? PaymentStatus.PENDING;
    }

    await transitionBookingForPayment(String(payment.bookingId), BookingStatus.CONFIRMED);
    await publishBookingEvent('booking.confirmed', {
      bookingId: String(payment.bookingId),
    });

    return PaymentStatus.SUCCESS;
  }

  if (['failed', 'abandoned', 'reversed'].includes(normalizedStatus)) {
    const failedStatus = normalizedStatus === 'abandoned' ? PaymentStatus.ABANDONED : PaymentStatus.FAILED;

    const updated = await PaymentModel.findOneAndUpdate(
      { gatewayReference: reference, status: PaymentStatus.PENDING },
      {
        status: failedStatus,
        latestGatewayStatus: gatewayStatus,
      },
      { returnDocument: 'after' },
    ).lean();

    if (!updated) {
      const latest = await PaymentModel.findOne({ gatewayReference: reference }).lean();
      return latest?.status ?? PaymentStatus.PENDING;
    }

    await transitionBookingForPayment(String(payment.bookingId), BookingStatus.PAYMENT_FAILED);
    return failedStatus;
  }

  await PaymentModel.findOneAndUpdate(
    { gatewayReference: reference },
    { latestGatewayStatus: gatewayStatus },
  ).lean();

  return PaymentStatus.PENDING;
}

export async function initializeBookingPayment(input: {
  bookingId: string;
  requesterId: string;
  requesterRole: 'guest' | 'admin';
  email?: string;
}): Promise<{
  bookingId: string;
  paymentReference: string;
  status: PaymentStatus;
  checkoutUrl: string;
}> {
  const booking = await findBookingById(input.bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const isAdmin = input.requesterRole === 'admin';
  const isGuestOwner = input.requesterRole === 'guest' && String(booking.guestId) === input.requesterId;
  if (!isAdmin && !isGuestOwner) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status !== BookingStatus.PENDING) {
    throw new AppError('Booking is not awaiting payment', 409, 'INVALID_BOOKING_STATE');
  }

  const existingPending = await PaymentModel.findOne({
    bookingId: booking._id,
    status: PaymentStatus.PENDING,
  }).sort({ createdAt: -1 }).lean();

  if (existingPending) {
    return {
      bookingId: String(booking._id),
      paymentReference: existingPending.gatewayReference,
      status: existingPending.status,
      checkoutUrl: String(existingPending.metadata?.checkoutUrl ?? ''),
    };
  }

  const guest = await findUserById(String(booking.guestId));
  const guestEmail = String(guest?.email ?? '').trim().toLowerCase();
  const fallbackEmail = input.email?.trim().toLowerCase();
  const checkoutEmail = fallbackEmail || guestEmail;

  if (!checkoutEmail) {
    throw new AppError('Please provide an email to continue payment', 400, 'INVALID_CHECKOUT_EMAIL');
  }

  const internalReference = generateInternalReference(String(booking._id));
  const initialized = await paystackService.initializeTransaction({
    reference: internalReference,
    email: checkoutEmail,
    amountMinor: toMinorAmount(booking.totalAmount),
    currency: 'NGN',
    callbackUrl: env.PAYSTACK_BOOKING_CALLBACK_URL,
    metadata: {
      bookingId: String(booking._id),
      guestId: String(booking.guestId),
      hostId: String(booking.hostId),
    },
  });

  await PaymentModel.create({
    bookingId: booking._id,
    guestId: new Types.ObjectId(String(booking.guestId)),
    provider: 'paystack',
    internalReference,
    gatewayReference: initialized.reference,
    amountMinor: toMinorAmount(booking.totalAmount),
    currency: 'NGN',
    status: PaymentStatus.PENDING,
    metadata: {
      checkoutUrl: initialized.authorizationUrl,
      accessCode: initialized.accessCode,
    },
  });

  return {
    bookingId: String(booking._id),
    paymentReference: initialized.reference,
    status: PaymentStatus.PENDING,
    checkoutUrl: initialized.authorizationUrl,
  };
}

export async function getPaymentStatusByReference(input: {
  paymentReference: string;
  requesterId: string;
  requesterRole: 'guest' | 'admin';
}): Promise<{
  bookingId: string;
  paymentReference: string;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
}> {
  const payment = await PaymentModel.findOne({ gatewayReference: input.paymentReference }).lean();
  if (!payment) {
    throw new AppError('Payment reference not found', 404, 'PAYMENT_NOT_FOUND');
  }

  const booking = await findBookingById(String(payment.bookingId));
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  const isAdmin = input.requesterRole === 'admin';
  const isGuestOwner = input.requesterRole === 'guest' && String(booking.guestId) === input.requesterId;
  if (!isAdmin && !isGuestOwner) {
    throw new AppError('Payment reference not found', 404, 'PAYMENT_NOT_FOUND');
  }

  let paymentStatus = payment.status;
  if (paymentStatus === PaymentStatus.PENDING) {
    paymentStatus = await markPaymentFromVerify(payment.gatewayReference);
  }

  const refreshedBooking = await findBookingById(String(payment.bookingId));
  if (!refreshedBooking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  return {
    bookingId: String(payment.bookingId),
    paymentReference: payment.gatewayReference,
    paymentStatus,
    bookingStatus: refreshedBooking.status,
  };
}

export async function getPaymentCallbackStatusByReference(input: {
  paymentReference: string;
}): Promise<{
  bookingId: string;
  paymentReference: string;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
}> {
  const payment = await PaymentModel.findOne({ gatewayReference: input.paymentReference }).lean();
  if (!payment) {
    throw new AppError('Payment reference not found', 404, 'PAYMENT_NOT_FOUND');
  }

  let paymentStatus = payment.status;
  if (paymentStatus === PaymentStatus.PENDING) {
    paymentStatus = await markPaymentFromVerify(payment.gatewayReference);
  }

  const refreshedBooking = await findBookingById(String(payment.bookingId));
  if (!refreshedBooking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  return {
    bookingId: String(payment.bookingId),
    paymentReference: payment.gatewayReference,
    paymentStatus,
    bookingStatus: refreshedBooking.status,
  };
}

export async function processPaystackWebhookEvent(input: {
  eventType: string;
  eventId: string;
  paymentReference: string;
  payload: Record<string, unknown>;
}): Promise<{ processed: boolean }> {
  if (!input.eventId) {
    return { processed: false };
  }

  try {
    await PaymentWebhookEventModel.create({
      provider: 'paystack',
      externalEventId: input.eventId,
      eventType: input.eventType,
      gatewayReference: input.paymentReference,
      payload: input.payload,
      processedAt: new Date(),
    });
  } catch (error) {
    const mongoError = error as MongoServerError;
    if (mongoError?.code === 11000) {
      logger.info({ eventId: input.eventId }, 'duplicate paystack webhook ignored');
      return { processed: true };
    }
    throw error;
  }

  const event = input.eventType.toLowerCase();
  if (event !== 'charge.success' && event !== 'charge.failed') {
    return { processed: true };
  }

  await markPaymentFromVerify(input.paymentReference);
  return { processed: true };
}

export async function refundBookingPayment(bookingId: string): Promise<void> {
  const payment = await PaymentModel.findOne({
    bookingId: new Types.ObjectId(bookingId),
    status: PaymentStatus.SUCCESS,
  }).sort({ paidAt: -1, createdAt: -1 }).lean();

  if (!payment) {
    throw new AppError('No successful payment found for booking', 409, 'PAYMENT_NOT_FOUND');
  }

  await paystackService.refundTransaction(payment.gatewayReference);

  await PaymentModel.findByIdAndUpdate(payment._id, {
    status: PaymentStatus.REFUNDED,
    refundedAt: new Date(),
  }).lean();
}
