import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  EMAIL_OTP_EXPIRY_MINUTES,
  EMAIL_OTP_LENGTH,
  EMAIL_OTP_MAX_ATTEMPTS,
  REFRESH_TOKEN_EXPIRES_IN,
} from '../config/constants';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import {
  createUser,
  findUserByEmail,
  findUserById,
  updateHostVerification,
  updateUserById,
  updateUserPasswordById,
  updateUserPasswordByEmail,
} from '../repositories/users.repository';
import {
  createEmailOtp,
  getLatestActiveEmailOtp,
  getLatestVerifiedEmailOtp,
  incrementEmailOtpAttempts,
  invalidateActiveEmailOtps,
  markEmailOtpConsumed,
  markEmailOtpVerified,
} from '../repositories/emailOtp.repository';
import { emailService } from './email.service';
import type { EmailSendResult } from './email.service';
import { paystackService } from './paystack.service';
import type {
  ForgotPasswordRequestDto,
  ForgotPasswordResetDto,
  ChangePasswordDto,
  GuestProfileOnboardingDto,
  HostBankAccountOnboardingDto,
  HostBusinessContactOnboardingDto,
  HostManagerOnboardingDto,
  HostServiceAgreementOnboardingDto,
  ResolveBankAccountNameDto,
  RegisterInput,
  SendEmailOtpInput,
  AuthMeResponseDto,
  BankOptionDto,
  ProfileResponseDto,
  UpdateProfileDto,
  UserRole,
  VerifyEmailOtpInput,
} from '../types/auth';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function issueAuthTokens(userId: string, role: UserRole): AuthTokens {
  const accessToken = jwt.sign({ sub: userId, role, tokenType: 'access' }, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
  const refreshToken = jwt.sign({ sub: userId, role, tokenType: 'refresh' }, env.JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function splitName(fullName: string | undefined): { firstName: string; lastName: string } {
  const normalized = (fullName ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return {
      firstName: 'Kribo',
      lastName: 'User',
    };
  }

  const parts = normalized.split(' ');
  const firstName = parts[0] ?? 'Kribo';
  const lastName = parts.slice(1).join(' ') || 'User';

  return { firstName, lastName };
}

async function requireRegisterOtpVerification(email: string): Promise<string> {
  const verifiedOtp = await getLatestVerifiedEmailOtp(email, 'register');
  if (!verifiedOtp) {
    throw new AppError('Email must be verified before registration', 400, 'EMAIL_NOT_VERIFIED');
  }

  return String(verifiedOtp._id);
}

function generateOtp(length: number): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(crypto.randomInt(min, max));
}

function hashOtp(email: string, otp: string): string {
  const otpSecret = env.EMAIL_OTP_SECRET ?? env.JWT_SECRET;
  return crypto.createHash('sha256').update(`${email}:${otp}:${otpSecret}`).digest('hex');
}

export async function register(input: RegisterInput): Promise<AuthTokens> {
  const email = normalizeEmail(input.email);
  const verifiedOtpId = await requireRegisterOtpVerification(email);

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError('Email already exists', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const user = await createUser({
    name: fullName,
    email,
    passwordHash,
    role: input.role,
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  await markEmailOtpConsumed(verifiedOtpId);

  return issueAuthTokens(String(user._id), user.role);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthTokens> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  return issueAuthTokens(String(user._id), user.role);
}

export async function verifyHost(input: {
  userId: string;
  bvn: string;
  idDocumentUrl: string;
}): Promise<void> {
  const updated = await updateHostVerification(input.userId, input.bvn, input.idDocumentUrl);
  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function sendEmailOtp(input: SendEmailOtpInput): Promise<{ ok: true; expiresInSeconds: number; email: EmailSendResult }> {
  const email = normalizeEmail(input.email);

  if (input.purpose === 'register') {
    const existing = await findUserByEmail(email);
    if (existing) {
      throw new AppError('You already have an account. Please sign in instead.', 409, 'ACCOUNT_ALREADY_EXISTS');
    }
  }

  const otp = generateOtp(EMAIL_OTP_LENGTH);
  const otpHash = hashOtp(email, otp);
  const expiresAt = new Date(Date.now() + EMAIL_OTP_EXPIRY_MINUTES * 60 * 1000);

  await invalidateActiveEmailOtps(email, input.purpose);

  await createEmailOtp({
    email,
    purpose: input.purpose,
    otpHash,
    expiresAt,
  });

  const emailResult = await emailService.sendOtpEmail({
    to: email,
    otp,
    purpose: input.purpose,
  });

  return { ok: true, expiresInSeconds: EMAIL_OTP_EXPIRY_MINUTES * 60, email: emailResult };
}

export async function verifyEmailOtp(input: VerifyEmailOtpInput): Promise<{ ok: true }> {
  const email = normalizeEmail(input.email);
  const otpRecord = await getLatestActiveEmailOtp(email, input.purpose);

  if (!otpRecord) {
    throw new AppError('OTP is invalid or expired', 400, 'OTP_INVALID_OR_EXPIRED');
  }

  if (otpRecord.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    throw new AppError('Maximum OTP attempts exceeded', 429, 'OTP_ATTEMPTS_EXCEEDED');
  }

  const inputHash = hashOtp(email, input.otp);
  if (inputHash !== otpRecord.otpHash) {
    await incrementEmailOtpAttempts(String(otpRecord._id));
    throw new AppError('OTP is invalid or expired', 400, 'OTP_INVALID_OR_EXPIRED');
  }

  await markEmailOtpVerified(String(otpRecord._id));
  return { ok: true };
}

export async function completeHostBusinessContact(userId: string, input: HostBusinessContactOnboardingDto): Promise<void> {
  const updated = await updateUserById(userId, {
    'hostCompliance.businessContact.businessPhoneNumber': input.businessPhoneNumber,
    'hostCompliance.businessContact.trustedWhatsappNumber': input.trustedWhatsappNumber,
    'hostCompliance.businessContact.officeAddress': input.officeAddress,
    'hostCompliance.businessContact.officeLga': input.officeLga,
    'hostCompliance.businessContact.officeState': input.officeState,
    'hostCompliance.businessContact.website': input.website,
    'hostCompliance.businessContact.completedAt': new Date(),
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function completeHostManager(userId: string, input: HostManagerOnboardingDto): Promise<void> {
  const updated = await updateUserById(userId, {
    'hostCompliance.manager.managerName': input.managerName,
    'hostCompliance.manager.dateOfBirth': new Date(input.dateOfBirth),
    'hostCompliance.manager.nationality': input.nationality,
    'hostCompliance.manager.ninNumber': input.ninNumber,
    'hostCompliance.manager.ninDocumentUrl': input.ninDocumentUrl,
    'hostCompliance.manager.managerHomeAddress': input.managerHomeAddress,
    'hostCompliance.manager.proofOfAddressUrl': input.proofOfAddressUrl,
    'hostCompliance.manager.completedAt': new Date(),
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function completeHostBankAccount(userId: string, input: HostBankAccountOnboardingDto): Promise<void> {
  const updated = await updateUserById(userId, {
    bankDetails: {
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
      accountName: input.accountName,
    },
    'hostCompliance.bankAccount.accountNumber': input.accountNumber,
    'hostCompliance.bankAccount.bankCode': input.bankCode,
    'hostCompliance.bankAccount.accountName': input.accountName,
    'hostCompliance.bankAccount.verificationStatus': 'pending_manual_review',
    'hostCompliance.bankAccount.completedAt': new Date(),
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function resolveBankAccountName(
  input: ResolveBankAccountNameDto,
): Promise<{ accountNumber: string; accountName: string; bankCode: string }> {
  return paystackService.resolveAccountName({
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
  });
}

export async function listHostBanks(): Promise<BankOptionDto[]> {
  return paystackService.listBanks();
}

export async function getAuthMe(userId: string): Promise<AuthMeResponseDto> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const { firstName, lastName } = splitName(user.name);

  const hostDetails = {
    businessPhoneNumber: user.hostCompliance?.businessContact?.businessPhoneNumber ?? '',
    trustedWhatsappNumber: user.hostCompliance?.businessContact?.trustedWhatsappNumber ?? '',
    officeAddress: user.hostCompliance?.businessContact?.officeAddress ?? '',
    officeLga: user.hostCompliance?.businessContact?.officeLga ?? '',
    officeState: user.hostCompliance?.businessContact?.officeState ?? '',
    website: user.hostCompliance?.businessContact?.website ?? '',
    managerName: user.hostCompliance?.manager?.managerName ?? '',
    dateOfBirth: user.hostCompliance?.manager?.dateOfBirth
      ? new Date(user.hostCompliance.manager.dateOfBirth).toISOString().slice(0, 10)
      : '',
    nationality: user.hostCompliance?.manager?.nationality ?? '',
    ninNumber: user.hostCompliance?.manager?.ninNumber ?? '',
    managerHomeAddress: user.hostCompliance?.manager?.managerHomeAddress ?? '',
    accountNumber: user.hostCompliance?.bankAccount?.accountNumber ?? '',
    bankCode: user.hostCompliance?.bankAccount?.bankCode ?? '',
    accountName: user.hostCompliance?.bankAccount?.accountName ?? '',
    serviceAgreementAccepted: user.hostCompliance?.serviceAgreement?.accepted === true,
  };

  const hasHostDetails = Object.entries(hostDetails).some(([key, value]) => {
    if (key === 'serviceAgreementAccepted') {
      return value === true;
    }

    return typeof value === 'string' && value.trim().length > 0;
  });

  const guestDetails = {
    phoneNumber: user.guestOnboarding?.phoneNumber ?? '',
    isWhatsappNumber: user.guestOnboarding?.isWhatsappNumber === true,
    whatsappNumber: user.guestOnboarding?.whatsappNumber ?? '',
    ninNumber: user.guestOnboarding?.ninNumber ?? '',
  };

  const hasGuestDetails = Object.values(guestDetails).some((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    return value.trim().length > 0;
  });

  return {
    user: {
      id: String(user._id),
      role: user.role,
      firstName,
      lastName,
      email: user.email,
      phoneNumber: user.phoneNumber ?? '',
    },
    hostOnboarding: {
      propertyName: user.hostOnboarding?.propertyName ?? '',
      propertyType: user.hostOnboarding?.propertyType === 'shortlet' ? 'shortlet' : 'hotel',
      status: {
        completed: user.hostCompliance?.isBusinessActive === true,
        details: hasHostDetails ? hostDetails : null,
      },
    },
    guestOnboarding: {
      status: {
        completed: Boolean(user.guestOnboarding?.completedAt),
        details: hasGuestDetails ? guestDetails : null,
      },
    },
  };
}

export async function completeHostServiceAgreement(userId: string, input: HostServiceAgreementOnboardingDto): Promise<void> {
  if (!input.accepted) {
    throw new AppError('Service agreement must be accepted to continue', 400, 'SERVICE_AGREEMENT_REQUIRED');
  }

  const updated = await updateUserById(userId, {
    'hostCompliance.serviceAgreement.accepted': true,
    'hostCompliance.serviceAgreement.acceptedAt': new Date(),
    'hostCompliance.serviceAgreement.version': 'v1',
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function activateHostBusiness(userId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const businessStepDone = Boolean(user.hostCompliance?.businessContact?.completedAt);
  const managerStepDone = Boolean(user.hostCompliance?.manager?.completedAt);
  const bankStepDone = Boolean(user.hostCompliance?.bankAccount?.completedAt);
  const agreementStepDone = user.hostCompliance?.serviceAgreement?.accepted === true;

  if (!businessStepDone || !managerStepDone || !bankStepDone || !agreementStepDone) {
    throw new AppError('Complete all host onboarding steps before activation', 400, 'HOST_ONBOARDING_INCOMPLETE');
  }

  const updated = await updateUserById(userId, {
    hostVerified: true,
    'hostCompliance.isBusinessActive': true,
    'hostCompliance.activatedAt': new Date(),
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function completeGuestProfile(userId: string, input: GuestProfileOnboardingDto): Promise<void> {
  if (!input.isWhatsappNumber && !input.whatsappNumber) {
    throw new AppError('whatsappNumber is required when isWhatsappNumber is false', 400, 'WHATSAPP_NUMBER_REQUIRED');
  }

  const resolvedWhatsappNumber = input.isWhatsappNumber ? input.phoneNumber : input.whatsappNumber;

  const updated = await updateUserById(userId, {
    phoneNumber: input.phoneNumber,
    'guestOnboarding.phoneNumber': input.phoneNumber,
    'guestOnboarding.isWhatsappNumber': input.isWhatsappNumber,
    'guestOnboarding.whatsappNumber': resolvedWhatsappNumber,
    'guestOnboarding.ninNumber': input.ninNumber,
    'guestOnboarding.ninDocumentUrl': input.ninDocumentUrl,
    'guestOnboarding.verified': false,
    'guestOnboarding.completedAt': new Date(),
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function getProfile(userId: string): Promise<ProfileResponseDto> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const { firstName, lastName } = splitName(user.name);

  return {
    id: String(user._id),
    role: user.role,
    firstName,
    lastName,
    email: user.email,
    phoneNumber: user.phoneNumber ?? '',
  };
}

export async function updateProfile(userId: string, input: UpdateProfileDto): Promise<ProfileResponseDto> {
  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const updated = await updateUserById(userId, {
    name: fullName,
    phoneNumber: input.phoneNumber?.trim() ?? '',
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const { firstName, lastName } = splitName(updated.name);

  return {
    id: String(updated._id),
    role: updated.role,
    firstName,
    lastName,
    email: updated.email,
    phoneNumber: updated.phoneNumber ?? '',
  };
}

export async function changePassword(userId: string, input: ChangePasswordDto): Promise<void> {
  if (input.newPassword !== input.confirmPassword) {
    throw new AppError('newPassword and confirmPassword must match', 400, 'PASSWORD_CONFIRM_MISMATCH');
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const currentMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updated = await updateUserPasswordById(userId, passwordHash);

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function requestForgotPasswordOtp(
  input: ForgotPasswordRequestDto,
): Promise<{ ok: true; expiresInSeconds: number; email?: EmailSendResult }> {
  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(email);

  if (!user) {
    return { ok: true, expiresInSeconds: EMAIL_OTP_EXPIRY_MINUTES * 60 };
  }

  const otp = generateOtp(EMAIL_OTP_LENGTH);
  const otpHash = hashOtp(email, otp);
  const expiresAt = new Date(Date.now() + EMAIL_OTP_EXPIRY_MINUTES * 60 * 1000);

  await invalidateActiveEmailOtps(email, 'forgot_password');
  await createEmailOtp({
    email,
    purpose: 'forgot_password',
    otpHash,
    expiresAt,
  });

  const emailResult = await emailService.sendOtpEmail({
    to: email,
    otp,
    purpose: 'forgot_password',
  });

  return { ok: true, expiresInSeconds: EMAIL_OTP_EXPIRY_MINUTES * 60, email: emailResult };
}

export async function resetPasswordWithOtp(input: ForgotPasswordResetDto): Promise<AuthTokens> {
  const email = normalizeEmail(input.email);
  if (input.newPassword !== input.confirmPassword) {
    throw new AppError('newPassword and confirmPassword must match', 400, 'PASSWORD_CONFIRM_MISMATCH');
  }

  const otpRecord = await getLatestActiveEmailOtp(email, 'forgot_password');
  if (!otpRecord) {
    throw new AppError('OTP is invalid or expired', 400, 'OTP_INVALID_OR_EXPIRED');
  }

  if (otpRecord.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    throw new AppError('Maximum OTP attempts exceeded', 429, 'OTP_ATTEMPTS_EXCEEDED');
  }

  const inputHash = hashOtp(email, input.otp);
  if (inputHash !== otpRecord.otpHash) {
    await incrementEmailOtpAttempts(String(otpRecord._id));
    throw new AppError('OTP is invalid or expired', 400, 'OTP_INVALID_OR_EXPIRED');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updated = await updateUserPasswordByEmail(email, passwordHash);
  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await markEmailOtpConsumed(String(otpRecord._id));
  return issueAuthTokens(String(updated._id), updated.role);
}
