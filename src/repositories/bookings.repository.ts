import { Types } from 'mongoose';
import crypto from 'crypto';
import { AvailabilityModel } from '../models/availability.model';
import { BookingModel, type BookingDocument } from '../models/booking.model';
import { BookingStatus } from '../types/booking';

export async function createBooking(data: Partial<BookingDocument>): Promise<BookingDocument> {
  const created = await BookingModel.create(data);
  return created.toObject() as unknown as BookingDocument;
}

export async function findBookingById(bookingId: string): Promise<BookingDocument | null> {
  return BookingModel.findById(new Types.ObjectId(bookingId)).lean<BookingDocument | null>();
}

export async function findBookingByPaystackReference(reference: string): Promise<BookingDocument | null> {
  return BookingModel.findOne({ paystackReference: reference }).lean<BookingDocument | null>();
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<BookingDocument | null> {
  return BookingModel.findByIdAndUpdate(
    new Types.ObjectId(bookingId),
    {
      status,
      $push: {
        stateHistory: {
          status,
          timestamp: new Date(),
        },
      },
    },
    { returnDocument: 'after' },
  ).lean<BookingDocument | null>();
}

export async function setBookingWebhookProcessed(
  bookingId: string,
  webhookId: string,
): Promise<BookingDocument | null> {
  return BookingModel.findByIdAndUpdate(
    new Types.ObjectId(bookingId),
    { lastWebhookId: webhookId },
    { returnDocument: 'after' },
  ).lean<BookingDocument | null>();
}

export async function markCheckIn(bookingId: string): Promise<BookingDocument | null> {
  return BookingModel.findByIdAndUpdate(
    new Types.ObjectId(bookingId),
    {
      status: BookingStatus.CHECKED_IN,
      checkInMarkedAt: new Date(),
      $push: { stateHistory: { status: BookingStatus.CHECKED_IN, timestamp: new Date() } },
    },
    { returnDocument: 'after' },
  ).lean<BookingDocument | null>();
}

export async function findBookingsByStatus(status: BookingStatus): Promise<BookingDocument[]> {
  return BookingModel.find({ status }).lean<BookingDocument[]>();
}

export async function findCompletedBookingsForPayout(
  payoutHoldDays: number,
): Promise<BookingDocument[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - payoutHoldDays);

  return BookingModel.find({
    status: BookingStatus.COMPLETED,
    checkInMarkedAt: { $lte: cutoff },
  }).lean<BookingDocument[]>();
}

export async function holdAvailabilityAtomic(unitId: string, dates: Date[]): Promise<boolean> {
  const holdToken = crypto.randomUUID();

  const results = await Promise.all(
    dates.map((date) =>
      AvailabilityModel.findOneAndUpdate(
        { unitId: new Types.ObjectId(unitId), date, status: 'open', holdToken: null },
        { status: 'blocked', holdToken },
        { returnDocument: 'after' },
      ).lean(),
    ),
  );

  const failed = results.some((doc) => !doc);
  if (failed) {
    await Promise.all(
      dates.map((date) =>
        AvailabilityModel.findOneAndUpdate(
          { unitId: new Types.ObjectId(unitId), date, status: 'blocked', holdToken },
          { status: 'open', holdToken: null },
        ).lean(),
      ),
    );
    return false;
  }

  await Promise.all(
    dates.map((date) =>
      AvailabilityModel.findOneAndUpdate(
        { unitId: new Types.ObjectId(unitId), date, status: 'blocked', holdToken },
        { holdToken: null },
      ).lean(),
    ),
  );

  return true;
}
