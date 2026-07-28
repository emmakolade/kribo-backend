import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const availabilitySchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['open', 'blocked'], required: true, default: 'open' },
    holdToken: { type: String, default: null },
  },
  { timestamps: true },
);

availabilitySchema.index({ unitId: 1, date: 1 }, { unique: true });

export type AvailabilityDocument = InferSchemaType<typeof availabilitySchema> & { _id: Types.ObjectId };
export const AvailabilityModel = model('Availability', availabilitySchema);
