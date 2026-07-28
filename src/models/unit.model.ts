import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const unitSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    name: { type: String, required: true },
    maxGuests: { type: Number, required: true, min: 1 },
    pricePerNight: { type: Number, required: true, min: 0 },
    photos: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length >= 3,
        message: 'A unit/room must have at least 3 photos',
      },
    },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type UnitDocument = InferSchemaType<typeof unitSchema> & { _id: Types.ObjectId };
export const UnitModel = model('Unit', unitSchema);
