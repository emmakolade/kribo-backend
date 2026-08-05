import mongoose from 'mongoose';
import { app } from './app';
import { env } from './config/env';
import { scheduleCalendarSyncPrompt, startCalendarSyncWorker } from './jobs/calendarSync.job';
import { scheduleCheckInReminderJob, startCheckInReminderWorker } from './jobs/checkInReminder.job';
import { scheduleEscalationChecks, startEscalationWorker } from './jobs/escalationCheck.job';
import { scheduleHostAvailabilityReminderJob, startHostAvailabilityReminderWorker } from './jobs/hostAvailabilityReminder.job';
import { schedulePayoutSweep, startPayoutWorker } from './jobs/payoutSweep.job';
import { startBookingEventConsumer } from './queue/bookingEvents.consumer';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  await startBookingEventConsumer();

  await schedulePayoutSweep();
  await scheduleEscalationChecks();
  await scheduleCalendarSyncPrompt();
  await scheduleCheckInReminderJob();
  await scheduleHostAvailabilityReminderJob();

  startPayoutWorker();
  startEscalationWorker();
  startCalendarSyncWorker();
  startCheckInReminderWorker();
  startHostAvailabilityReminderWorker();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'server started');
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'failed to start server');
  process.exit(1);
});
