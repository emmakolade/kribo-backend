import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  EMAIL_OTP_EXPIRY_MINUTES,
  EMAIL_OTP_LENGTH,
  EMAIL_OTP_MAX_ATTEMPTS,
  REFRESH_TOKEN_EXPIRES_IN,
} from '../config/constants';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
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
import { normalizePhoneToE164 } from '../utils/phone';
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

type ProfileChangeSection = 'host_manager' | 'host_business_contact' | 'host_property' | 'guest_profile';

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

function normalizeIsoDate(dateValue: Date | string | undefined | null): string {
  if (!dateValue) {
    return '';
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function toComparableJson(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function hasPendingChangeRequest(user: Record<string, any>, section: ProfileChangeSection): boolean {
  const rows = Array.isArray(user.profileChangeRequests) ? user.profileChangeRequests : [];
  return rows.some((row) => row?.section === section && row?.status === 'pending');
}

async function queueProfileChangeRequest(input: {
  userId: string;
  requestedByUserId: string;
  section: ProfileChangeSection;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): Promise<void> {
  await UserModel.findByIdAndUpdate(
    new Types.ObjectId(input.userId),
    {
      $push: {
        profileChangeRequests: {
          section: input.section,
          status: 'pending',
          requestedByUserId: new Types.ObjectId(input.requestedByUserId),
          requestedAt: new Date(),
          oldValue: input.oldValue,
          newValue: input.newValue,
        },
      },
    },
    { returnDocument: 'after' },
  ).lean();
}

async function resolveBankNameByCode(bankCode: string): Promise<string> {
  const normalizedCode = bankCode.trim();
  if (!normalizedCode) {
    return '';
  }

  const banks = await paystackService.listBanks();
  const match = banks.find((bank) => bank.code === normalizedCode);
  return match?.name ?? '';
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

  if (user.isSuspended) {
    throw new AppError('Your account is suspended. Please contact support.', 403, 'ACCOUNT_SUSPENDED');
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
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const normalizedBusinessPhone = normalizePhoneToE164({
    rawPhone: input.businessPhoneNumber,
    countryIso: input.businessPhoneCountryIso,
    errorCode: 'INVALID_BUSINESS_PHONE_NUMBER',
    errorMessage: 'Enter a valid business phone number',
  });

  const normalizedTrustedWhatsapp = normalizePhoneToE164({
    rawPhone: input.trustedWhatsappNumber,
    countryIso: input.trustedWhatsappCountryIso,
    errorCode: 'INVALID_TRUSTED_WHATSAPP_NUMBER',
    errorMessage: 'Enter a valid trusted WhatsApp number',
  });

  const newValue = {
    businessPhoneNumber: normalizedBusinessPhone.e164,
    businessPhoneCountryIso: normalizedBusinessPhone.countryIso,
    businessPhoneCountryDialCode: normalizedBusinessPhone.countryDialCode,
    trustedWhatsappNumber: normalizedTrustedWhatsapp.e164,
    trustedWhatsappCountryIso: normalizedTrustedWhatsapp.countryIso,
    trustedWhatsappCountryDialCode: normalizedTrustedWhatsapp.countryDialCode,
    officeAddress: input.officeAddress,
    officeLga: input.officeLga,
    officeState: input.officeState,
    website: input.website ?? '',
  };

  const wasCompletedBefore = Boolean(user.hostCompliance?.businessContact?.completedAt);
  if (wasCompletedBefore) {
    if (hasPendingChangeRequest(user as Record<string, any>, 'host_business_contact')) {
      throw new AppError(
        'You already have a pending business-contact update awaiting admin approval.',
        409,
        'PROFILE_CHANGE_ALREADY_PENDING',
      );
    }

    const oldValue = {
      businessPhoneNumber: user.hostCompliance?.businessContact?.businessPhoneNumber ?? '',
      businessPhoneCountryIso: user.hostCompliance?.businessContact?.businessPhoneCountryIso ?? '',
      businessPhoneCountryDialCode: user.hostCompliance?.businessContact?.businessPhoneCountryDialCode ?? '',
      trustedWhatsappNumber: user.hostCompliance?.businessContact?.trustedWhatsappNumber ?? '',
      trustedWhatsappCountryIso: user.hostCompliance?.businessContact?.trustedWhatsappCountryIso ?? '',
      trustedWhatsappCountryDialCode: user.hostCompliance?.businessContact?.trustedWhatsappCountryDialCode ?? '',
      officeAddress: user.hostCompliance?.businessContact?.officeAddress ?? '',
      officeLga: user.hostCompliance?.businessContact?.officeLga ?? '',
      officeState: user.hostCompliance?.businessContact?.officeState ?? '',
      website: user.hostCompliance?.businessContact?.website ?? '',
    };

    if (toComparableJson(oldValue) === toComparableJson(newValue)) {
      return;
    }

    await queueProfileChangeRequest({
      userId,
      requestedByUserId: userId,
      section: 'host_business_contact',
      oldValue,
      newValue,
    });
    return;
  }

  const updated = await updateUserById(userId, {
    'hostCompliance.businessContact.businessPhoneNumber': newValue.businessPhoneNumber,
    'hostCompliance.businessContact.businessPhoneCountryIso': newValue.businessPhoneCountryIso,
    'hostCompliance.businessContact.businessPhoneCountryDialCode': newValue.businessPhoneCountryDialCode,
    'hostCompliance.businessContact.trustedWhatsappNumber': newValue.trustedWhatsappNumber,
    'hostCompliance.businessContact.trustedWhatsappCountryIso': newValue.trustedWhatsappCountryIso,
    'hostCompliance.businessContact.trustedWhatsappCountryDialCode': newValue.trustedWhatsappCountryDialCode,
    'hostCompliance.businessContact.officeAddress': newValue.officeAddress,
    'hostCompliance.businessContact.officeLga': newValue.officeLga,
    'hostCompliance.businessContact.officeState': newValue.officeState,
    'hostCompliance.businessContact.website': newValue.website,
    'hostCompliance.businessContact.completedAt': new Date(),
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
}

export async function completeHostManager(userId: string, input: HostManagerOnboardingDto): Promise<void> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const newValue = {
    managerName: input.managerName,
    dateOfBirth: normalizeIsoDate(input.dateOfBirth),
    nationality: input.nationality,
    ninNumber: input.ninNumber,
    ninDocumentUrl: input.ninDocumentUrl,
    managerHomeAddress: input.managerHomeAddress,
    proofOfAddressUrl: input.proofOfAddressUrl,
  };

  const wasCompletedBefore = Boolean(user.hostCompliance?.manager?.completedAt);
  if (wasCompletedBefore) {
    if (hasPendingChangeRequest(user as Record<string, any>, 'host_manager')) {
      throw new AppError(
        'You already have a pending manager-info update awaiting admin approval.',
        409,
        'PROFILE_CHANGE_ALREADY_PENDING',
      );
    }

    const oldValue = {
      managerName: user.hostCompliance?.manager?.managerName ?? '',
      dateOfBirth: normalizeIsoDate(user.hostCompliance?.manager?.dateOfBirth),
      nationality: user.hostCompliance?.manager?.nationality ?? '',
      ninNumber: user.hostCompliance?.manager?.ninNumber ?? '',
      ninDocumentUrl: user.hostCompliance?.manager?.ninDocumentUrl ?? '',
      managerHomeAddress: user.hostCompliance?.manager?.managerHomeAddress ?? '',
      proofOfAddressUrl: user.hostCompliance?.manager?.proofOfAddressUrl ?? '',
    };

    if (toComparableJson(oldValue) === toComparableJson(newValue)) {
      return;
    }

    await queueProfileChangeRequest({
      userId,
      requestedByUserId: userId,
      section: 'host_manager',
      oldValue,
      newValue,
    });
    return;
  }

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
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const currentAccountNumber = user.hostCompliance?.bankAccount?.accountNumber ?? user.bankDetails?.accountNumber ?? '';
  if (currentAccountNumber && currentAccountNumber !== input.accountNumber) {
    throw new AppError(
      'Bank account number cannot be changed here. Please contact support.',
      403,
      'BANK_ACCOUNT_CHANGE_REQUIRES_SUPPORT',
    );
  }

  const bankName = await resolveBankNameByCode(input.bankCode);
  const { recipientCode } = await paystackService.createTransferRecipient({
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
    accountName: input.accountName,
  });

  const updated = await updateUserById(userId, {
    bankDetails: {
      accountNumber: input.accountNumber,
      bankCode: input.bankCode,
      bankName,
      accountName: input.accountName,
      recipientCode,
    },
    'hostCompliance.bankAccount.accountNumber': input.accountNumber,
    'hostCompliance.bankAccount.bankCode': input.bankCode,
    'hostCompliance.bankAccount.bankName': bankName,
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
    businessPhoneCountryIso: user.hostCompliance?.businessContact?.businessPhoneCountryIso ?? 'NG',
    businessPhoneCountryDialCode: user.hostCompliance?.businessContact?.businessPhoneCountryDialCode ?? '+234',
    trustedWhatsappNumber: user.hostCompliance?.businessContact?.trustedWhatsappNumber ?? '',
    trustedWhatsappCountryIso: user.hostCompliance?.businessContact?.trustedWhatsappCountryIso ?? 'NG',
    trustedWhatsappCountryDialCode: user.hostCompliance?.businessContact?.trustedWhatsappCountryDialCode ?? '+234',
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
    bankName: user.hostCompliance?.bankAccount?.bankName ?? user.bankDetails?.bankName ?? '',
    accountName: user.hostCompliance?.bankAccount?.accountName ?? '',
    serviceAgreementAccepted: user.hostCompliance?.serviceAgreement?.accepted === true,
  };

  const hasHostDetails = Object.entries(hostDetails).some(([key, value]) => {
    if (key === 'serviceAgreementAccepted') {
      return value === true;
    }

    return typeof value === 'string' && value.trim().length > 0;
  });

  const businessStepDone = Boolean(user.hostCompliance?.businessContact?.completedAt);
  const managerStepDone = Boolean(user.hostCompliance?.manager?.completedAt);
  const bankStepDone = Boolean(user.hostCompliance?.bankAccount?.completedAt);
  const agreementStepDone = user.hostCompliance?.serviceAgreement?.accepted === true;
  const hostOnboardingCompleted = businessStepDone && managerStepDone && bankStepDone && agreementStepDone;

  const bankVerificationStatus = String(user.hostCompliance?.bankAccount?.verificationStatus ?? '').toLowerCase();
  const hostApprovalStatus: 'pending' | 'approved' | 'rejected' = user.hostCompliance?.isBusinessActive === true
    ? 'approved'
    : bankVerificationStatus === 'rejected'
      ? 'rejected'
      : 'pending';

  const guestDetails = {
    phoneNumber: user.guestOnboarding?.phoneNumber ?? '',
    phoneCountryIso: user.guestOnboarding?.phoneCountryIso ?? 'NG',
    phoneCountryDialCode: user.guestOnboarding?.phoneCountryDialCode ?? '+234',
    isWhatsappNumber: user.guestOnboarding?.isWhatsappNumber === true,
    whatsappNumber: user.guestOnboarding?.whatsappNumber ?? '',
    whatsappCountryIso: user.guestOnboarding?.whatsappCountryIso ?? 'NG',
    whatsappCountryDialCode: user.guestOnboarding?.whatsappCountryDialCode ?? '+234',
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
      phoneCountryIso: user.phoneCountryIso ?? 'NG',
      phoneCountryDialCode: user.phoneCountryDialCode ?? '+234',
    },
    hostOnboarding: {
      propertyName: user.hostOnboarding?.propertyName ?? '',
      propertyType: user.hostOnboarding?.propertyType === 'shortlet' ? 'shortlet' : 'hotel',
      status: {
        completed: hostOnboardingCompleted,
        approvalStatus: hostApprovalStatus,
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
    hostVerified: false,
    'hostCompliance.bankAccount.verificationStatus': 'pending_manual_review',
    'hostCompliance.isBusinessActive': false,
    'hostCompliance.activatedAt': null,
  });

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (env.ADMIN_EMAILS.length > 0) {
    try {
      await emailService.sendAdminHostOnboardingSubmittedEmail({
        to: env.ADMIN_EMAILS,
        hostName: updated.name,
        hostEmail: updated.email,
        propertyName: updated.hostOnboarding?.propertyName ?? '',
        propertyType: updated.hostOnboarding?.propertyType ?? '',
      });
    }
    catch (error) {
      // Activation succeeds even if email delivery fails.
      console.error('Failed to send host onboarding submission email to admins', error);
    }
  }
}

export async function completeGuestProfile(userId: string, input: GuestProfileOnboardingDto): Promise<void> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (!input.isWhatsappNumber && !input.whatsappNumber) {
    throw new AppError('whatsappNumber is required when isWhatsappNumber is false', 400, 'WHATSAPP_NUMBER_REQUIRED');
  }

  const normalizedPhoneNumber = normalizePhoneToE164({
    rawPhone: input.phoneNumber,
    countryIso: input.phoneCountryIso,
    errorCode: 'INVALID_PHONE_NUMBER',
    errorMessage: 'Enter a valid phone number',
  });

  const normalizedWhatsappNumber = input.isWhatsappNumber
    ? normalizedPhoneNumber
    : normalizePhoneToE164({
      rawPhone: input.whatsappNumber ?? '',
      countryIso: input.whatsappCountryIso ?? input.phoneCountryIso,
      errorCode: 'INVALID_WHATSAPP_NUMBER',
      errorMessage: 'Enter a valid WhatsApp number',
    });

  const newValue = {
    phoneNumber: normalizedPhoneNumber.e164,
    phoneCountryIso: normalizedPhoneNumber.countryIso,
    phoneCountryDialCode: normalizedPhoneNumber.countryDialCode,
    isWhatsappNumber: input.isWhatsappNumber,
    whatsappNumber: normalizedWhatsappNumber.e164,
    whatsappCountryIso: normalizedWhatsappNumber.countryIso,
    whatsappCountryDialCode: normalizedWhatsappNumber.countryDialCode,
    ninNumber: input.ninNumber,
    ninDocumentUrl: input.ninDocumentUrl,
  };

  const wasCompletedBefore = Boolean(user.guestOnboarding?.completedAt);
  if (wasCompletedBefore) {
    if (hasPendingChangeRequest(user as Record<string, any>, 'guest_profile')) {
      throw new AppError(
        'You already have a pending guest-profile update awaiting admin approval.',
        409,
        'PROFILE_CHANGE_ALREADY_PENDING',
      );
    }

    const oldValue = {
      phoneNumber: user.guestOnboarding?.phoneNumber ?? '',
      phoneCountryIso: user.guestOnboarding?.phoneCountryIso ?? '',
      phoneCountryDialCode: user.guestOnboarding?.phoneCountryDialCode ?? '',
      isWhatsappNumber: user.guestOnboarding?.isWhatsappNumber === true,
      whatsappNumber: user.guestOnboarding?.whatsappNumber ?? '',
      whatsappCountryIso: user.guestOnboarding?.whatsappCountryIso ?? '',
      whatsappCountryDialCode: user.guestOnboarding?.whatsappCountryDialCode ?? '',
      ninNumber: user.guestOnboarding?.ninNumber ?? '',
      ninDocumentUrl: user.guestOnboarding?.ninDocumentUrl ?? '',
    };

    if (toComparableJson(oldValue) === toComparableJson(newValue)) {
      return;
    }

    await queueProfileChangeRequest({
      userId,
      requestedByUserId: userId,
      section: 'guest_profile',
      oldValue,
      newValue,
    });
    return;
  }

  const updated = await updateUserById(userId, {
    phoneNumber: newValue.phoneNumber,
    phoneCountryIso: newValue.phoneCountryIso,
    phoneCountryDialCode: newValue.phoneCountryDialCode,
    'guestOnboarding.phoneNumber': newValue.phoneNumber,
    'guestOnboarding.phoneCountryIso': newValue.phoneCountryIso,
    'guestOnboarding.phoneCountryDialCode': newValue.phoneCountryDialCode,
    'guestOnboarding.isWhatsappNumber': newValue.isWhatsappNumber,
    'guestOnboarding.whatsappNumber': newValue.whatsappNumber,
    'guestOnboarding.whatsappCountryIso': newValue.whatsappCountryIso,
    'guestOnboarding.whatsappCountryDialCode': newValue.whatsappCountryDialCode,
    'guestOnboarding.ninNumber': newValue.ninNumber,
    'guestOnboarding.ninDocumentUrl': newValue.ninDocumentUrl,
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
    phoneCountryIso: user.phoneCountryIso ?? 'NG',
    phoneCountryDialCode: user.phoneCountryDialCode ?? '+234',
    bankDetails: user.role === 'host'
      ? {
        bankName: user.hostCompliance?.bankAccount?.bankName ?? user.bankDetails?.bankName ?? '',
        accountNumber: user.hostCompliance?.bankAccount?.accountNumber ?? user.bankDetails?.accountNumber ?? '',
        accountName: user.hostCompliance?.bankAccount?.accountName ?? user.bankDetails?.accountName ?? '',
        editable: false,
      }
      : null,
  };
}

export async function updateProfile(userId: string, input: UpdateProfileDto): Promise<ProfileResponseDto> {
  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const normalizedPhone = input.phoneNumber?.trim()
    ? normalizePhoneToE164({
      rawPhone: input.phoneNumber,
      countryIso: input.phoneCountryIso ?? 'NG',
      errorCode: 'INVALID_PHONE_NUMBER',
      errorMessage: 'Enter a valid phone number',
    })
    : null;

  const updated = await updateUserById(userId, {
    name: fullName,
    phoneNumber: normalizedPhone?.e164 ?? '',
    phoneCountryIso: normalizedPhone?.countryIso ?? 'NG',
    phoneCountryDialCode: normalizedPhone?.countryDialCode ?? '+234',
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
    phoneCountryIso: updated.phoneCountryIso ?? 'NG',
    phoneCountryDialCode: updated.phoneCountryDialCode ?? '+234',
    bankDetails: updated.role === 'host'
      ? {
        bankName: updated.hostCompliance?.bankAccount?.bankName ?? updated.bankDetails?.bankName ?? '',
        accountNumber: updated.hostCompliance?.bankAccount?.accountNumber ?? updated.bankDetails?.accountNumber ?? '',
        accountName: updated.hostCompliance?.bankAccount?.accountName ?? updated.bankDetails?.accountName ?? '',
        editable: false,
      }
      : null,
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
