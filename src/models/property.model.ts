import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { AMENITIES, PROPERTY_TYPES } from '../constants/enums';

const propertySchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    city: { type: String, required: true },
    area: { type: String, required: true },
    fullAddress: { type: String, required: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    amenities: { type: [{ type: String, enum: AMENITIES }], default: [] },
    photos: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length >= 2,
        message: 'At least two property photos are required',
      },
    },
    propertyType: { type: String, enum: PROPERTY_TYPES, required: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

propertySchema.index({ location: '2dsphere' });

export type PropertyDocument = InferSchemaType<typeof propertySchema> & { _id: Types.ObjectId };
export const PropertyModel = model('Property', propertySchema);
