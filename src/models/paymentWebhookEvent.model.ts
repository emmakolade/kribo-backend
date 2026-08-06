import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const paymentWebhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ['paystack'], required: true, default: 'paystack' },
    externalEventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    gatewayReference: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    processedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true },
);

export type PaymentWebhookEventDocument = InferSchemaType<typeof paymentWebhookEventSchema> & { _id: Types.ObjectId };
export const PaymentWebhookEventModel = model('PaymentWebhookEvent', paymentWebhookEventSchema);
