import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
  REFUNDED = 'refunded',
}

const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['paystack'], required: true, default: 'paystack' },
    internalReference: { type: String, required: true, unique: true, index: true },
    gatewayReference: { type: String, required: true, unique: true, index: true },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, default: 'NGN' },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      required: true,
      default: PaymentStatus.PENDING,
      index: true,
    },
    channel: { type: String },
    paidAt: { type: Date },
    refundedAt: { type: Date },
    latestGatewayStatus: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

paymentSchema.index({ bookingId: 1, createdAt: -1 });

export type PaymentDocument = InferSchemaType<typeof paymentSchema> & { _id: Types.ObjectId };
export const PaymentModel = model('Payment', paymentSchema);
