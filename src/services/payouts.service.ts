import { Types } from 'mongoose';
import { BookingModel } from '../models/booking.model';
import {
  completePayoutByBookingId,
  failPayoutByBookingId,
  findPayoutByBookingId,
  listPendingPayoutsByHost,
  listPayoutsByHost,
} from '../repositories/payouts.repository';
import { findUserById } from '../repositories/users.repository';
import { BookingStatus } from '../types/booking';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { paystackService } from './paystack.service';

async function markBookingPaidOut(bookingId: string): Promise<void> {
  const booking = await BookingModel.findById(bookingId).lean();
  if (!booking || booking.status === BookingStatus.PAID_OUT) {
    return;
  }

  if (booking.status === BookingStatus.CHECKED_IN) {
    await BookingModel.findByIdAndUpdate(bookingId, {
      status: BookingStatus.COMPLETED,
      $push: { stateHistory: { status: BookingStatus.COMPLETED, timestamp: new Date() } },
    });
  }

  await BookingModel.findByIdAndUpdate(bookingId, {
    status: BookingStatus.PAID_OUT,
    $push: { stateHistory: { status: BookingStatus.PAID_OUT, timestamp: new Date() } },
  });
}

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
    await markBookingPaidOut(bookingId);
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

  const transfer = await paystackService.transferToHost({
    amount: booking.payoutAmount,
    recipientCode: host.bankDetails.recipientCode,
    reason: `Payout for booking ${String(booking._id)}`,
  });

  await completePayoutByBookingId(bookingId, transfer.transferReference);
  await markBookingPaidOut(bookingId);
  logger.info({ bookingId }, 'host payout transfer completed and booking marked paid out');
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
