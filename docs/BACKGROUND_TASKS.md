# Kribo Background Tasks and Workers

This document explains all non-HTTP backend processes currently running when the server boots.

## Where They Start

Started in bootstrap flow:

- `startBookingEventConsumer()`
- `schedulePayoutSweep()`
- `scheduleEscalationChecks()`
- `scheduleCalendarSyncPrompt()`
- `startPayoutWorker()`
- `startEscalationWorker()`
- `startCalendarSyncWorker()`

See implementation in:

- `src/server.ts`

---

## 1) RabbitMQ Booking Event Consumer

### Component

- File: `src/queue/bookingEvents.consumer.ts`
- Trigger source: RabbitMQ event `booking.pending`
- Exchange: `booking.exchange`
- Queue: `booking.events`
- Routing key: `booking.pending`

### What it does

1. Receives booking pending event.
2. Loads booking and host.
3. Sends WhatsApp host confirmation interactive message.
4. Writes `WhatsappLog` record.
5. Creates Redis timer key `booking:timer:{bookingId}` with TTL:
   - same-day check-in: 10 minutes
   - future check-in: 15 minutes
6. Acks Rabbit message.

### Why it matters

- Keeps booking request path fast.
- Decouples host notification from API request thread.
- Timer setup is centralized with host-notification dispatch.

---

## 2) BullMQ Recurring Job: Payout Sweep

### Component

- File: `src/jobs/payoutSweep.job.ts`
- Queue name: `payout.sweep`
- Schedule: cron `0 1 * * *` (daily at 01:00)

### Worker action

- Calls `runDailyPayoutSweep()` from `src/services/payouts.service.ts`.

### What it does

1. Finds bookings in `completed` state.
2. Checks hold period using `PAYOUT_HOLD_DAYS`.
3. Transfers host payout using Paystack service.
4. Creates `Payout` record.
5. Transitions booking to `paid_out`.
6. Handles duplicate payout idempotently:
   - Duplicate key on `Payout.bookingId` (unique index) is treated as no-op.

### Why it matters

- Automates escrow release.
- Prevents double payout via data-layer uniqueness.

---

## 3) BullMQ Recurring Job: Escalation Check

### Component

- File: `src/jobs/escalationCheck.job.ts`
- Queue name: `booking.escalation`
- Schedule: every 60 seconds (`every: 60000`)

### Worker action

- Calls `escalateExpiredBookings()` from `src/services/bookings.service.ts`.
- If escalations occurred, pushes an ops alert job via `pushOpsAlert()`.

### What it does

1. Scans bookings in `payment_held`.
2. Checks Redis confirmation timer key existence.
3. If timer expired (key missing), transitions booking to `escalated`.
4. Emits ops alert payload with escalation count.

### Why it matters

- Prevents bookings from hanging indefinitely waiting on host response.
- Gives operations visibility for manual intervention.

---

## 4) BullMQ Recurring Job: Calendar Sync Prompt

### Component

- File: `src/jobs/calendarSync.job.ts`
- Queue name: `calendar.sync`
- Schedule: cron `0 18 * * 4` (every Thursday at 18:00)

### Worker action

- Loads all hosts.
- Sends proactive WhatsApp prompt asking about offline bookings.

### What it does

1. Fetches users with role `host`.
2. Sends WhatsApp text prompt to each host.
3. Intended to reduce stale availability before peak periods.

### Why it matters

- Improves inventory freshness.
- Reduces offline booking conflicts.

---

## 5) Ops Alert Queue Producer

### Component

- File: `src/queue/opsAlerts.producer.ts`
- Queue name: `ops.alerts`

### What it does

- Enqueues escalation summary payloads from escalation worker.
- Current code creates queue and adds jobs; no consumer is implemented yet in this repo.

---

## What Is Running Right Now (When Server Is Healthy)

After successful bootstrap, these long-running processes are active:

1. One RabbitMQ consumer for booking pending events.
2. One BullMQ worker for payout queue.
3. One BullMQ worker for escalation queue.
4. One BullMQ worker for calendar sync queue.
5. Three repeatable job schedules registered at startup.

If `npm run dev` exits early, these do not stay running.

---

## Quick Verification Checklist

1. API health responds:
   - `GET /health` returns `{ "ok": true }`.
2. RabbitMQ management UI available at `http://localhost:15672`.
3. Redis reachable on configured `REDIS_URL`.
4. BullMQ repeat jobs exist for:
   - payout sweep
   - escalation check
   - calendar sync prompt
5. Logs show:
   - `server started`
   - booking lifecycle events
   - payout logs and escalation logs as they occur.

---

## Environment Variables Used by Background Tasks

- `RABBITMQ_URI`
- `REDIS_URL`
- `PAYSTACK_*`
- `TWILIO_*`
- `PAYOUT_HOLD_DAYS`

See full validation schema in `src/config/env.ts`.
