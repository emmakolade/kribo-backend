# Kribo Backend

Express + TypeScript backend for Kribo (hotel/shortlet booking), with preauthorization booking flow, host WhatsApp confirmation, and escrow payout model.

## Stack

- Express + TypeScript
- MongoDB + Mongoose
- RabbitMQ (`amqplib`) for booking.pending event handoff
- BullMQ + Redis for scheduled jobs (payout sweep, escalation checks, calendar sync)
- Paystack / WhatsApp service wrappers
- Zod request validation
- Pino structured logging
- Swagger docs at `/docs`

## Quick Start (Docker)

1. Copy `.env.example` to `.env`.
2. Start services:

```bash
docker compose up --build
```

3. Seed sample data:

```bash
npm run seed
```

4. Open API docs:

- http://localhost:4000/docs

## Local Dev

```bash
npm install
npm run dev
```

## Env Vars

Required (validated at startup in `src/config/env.ts`):

- `NODE_ENV`
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `REDIS_URL`
- `RABBITMQ_URI`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_BASE_URL`
- `PAYSTACK_WEBHOOK_URL` (recommended for deployment ops visibility; should point to your backend `/webhooks/paystack` endpoint)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_WEBHOOK_URL`
- `SMTP_HOST` (default `smtp.gmail.com`, used in development/test)
- `SMTP_PORT` (default `465`, used in development/test)
- `SMTP_SECURE` (default `true`, used in development/test)
- `SMTP_USER` (required in development/test)
- `SMTP_PASS` (required in development/test)
- `SMTP_FROM_EMAIL` (required in development/test)
- `AWS_REGION` (required in production)
- `AWS_SES_FROM_EMAIL` (required in production)
- `CLOUDINARY_CLOUD_NAME` (required for photo uploads)
- `CLOUDINARY_API_KEY` (required for photo uploads)
- `CLOUDINARY_API_SECRET` (required for photo uploads)
- `EMAIL_OTP_SECRET` (optional, falls back to `JWT_SECRET`)
- `COMMISSION_RATE`
- `PAYOUT_HOLD_DAYS`

## Scripts

- `npm run dev` - dev server
- `npm run build` - compile TypeScript
- `npm run start` - run compiled server
- `npm run test` - run tests
- `npm run seed` - load Lagos/Abuja/Port Harcourt sample data
- `npm run lint` - lint code
- `npm run format` - format code

## Additional Documentation

- `docs/API_ENDPOINTS.md` - full endpoint list with payloads and likely responses
- `docs/BACKGROUND_TASKS.md` - all running background workers, schedules, and queue responsibilities

## Auth Pages

- Guest auth page: `http://localhost:4000/auth/guest`
- Host auth page: `http://localhost:4000/auth/host`
- Raw static paths: `/ui/auth/guest.html` and `/ui/auth/host.html`
- Host signup collects: first name, last name, email, and password

Register email OTP flow:

1. `POST /auth/send-email-otp` with `purpose=register`
2. `POST /auth/verify-email-otp` with the 6-digit code
3. `POST /auth/register` to complete signup

Post-signup onboarding:

1. Host compliance steps: business contact, manager details, bank account, service agreement, then `POST /auth/onboarding/host/activate-business`
2. Guest profile step: phone/WhatsApp flag + NIN details via `POST /auth/onboarding/guest/profile`

## Core Flow

1. `POST /bookings` creates booking, atomically holds availability, initializes Paystack preauth, transitions to `payment_held`, and emits `booking.pending`.
2. Rabbit consumer sends host WhatsApp message through Twilio with ACCEPT/DECLINE instructions.
3. `POST /webhooks/whatsapp` verifies signature and processes idempotent accept/decline.
4. Daily payout job transfers host payout after hold period; unique index on `Payout.bookingId` prevents double payment.

## Paystack Dashboard Setup

1. Deploy backend to a public HTTPS URL.
2. Set `PAYSTACK_WEBHOOK_URL` in your backend environment to that URL plus `/webhooks/paystack`.
3. In Paystack dashboard, set the webhook URL to the same value.
4. Trigger a test transaction and confirm backend receives `charge.success` callbacks.

## Tests (high-risk areas)

- Booking state machine transition rules
- Atomic concurrent availability hold race condition
- Payout idempotency on duplicate concurrent payout sweeps
