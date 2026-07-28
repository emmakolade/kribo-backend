import { Router } from 'express';
import { z } from 'zod';
import { AUTH_REGISTER_ROLES, EMAIL_OTP_PURPOSES } from '../constants/enums';
import {
  activateHostBusinessController,
  changePasswordController,
  completeGuestProfileController,
  completeHostBankAccountController,
  completeHostBusinessContactController,
  completeHostManagerController,
  completeHostServiceAgreementController,
  resolveBankAccountNameController,
  listHostBanksController,
  getAuthMeController,
  getProfileController,
  getHostServiceAgreementTextController,
  forgotPasswordRequestController,
  forgotPasswordResetController,
  loginController,
  logoutController,
  registerController,
  sendEmailOtpController,
  updateProfileController,
  verifyEmailOtpController,
  verifyHostController,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const [GUEST_ROLE, HOST_ROLE] = AUTH_REGISTER_ROLES;

const registerBaseFields = {
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
};

const guestRegisterBodySchema = z.object({
  ...registerBaseFields,
  role: z.literal(GUEST_ROLE),
});

const hostRegisterBodySchema = z.object({
  ...registerBaseFields,
  role: z.literal(HOST_ROLE),
});

const registerSchema = z.object({
  body: z.discriminatedUnion('role', [guestRegisterBodySchema, hostRegisterBodySchema]),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const loginSchema = z.object({
  body: z.object({ email: z.email(), password: z.string().min(8) }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const verifySchema = z.object({
  body: z.object({ bvn: z.string().min(6), idDocumentUrl: z.url() }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const sendEmailOtpSchema = z.object({
  body: z.object({
    email: z.email(),
    purpose: z.enum(EMAIL_OTP_PURPOSES),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const verifyEmailOtpSchema = z.object({
  body: z.object({
    email: z.email(),
    purpose: z.enum(EMAIL_OTP_PURPOSES),
    otp: z.string().regex(/^\d{6}$/),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const forgotPasswordRequestSchema = z.object({
  body: z.object({
    email: z.email(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const forgotPasswordResetSchema = z.object({
  body: z.object({
    email: z.email(),
    otp: z.string().regex(/^\d{6}$/),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  }).refine((value) => value.newPassword === value.confirmPassword, {
    message: 'newPassword and confirmPassword must match',
    path: ['confirmPassword'],
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    phoneNumber: z.string().min(7).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  }).refine((value) => value.newPassword === value.confirmPassword, {
    message: 'newPassword and confirmPassword must match',
    path: ['confirmPassword'],
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const hostBusinessContactSchema = z.object({
  body: z.object({
    businessPhoneNumber: z.string().min(7),
    trustedWhatsappNumber: z.string().min(7),
    officeAddress: z.string().min(5),
    officeLga: z.string().min(2),
    officeState: z.string().min(2),
    website: z.url().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const hostManagerSchema = z.object({
  body: z.object({
    managerName: z.string().min(2),
    dateOfBirth: z.string(),
    nationality: z.string().min(2),
    ninNumber: z.string().min(6),
    ninDocumentUrl: z.url(),
    managerHomeAddress: z.string().min(5),
    proofOfAddressUrl: z.url(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const hostBankAccountSchema = z.object({
  body: z.object({
    accountNumber: z.string().min(10),
    bankCode: z.string().min(3),
    accountName: z.string().min(2),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const resolveBankAccountNameSchema = z.object({
  body: z.object({
    accountNumber: z.string().regex(/^\d{10}$/),
    bankCode: z.string().min(3),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const hostServiceAgreementSchema = z.object({
  body: z.object({
    accepted: z.boolean(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const guestProfileSchema = z.object({
  body: z.object({
    phoneNumber: z.string().min(7),
    isWhatsappNumber: z.boolean(),
    whatsappNumber: z.string().min(7).optional(),
    ninNumber: z.string().min(6),
    ninDocumentUrl: z.url(),
  }).refine((value) => value.isWhatsappNumber || Boolean(value.whatsappNumber), {
    message: 'whatsappNumber is required when isWhatsappNumber is false',
    path: ['whatsappNumber'],
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const emptySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), registerController);
authRouter.post('/login', validate(loginSchema), loginController);
authRouter.post('/send-email-otp', validate(sendEmailOtpSchema), sendEmailOtpController);
authRouter.post('/verify-email-otp', validate(verifyEmailOtpSchema), verifyEmailOtpController);
authRouter.post('/forgot-password/request', validate(forgotPasswordRequestSchema), forgotPasswordRequestController);
authRouter.post('/forgot-password/reset', validate(forgotPasswordResetSchema), forgotPasswordResetController);
authRouter.post('/logout', requireAuth, validate(emptySchema), logoutController);
authRouter.get('/me', requireAuth, validate(emptySchema), getAuthMeController);
authRouter.get('/profile', requireAuth, validate(emptySchema), getProfileController);
authRouter.patch('/profile', requireAuth, validate(updateProfileSchema), updateProfileController);
authRouter.post('/change-password', requireAuth, validate(changePasswordSchema), changePasswordController);
authRouter.post('/verify-host', requireAuth, validate(verifySchema), verifyHostController);
authRouter.post('/onboarding/host/business-contact', requireAuth, validate(hostBusinessContactSchema), completeHostBusinessContactController);
authRouter.post('/onboarding/host/manager', requireAuth, validate(hostManagerSchema), completeHostManagerController);
authRouter.get('/onboarding/host/banks', requireAuth, validate(emptySchema), listHostBanksController);
authRouter.post('/onboarding/host/bank-account/resolve-name', requireAuth, validate(resolveBankAccountNameSchema), resolveBankAccountNameController);
authRouter.post('/onboarding/host/bank-account', requireAuth, validate(hostBankAccountSchema), completeHostBankAccountController);
authRouter.get('/onboarding/host/service-agreement-text', requireAuth, validate(emptySchema), getHostServiceAgreementTextController);
authRouter.post('/onboarding/host/service-agreement', requireAuth, validate(hostServiceAgreementSchema), completeHostServiceAgreementController);
authRouter.post('/onboarding/host/activate-business', requireAuth, validate(emptySchema), activateHostBusinessController);
authRouter.post('/onboarding/guest/profile', requireAuth, validate(guestProfileSchema), completeGuestProfileController);
