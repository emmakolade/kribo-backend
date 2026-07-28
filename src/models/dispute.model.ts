import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const disputeSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', required: true, index: true },
    resolutionNotes: { type: String },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type DisputeDocument = InferSchemaType<typeof disputeSchema> & { _id: Types.ObjectId };
export const DisputeModel = model('Dispute', disputeSchema);
