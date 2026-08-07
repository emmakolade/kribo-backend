# Kribo Background Tasks and Workers

This document explains all non-HTTP backend processes currently running when the server boots.

## Where They Start

Started in bootstrap flow:

- `startBookingEventConsumer()`
- `scheduleEscalationChecks()`
- `scheduleCalendarSyncPrompt()`
- `scheduleCheckInReminderJob()`
- `scheduleHostAvailabilityReminderJob()`
- `startPayoutWorker()`
- `startEscalationWorker()`
- `startCalendarSyncWorker()`
- `startCheckInReminderWorker()`
- `startHostAvailabilityReminderWorker()`

See implementation in:

- `src/server.ts`

---

## 1) RabbitMQ Booking Event Consumer

### Component

- File: `src/queue/bookingEvents.consumer.ts`
- Trigger source: RabbitMQ event `booking.confirmed`
- Exchange: `booking.exchange`
- Queue: `booking.events`
- Routing key: `booking.confirmed`

### What it does

1. Receives booking confirmed event.
2. Loads booking and host.
3. Sends host booking notification through WhatsApp and email.
4. Writes `WhatsappLog` record.
5. Acks Rabbit message.

### Why it matters

- Keeps booking request path fast.
- Decouples host notification from API request thread.
- Host notification dispatch is decoupled from the API request path.

---

## 2) BullMQ Payout Worker

### Component

- File: `src/jobs/payoutSweep.job.ts`
- Queue name: `payout.sweep`

### Worker action

- Processes `host_payout_request` jobs by calling `processHostPayoutRequest()` from `src/services/payouts.service.ts`.

### What it does

1. Receives payout jobs for specific bookings.
2. Validates booking status and host payout recipient setup.
3. Transfers host payout using Paystack service.
4. Marks payout and booking as `paid_out` on success.

### Why it matters

- Processes payout requests with queue-backed retries.
- Prevents duplicate payout side effects via payout status checks.

---

## 3) BullMQ Recurring Job: Escalation Check

### Component

- File: `src/jobs/escalationCheck.job.ts`
- Queue name: `booking.escalation`
- Schedule: every 60 seconds (`every: 60000`)

### Worker action

- Calls `escalateExpiredBookings()` from `src/services/bookings.service.ts`.
- Current implementation returns `0` (no-op) because there is no host confirmation wait state.

### What it does

1. Runs a scheduled no-op check.
2. Emits no alerts while host confirmation wait-state is disabled.

### Why it matters

- Preserves scheduler wiring while this flow is intentionally disabled.

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

## 6) BullMQ Recurring Job: Check-in Reminder

### Component

- File: `src/jobs/checkInReminder.job.ts`
- Queue name: `booking.checkin-reminder`
- Schedule: every 1 hour

### Worker action

- Finds `confirmed` bookings with `checkIn` date equal to today and no prior reminder marker.
- Sends host WhatsApp reminder with booking details and check-in instruction.
- Marks `checkInReminderSentAt` on each booking after send.

### What it does

1. Loads today's confirmed bookings awaiting reminder dispatch.
2. Sends WhatsApp reminder including:
   - guest name
   - `*PAID*` payment status
   - check-in command format (`CHECK-IN <BOOKING_ID>`)
   - recommendation to complete check-in in app
   - payout withdrawal reminder after check-in
3. Sends email reminder with login deep-link into host booking page.
4. Persists WhatsApp outbound log.
5. Prevents duplicates using booking-level reminder timestamp.

### Why it matters

- Ensures hosts are reminded exactly on guest check-in day.
- Supports lightweight WhatsApp-based check-in command while keeping app as primary workflow.

---

## 7) BullMQ Recurring Job: Host Availability Reminder

### Component

- File: `src/jobs/hostAvailabilityReminder.job.ts`
- Queue name: `host.availability-reminder`
- Schedule: cron `0 9 * * *` (daily at 09:00)

### Worker action

- Groups properties by host.
- Sends daily availability reminder by both email and WhatsApp.
- Includes current ON/OFF state per property and login path to manage availability.

### What it does

1. Loads all properties and groups them by host.
2. Sends reminder to each host:
   - set availability ON when property is ready to accept bookings
   - set availability OFF when property is not available to avoid receiving bookings
3. Shares current availability state list per property.
4. Sends through email and WhatsApp for stronger delivery coverage.

### Why it matters

- Reduces accidental overbooking requests when hosts are unavailable.
- Encourages proactive availability hygiene across host inventory.

---

## What Is Running Right Now (When Server Is Healthy)

After successful bootstrap, these long-running processes are active:

1. One RabbitMQ consumer for booking confirmed events.
2. One BullMQ worker for payout queue.
3. One BullMQ worker for escalation queue.
4. One BullMQ worker for calendar sync queue.
5. One BullMQ worker for check-in reminder queue.
6. One BullMQ worker for host availability reminder queue.
7. Five repeatable job schedules registered at startup.

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
   - check-in reminder
   - host availability reminder
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
