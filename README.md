# Kribo Backend

Express + TypeScript backend for Kribo (hotel/shortlet booking), with Paystack checkout, host WhatsApp notifications, and escrow payout model.

## Stack

- Express + TypeScript
- MongoDB + Mongoose
- RabbitMQ (`amqplib`) for booking.confirmed event handoff
- BullMQ + Redis for scheduled jobs (payout sweep, escalation checks, calendar sync, check-in reminders, host availability reminders)
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

3. Open API docs:

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
- `HOST_APP_BASE_URL` (frontend base URL for email login links, e.g. `https://app.kribo.com`)
- `KRIBO_LOGO_URL` (optional absolute URL used in branded email headers)
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
- `ADMIN_EMAILS` (comma-separated emails notified when payout needs manual transfer)
- `COMMISSION_RATE`
- `PAYOUT_HOLD_DAYS`

## Scripts

- `npm run dev` - dev server
- `npm run build` - compile TypeScript
- `npm run start` - run compiled server
- `npm run test` - run tests
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

1. `POST /bookings` creates a pending booking draft.
2. `POST /payments/initialize` starts Paystack checkout and stores a pending payment record.
3. `POST /webhooks/paystack` verifies signatures, processes webhook events idempotently, and finalizes payment status.
4. `GET /payments/:reference/status` gives the frontend canonical payment + booking state during callback/polling.
5. Rabbit consumer sends host WhatsApp and email booking notifications after successful payment confirmation.
6. Check-in reminder worker sends same-day host WhatsApp and email reminders, including WhatsApp check-in command format.
7. `POST /webhooks/whatsapp` verifies signature and processes `CHECK-IN <BOOKING_ID>` replies from hosts.
8. Daily host availability reminder encourages hosts to turn property booking availability ON/OFF based on real readiness.
9. Daily payout job raises manual payout notification emails after hold period; unique index on `Payout.bookingId` prevents duplicate payout requests.

## Paystack Dashboard Setup

1. Deploy backend to a public HTTPS URL.
2. Set `PAYSTACK_WEBHOOK_URL` in your backend environment to that URL plus `/webhooks/paystack`.
3. In Paystack dashboard, set the webhook URL to the same value.
4. Trigger a test transaction and confirm backend receives `charge.success` callbacks.

## Tests (high-risk areas)

- Booking state machine transition rules
- Atomic concurrent availability hold race condition
- Payout idempotency on duplicate concurrent payout sweeps
