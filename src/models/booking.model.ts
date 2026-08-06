import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { BookingStatus } from '../types/booking';

const stateHistorySchema = new Schema(
  {
    status: { type: String, enum: Object.values(BookingStatus), required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    guestId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    commissionAmount: { type: Number, required: true, min: 0 },
    payoutAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      required: true,
      default: BookingStatus.PENDING,
      index: true,
    },
    stateHistory: { type: [stateHistorySchema], default: [] },
    lastWebhookId: { type: String },
    checkInMarkedAt: { type: Date },
    checkInReminderSentAt: { type: Date },
  },
  { timestamps: true },
);

export type BookingDocument = InferSchemaType<typeof bookingSchema> & { _id: Types.ObjectId };
export const BookingModel = model('Booking', bookingSchema);
