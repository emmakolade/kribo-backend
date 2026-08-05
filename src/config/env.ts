import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  REDIS_URL: z.url(),
  RABBITMQ_URI: z.url(),
  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_BASE_URL: z.url(),
  PAYSTACK_WEBHOOK_URL: z.url().optional(),
  PAYSTACK_BOOKING_CALLBACK_URL: z.url().optional(),
  HOST_APP_BASE_URL: z.url().default('http://localhost:3000'),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().min(1),
  TWILIO_WEBHOOK_URL: z.url(),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.coerce.boolean().default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.email().optional(),
  AWS_REGION: z.string().optional(),
  AWS_SES_FROM_EMAIL: z.email().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  EMAIL_OTP_SECRET: z.string().min(12).optional(),
  COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.12),
  PAYOUT_HOLD_DAYS: z.coerce.number().int().min(0).default(1),
  BOOKING_SERVICE_FEE_NGN: z.coerce.number().int().min(0).default(2000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Environment validation failed: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === 'production') {
  if (!parsed.data.AWS_REGION) {
    throw new Error('Environment validation failed: AWS_REGION is required in production');
  }
  if (!parsed.data.AWS_SES_FROM_EMAIL) {
    throw new Error('Environment validation failed: AWS_SES_FROM_EMAIL is required in production');
  }
} else {
  if (!parsed.data.SMTP_USER) {
    throw new Error('Environment validation failed: SMTP_USER is required in development/test');
  }
  if (!parsed.data.SMTP_PASS) {
    throw new Error('Environment validation failed: SMTP_PASS is required in development/test');
  }
  if (!parsed.data.SMTP_FROM_EMAIL) {
    throw new Error('Environment validation failed: SMTP_FROM_EMAIL is required in development/test');
  }
}

export const env = parsed.data;
