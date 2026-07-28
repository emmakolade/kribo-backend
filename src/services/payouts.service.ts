import { Types } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { env } from '../config/env';
import { BookingModel } from '../models/booking.model';
import { createPayout, listPendingPayoutsByHost, listPayoutsByHost } from '../repositories/payouts.repository';
import { findUserById } from '../repositories/users.repository';
import { BookingStatus } from '../types/booking';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { paystackService } from './paystack.service';

export async function runDailyPayoutSweep(): Promise<{ paidOutCount: number }> {
  const bookings = await BookingModel.find({ status: BookingStatus.COMPLETED }).lean();
  let paidOutCount = 0;

  for (const booking of bookings) {
    const checkInMarkedAt = booking.checkInMarkedAt;
    if (!checkInMarkedAt) {
      continue;
    }

    const releaseDate = new Date(checkInMarkedAt);
    releaseDate.setDate(releaseDate.getDate() + env.PAYOUT_HOLD_DAYS);
    if (new Date() < releaseDate) {
      continue;
    }

    const host = await findUserById(String(booking.hostId));
    if (!host?.bankDetails?.recipientCode) {
      continue;
    }

    try {
      const transfer = await paystackService.transferToHost({
        amount: booking.payoutAmount,
        recipientCode: host.bankDetails.recipientCode,
        reason: `Payout for booking ${String(booking._id)}`,
      });

      await createPayout({
        bookingId: new Types.ObjectId(String(booking._id)),
        hostId: new Types.ObjectId(String(host._id)),
        amount: booking.payoutAmount,
        status: 'completed',
        transferReference: transfer.transferReference,
      });

      await BookingModel.findByIdAndUpdate(booking._id, {
        status: BookingStatus.PAID_OUT,
        $push: { stateHistory: { status: BookingStatus.PAID_OUT, timestamp: new Date() } },
      });

      logger.info({ bookingId: String(booking._id) }, 'payout completed');
      paidOutCount += 1;
    } catch (error: unknown) {
      const mongoError = error as MongoServerError;
      if (mongoError?.code === 11000) {
        logger.info({ bookingId: String(booking._id) }, 'duplicate payout prevented by unique index');
        continue;
      }
      throw error;
    }
  }

  return { paidOutCount };
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
