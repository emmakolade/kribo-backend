import { Types } from 'mongoose';
import type { EmailOtpPurpose } from '../constants/enums';
import { EmailOtpModel, type EmailOtpDocument } from '../models/emailOtp.model';

interface CreateEmailOtpInput {
  email: string;
  purpose: EmailOtpPurpose;
  otpHash: string;
  expiresAt: Date;
}

export async function createEmailOtp(input: CreateEmailOtpInput): Promise<EmailOtpDocument> {
  const created = await EmailOtpModel.create({
    email: input.email,
    purpose: input.purpose,
    otpHash: input.otpHash,
    expiresAt: input.expiresAt,
  });
  return created.toObject() as unknown as EmailOtpDocument;
}

export async function getLatestActiveEmailOtp(email: string, purpose: EmailOtpPurpose): Promise<EmailOtpDocument | null> {
  return EmailOtpModel.findOne({
    email,
    purpose,
    verifiedAt: null,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean<EmailOtpDocument | null>();
}

export async function getLatestVerifiedEmailOtp(email: string, purpose: EmailOtpPurpose): Promise<EmailOtpDocument | null> {
  return EmailOtpModel.findOne({
    email,
    purpose,
    verifiedAt: { $ne: null },
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean<EmailOtpDocument | null>();
}

export async function incrementEmailOtpAttempts(otpId: string): Promise<void> {
  await EmailOtpModel.findByIdAndUpdate(new Types.ObjectId(otpId), { $inc: { attempts: 1 } });
}

export async function markEmailOtpVerified(otpId: string): Promise<void> {
  await EmailOtpModel.findByIdAndUpdate(new Types.ObjectId(otpId), { verifiedAt: new Date() });
}

export async function markEmailOtpConsumed(otpId: string): Promise<void> {
  await EmailOtpModel.findByIdAndUpdate(new Types.ObjectId(otpId), { consumedAt: new Date() });
}

export async function invalidateActiveEmailOtps(email: string, purpose: EmailOtpPurpose): Promise<void> {
  await EmailOtpModel.updateMany(
    {
      email,
      purpose,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      consumedAt: new Date(),
    },
  );
}
