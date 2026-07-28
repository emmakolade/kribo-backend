import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const payoutSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending', required: true },
    transferReference: { type: String, required: true },
  },
  { timestamps: true },
);

export type PayoutDocument = InferSchemaType<typeof payoutSchema> & { _id: Types.ObjectId };
export const PayoutModel = model('Payout', payoutSchema);
