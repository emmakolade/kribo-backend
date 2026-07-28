import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { PROPERTY_TYPES, USER_ROLES } from '../constants/enums';

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    phoneNumber: { type: String },
    role: { type: String, enum: USER_ROLES, default: 'guest', required: true },
    hostOnboarding: {
      propertyName: { type: String },
      propertyType: { type: String, enum: PROPERTY_TYPES },
    },
    hostCompliance: {
      businessContact: {
        businessPhoneNumber: { type: String },
        trustedWhatsappNumber: { type: String },
        officeAddress: { type: String },
        officeLga: { type: String },
        officeState: { type: String },
        website: { type: String },
        completedAt: { type: Date },
      },
      manager: {
        managerName: { type: String },
        dateOfBirth: { type: Date },
        nationality: { type: String },
        ninNumber: { type: String },
        ninDocumentUrl: { type: String },
        managerHomeAddress: { type: String },
        proofOfAddressUrl: { type: String },
        completedAt: { type: Date },
      },
      bankAccount: {
        accountNumber: { type: String },
        bankCode: { type: String },
        accountName: { type: String },
        verificationStatus: { type: String, default: 'pending_manual_review' },
        completedAt: { type: Date },
      },
      serviceAgreement: {
        accepted: { type: Boolean, default: false },
        acceptedAt: { type: Date },
        version: { type: String },
      },
      isBusinessActive: { type: Boolean, default: false },
      activatedAt: { type: Date },
    },
    guestOnboarding: {
      phoneNumber: { type: String },
      isWhatsappNumber: { type: Boolean, default: false },
      whatsappNumber: { type: String },
      ninNumber: { type: String },
      ninDocumentUrl: { type: String },
      verified: { type: Boolean, default: false },
      completedAt: { type: Date },
    },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    hostVerified: { type: Boolean, default: false },
    bvn: { type: String },
    idDocumentUrl: { type: String },
    bankDetails: {
      accountNumber: { type: String },
      bankCode: { type: String },
      accountName: { type: String },
      recipientCode: { type: String },
    },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export const UserModel = model('User', userSchema);
