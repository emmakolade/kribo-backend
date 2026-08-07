import { Types } from 'mongoose';
import { PayoutModel, type PayoutDocument } from '../models/payout.model';

export async function createPayout(data: Partial<PayoutDocument>): Promise<PayoutDocument> {
  const created = await PayoutModel.create(data);
  return created.toObject() as unknown as PayoutDocument;
}

export async function findPayoutByBookingId(bookingId: string): Promise<PayoutDocument | null> {
  return PayoutModel.findOne({ bookingId: new Types.ObjectId(bookingId) }).lean<PayoutDocument | null>();
}

export async function listPayoutsByHost(hostId: string): Promise<PayoutDocument[]> {
  return PayoutModel.find({ hostId: new Types.ObjectId(hostId) }).lean<PayoutDocument[]>();
}

export async function listPendingPayoutsByHost(hostId: string): Promise<PayoutDocument[]> {
  return PayoutModel.find({ hostId: new Types.ObjectId(hostId), status: 'pending' }).lean<PayoutDocument[]>();
}

export async function completePayoutByBookingId(
  bookingId: string,
  transferReference: string,
): Promise<PayoutDocument | null> {
  return PayoutModel.findOneAndUpdate(
    { bookingId: new Types.ObjectId(bookingId) },
    { status: 'completed', transferReference },
    { returnDocument: 'after' },
  ).lean<PayoutDocument | null>();
}

export async function setPayoutPendingByBookingId(
  bookingId: string,
  transferReference: string,
): Promise<PayoutDocument | null> {
  return PayoutModel.findOneAndUpdate(
    { bookingId: new Types.ObjectId(bookingId) },
    { status: 'pending', transferReference },
    { returnDocument: 'after' },
  ).lean<PayoutDocument | null>();
}

export async function failPayoutByBookingId(
  bookingId: string,
  transferReference: string,
): Promise<PayoutDocument | null> {
  return PayoutModel.findOneAndUpdate(
    { bookingId: new Types.ObjectId(bookingId) },
    { status: 'failed', transferReference },
    { returnDocument: 'after' },
  ).lean<PayoutDocument | null>();
}
