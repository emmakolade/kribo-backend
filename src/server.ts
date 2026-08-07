import mongoose from 'mongoose';
import { app } from './app';
import { env } from './config/env';
import { scheduleCalendarSyncPrompt, startCalendarSyncWorker } from './jobs/calendarSync.job';
import { scheduleCheckInReminderJob, startCheckInReminderWorker } from './jobs/checkInReminder.job';
import { scheduleEscalationChecks, startEscalationWorker } from './jobs/escalationCheck.job';
import { scheduleHostAvailabilityReminderJob, startHostAvailabilityReminderWorker } from './jobs/hostAvailabilityReminder.job';
import { startPayoutWorker } from './jobs/payoutSweep.job';
import { startBookingEventConsumer } from './queue/bookingEvents.consumer';
import { logger } from './utils/logger';

async function dropObsoleteBookingIndexes(): Promise<void> {
  try {
    const bookingsCollection = mongoose.connection.collection('bookings');
    const indexes = await bookingsCollection.indexes();
    const hasLegacyPaystackReferenceIndex = indexes.some((index) => index.name === 'paystackReference_1');

    if (!hasLegacyPaystackReferenceIndex) {
      return;
    }

    await bookingsCollection.dropIndex('paystackReference_1');
    logger.info('dropped obsolete bookings.paystackReference_1 index');
  }
  catch (error) {
    logger.warn({ err: error }, 'could not drop obsolete bookings index; continuing startup');
  }
}

async function bootstrap(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  await dropObsoleteBookingIndexes();
  await startBookingEventConsumer();

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
