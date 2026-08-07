import type { Request, Response } from 'express';
import type {
  ChangePasswordDto,
  ForgotPasswordRequestDto,
  ForgotPasswordResetDto,
  GuestProfileOnboardingDto,
  HostBankAccountOnboardingDto,
  HostBusinessContactOnboardingDto,
  HostManagerOnboardingDto,
  HostServiceAgreementOnboardingDto,
  LoginBodyDto,
  RegisterInput,
  UpdateProfileDto,
  ResolveBankAccountNameDto,
  RegisterRequestDto,
  SendEmailOtpInput,
  VerifyEmailOtpInput,
  VerifyHostBodyDto,
} from '../types/auth';
import {
  activateHostBusiness,
  changePassword,
  completeGuestProfile,
  completeHostBankAccount,
  completeHostBusinessContact,
  completeHostManager,
  resolveBankAccountName,
  listHostBanks,
  getAuthMe,
  completeHostServiceAgreement,
  getProfile,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  login,
  register,
  sendEmailOtp,
  updateProfile,
  verifyEmailOtp,
  verifyHost,
} from '../services/auth.service';
import { AppError } from '../utils/AppError';

export async function registerController(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterRequestDto;
  const registerInputForService: RegisterInput = {
    role: body.role,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    password: body.password,
  };
  const result = await register(registerInputForService);
  res.status(201).json(result);
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginBodyDto;
  const result = await login(body);
  res.status(200).json(result);
}

export async function verifyHostController(req: Request, res: Response): Promise<void> {
  const body = req.body as VerifyHostBodyDto;
  await verifyHost({
    userId: req.user!.userId,
    bvn: body.bvn,
    idDocumentUrl: body.idDocumentUrl,
  });

  res.status(200).json({ ok: true });
}

export async function sendEmailOtpController(req: Request, res: Response): Promise<void> {
  const result = await sendEmailOtp(req.body as SendEmailOtpInput);
  res.status(200).json(result);
}

export async function verifyEmailOtpController(req: Request, res: Response): Promise<void> {
  const result = await verifyEmailOtp(req.body as VerifyEmailOtpInput);
  res.status(200).json(result);
}

export async function forgotPasswordRequestController(req: Request, res: Response): Promise<void> {
  const result = await requestForgotPasswordOtp(req.body as ForgotPasswordRequestDto);
  res.status(200).json(result);
}

export async function forgotPasswordResetController(req: Request, res: Response): Promise<void> {
  const result = await resetPasswordWithOtp(req.body as ForgotPasswordResetDto);
  res.status(200).json(result);
}

export async function logoutController(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ ok: true });
}

export async function completeHostBusinessContactController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can complete host onboarding', 403, 'FORBIDDEN');
  }

  await completeHostBusinessContact(req.user!.userId, req.body as HostBusinessContactOnboardingDto);
  res.status(200).json({ ok: true, step: 'business_contact' });
}

export async function completeHostManagerController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can complete host onboarding', 403, 'FORBIDDEN');
  }

  await completeHostManager(req.user!.userId, req.body as HostManagerOnboardingDto);
  res.status(200).json({ ok: true, step: 'manager' });
}

export async function completeHostBankAccountController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can complete host onboarding', 403, 'FORBIDDEN');
  }

  await completeHostBankAccount(req.user!.userId, req.body as HostBankAccountOnboardingDto);
  res.status(200).json({ ok: true, step: 'bank_account' });
}

export async function resolveBankAccountNameController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can resolve bank account names', 403, 'FORBIDDEN');
  }

  const result = await resolveBankAccountName(req.body as ResolveBankAccountNameDto);
  res.status(200).json({ ok: true, data: result });
}

export async function listHostBanksController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can view bank options', 403, 'FORBIDDEN');
  }

  const data = await listHostBanks();
  res.status(200).json({ ok: true, data });
}

export async function getAuthMeController(req: Request, res: Response): Promise<void> {
  const data = await getAuthMe(req.user!.userId);
  res.status(200).json(data);
}

export async function getProfileController(req: Request, res: Response): Promise<void> {
  const data = await getProfile(req.user!.userId);
  res.status(200).json(data);
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  const data = await updateProfile(req.user!.userId, req.body as UpdateProfileDto);
  res.status(200).json(data);
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  await changePassword(req.user!.userId, req.body as ChangePasswordDto);
  res.status(200).json({ ok: true });
}

export async function completeHostServiceAgreementController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can complete host onboarding', 403, 'FORBIDDEN');
  }

  await completeHostServiceAgreement(req.user!.userId, req.body as HostServiceAgreementOnboardingDto);
  res.status(200).json({ ok: true, step: 'service_agreement' });
}

export async function activateHostBusinessController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can activate business', 403, 'FORBIDDEN');
  }

  await activateHostBusiness(req.user!.userId);
  res.status(200).json({ ok: true, status: 'submitted_for_review' });
}

export async function completeGuestProfileController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'guest') {
    throw new AppError('Only guests can complete guest onboarding', 403, 'FORBIDDEN');
  }

  await completeGuestProfile(req.user!.userId, req.body as GuestProfileOnboardingDto);
  res.status(200).json({ ok: true, step: 'guest_profile' });
}

export async function getHostServiceAgreementTextController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'host') {
    throw new AppError('Only hosts can view this agreement', 403, 'FORBIDDEN');
  }

  res.status(200).json({
    version: 'v1',
    text: 'By using Kribo as a host, you confirm that all submitted business and manager details are accurate, that you have legal authority to list properties, and that you will honor confirmed bookings, platform policies, and applicable laws. Kribo may suspend listings or payouts while compliance checks are pending or if submitted details are false.',
  });
}
