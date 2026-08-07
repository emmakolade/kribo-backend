import { Types } from 'mongoose';
import { BookingModel } from '../models/booking.model';
import {
  failPayoutByBookingId,
  findPayoutByBookingId,
  listPendingPayoutsByHost,
  listPayoutsByHost,
} from '../repositories/payouts.repository';
import { findUserById } from '../repositories/users.repository';
import { env } from '../config/env';
import { BookingStatus } from '../types/booking';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { emailService } from './email.service';

export async function processHostPayoutRequest(bookingId: string): Promise<void> {
  const booking = await BookingModel.findById(bookingId).lean();
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (booking.status === BookingStatus.PAID_OUT) {
    return;
  }

  if (booking.status !== BookingStatus.CHECKED_IN && booking.status !== BookingStatus.COMPLETED) {
    throw new AppError('Booking is not ready for payout transfer', 409, 'BOOKING_NOT_READY_FOR_PAYOUT');
  }

  const payout = await findPayoutByBookingId(bookingId);
  if (!payout) {
    throw new AppError('Payout record not found for booking', 404, 'PAYOUT_NOT_FOUND');
  }

  if (payout.status === 'completed') {
    // Admin has already processed this payout manually.
    return;
  }

  if (payout.status === 'failed') {
    throw new AppError('Payout record is marked as failed', 409, 'PAYOUT_ALREADY_FAILED');
  }

  const host = await findUserById(String(booking.hostId));
  if (!host?.bankDetails?.recipientCode) {
    await failPayoutByBookingId(bookingId, `host_missing_recipient_${Date.now()}`);
    throw new AppError('Host bank payout details are missing', 409, 'HOST_PAYOUT_ACCOUNT_MISSING');
  }

  if (env.ADMIN_PAYOUT_NOTIFICATION_EMAILS.length === 0) {
    throw new AppError(
      'Admin payout notification emails are not configured',
      500,
      'ADMIN_PAYOUT_NOTIFICATION_EMAILS_NOT_CONFIGURED',
    );
  }

  // Automatic Paystack transfer is disabled. Admin now initiates payout manually.
  // const transfer = await paystackService.transferToHost({
  //   amount: booking.payoutAmount,
  //   recipientCode: host.bankDetails.recipientCode,
  //   reason: `Payout for booking ${String(booking._id)}`,
  // });
  // await completePayoutByBookingId(bookingId, transfer.transferReference);
  // await markBookingPaidOut(bookingId);

  await emailService.sendAdminManualPayoutRequestEmail({
    to: env.ADMIN_PAYOUT_NOTIFICATION_EMAILS,
    bookingId: String(booking._id),
    hostName: host.name,
    hostEmail: host.email,
    amount: booking.payoutAmount,
    recipientCode: host.bankDetails.recipientCode,
    transferReference: payout.transferReference,
  });

  logger.info({ bookingId }, 'manual payout email sent to admins');
}

export async function getHostEarnings(hostId: string): Promise<{
  pendingPayouts: number;
  completedPayouts: number;
  occupancyStats: { completedBookings: number };
}> {
  const pending = await listPendingPayoutsByHost(hostId);
  const all = await listPayoutsByHost(hostId);
  const completedBookings = await BookingModel.countDocuments({
    hostId: new Types.ObjectId(hostId),
    status: BookingStatus.COMPLETED,
  });

  return {
    pendingPayouts: pending.length,
    completedPayouts: all.filter((p) => p.status === 'completed').length,
    occupancyStats: { completedBookings },
  };
}

export async function markCompleted(bookingId: string): Promise<void> {
  const booking = await BookingModel.findById(bookingId).lean();
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  await BookingModel.findByIdAndUpdate(bookingId, {
    status: BookingStatus.COMPLETED,
    $push: { stateHistory: { status: BookingStatus.COMPLETED, timestamp: new Date() } },
  });
}
