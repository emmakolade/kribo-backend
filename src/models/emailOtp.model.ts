import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { EMAIL_OTP_PURPOSES } from '../constants/enums';

const emailOtpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, enum: EMAIL_OTP_PURPOSES, required: true, index: true },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    verifiedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

emailOtpSchema.index({ email: 1, purpose: 1, createdAt: -1 });

export type EmailOtpDocument = InferSchemaType<typeof emailOtpSchema> & { _id: Types.ObjectId };
export const EmailOtpModel = model('EmailOtp', emailOtpSchema);
