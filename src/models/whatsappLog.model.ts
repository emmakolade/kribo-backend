import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const whatsappLogSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    messageType: { type: String, required: true },
    sentAt: { type: Date, required: true, default: Date.now },
    responsePayload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export type WhatsappLogDocument = InferSchemaType<typeof whatsappLogSchema> & { _id: Types.ObjectId };
export const WhatsappLogModel = model('WhatsappLog', whatsappLogSchema);
