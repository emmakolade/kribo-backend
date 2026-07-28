import { Types } from 'mongoose';
import type { UserRole } from '../constants/enums';
import { UserModel, type UserDocument } from '../models/user.model';

interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
}

export async function createUser(data: CreateUserInput): Promise<UserDocument> {
  const created = await UserModel.create(data);
  return created.toObject() as unknown as UserDocument;
}

export async function findUserByEmail(email: string): Promise<UserDocument | null> {
  return UserModel.findOne({ email }).lean<UserDocument | null>();
}

export async function findUserById(userId: string): Promise<UserDocument | null> {
  return UserModel.findById(new Types.ObjectId(userId)).lean<UserDocument | null>();
}

export async function updateHostVerification(
  userId: string,
  bvn: string,
  idDocumentUrl: string,
): Promise<UserDocument | null> {
  return UserModel.findByIdAndUpdate(
    new Types.ObjectId(userId),
    { hostVerified: true, bvn, idDocumentUrl },
    { returnDocument: 'after' },
  ).lean<UserDocument | null>();
}

export async function updateUserById(
  userId: string,
  updates: Record<string, unknown>,
): Promise<UserDocument | null> {
  return UserModel.findByIdAndUpdate(
    new Types.ObjectId(userId),
    { $set: updates },
    { returnDocument: 'after' },
  ).lean<UserDocument | null>();
}

export async function updateUserPasswordByEmail(
  email: string,
  passwordHash: string,
): Promise<UserDocument | null> {
  return UserModel.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { passwordHash } },
    { returnDocument: 'after' },
  ).lean<UserDocument | null>();
}

export async function updateUserPasswordById(
  userId: string,
  passwordHash: string,
): Promise<UserDocument | null> {
  return UserModel.findByIdAndUpdate(
    new Types.ObjectId(userId),
    { $set: { passwordHash } },
    { returnDocument: 'after' },
  ).lean<UserDocument | null>();
}

export async function listUnverifiedHosts(): Promise<UserDocument[]> {
  return UserModel.find({ role: 'host', hostVerified: false }).lean<UserDocument[]>();
}
