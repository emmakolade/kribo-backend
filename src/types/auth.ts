import type { AuthRegisterRole, EmailOtpPurpose, UserRole } from '../constants/enums';

export type { UserRole };

export interface RegisterGuestRequestDto {
  role: Extract<AuthRegisterRole, 'guest'>;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface RegisterHostRequestDto {
  role: Extract<AuthRegisterRole, 'host'>;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export type RegisterRequestDto = RegisterGuestRequestDto | RegisterHostRequestDto;

export interface RegisterInput {
  role: AuthRegisterRole;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface HostBusinessContactOnboardingDto {
  businessPhoneNumber: string;
  trustedWhatsappNumber: string;
  officeAddress: string;
  officeLga: string;
  officeState: string;
  website?: string;
}

export interface HostManagerOnboardingDto {
  managerName: string;
  dateOfBirth: string;
  nationality: string;
  ninNumber: string;
  ninDocumentUrl: string;
  managerHomeAddress: string;
  proofOfAddressUrl: string;
}

export interface HostBankAccountOnboardingDto {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

export interface ResolveBankAccountNameDto {
  accountNumber: string;
  bankCode: string;
}

export interface BankOptionDto {
  name: string;
  code: string;
}

export interface HostOnboardingStatusDto {
  completed: boolean;
  details: {
    businessPhoneNumber: string;
    trustedWhatsappNumber: string;
    officeAddress: string;
    officeLga: string;
    officeState: string;
    website: string;
    managerName: string;
    dateOfBirth: string;
    nationality: string;
    ninNumber: string;
    managerHomeAddress: string;
    accountNumber: string;
    bankCode: string;
    accountName: string;
    serviceAgreementAccepted: boolean;
  } | null;
}

export interface GuestOnboardingStatusDto {
  completed: boolean;
  details: {
    phoneNumber: string;
    isWhatsappNumber: boolean;
    whatsappNumber: string;
    ninNumber: string;
  } | null;
}

export interface AuthMeResponseDto {
  user: {
    id: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  hostOnboarding: {
    propertyName: string;
    propertyType: 'hotel' | 'shortlet';
    status: HostOnboardingStatusDto;
  };
  guestOnboarding: {
    status: GuestOnboardingStatusDto;
  };
}

export interface HostServiceAgreementOnboardingDto {
  accepted: boolean;
}

export interface GuestProfileOnboardingDto {
  phoneNumber: string;
  isWhatsappNumber: boolean;
  whatsappNumber?: string;
  ninNumber: string;
  ninDocumentUrl: string;
}

export interface SendEmailOtpInput {
  email: string;
  purpose: EmailOtpPurpose;
}

export interface ForgotPasswordRequestDto {
  email: string;
}

export interface ForgotPasswordResetDto {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

export interface VerifyEmailOtpInput {
  email: string;
  purpose: EmailOtpPurpose;
  otp: string;
}

export interface LoginBodyDto {
  email: string;
  password: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdateProfileDto {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export interface ProfileResponseDto {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

export interface VerifyHostBodyDto {
  bvn: string;
  idDocumentUrl: string;
}

export interface AuthenticatedRequestUser {
  userId: string;
  role: UserRole;
}
