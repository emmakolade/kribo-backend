import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { CALENDAR_SYNC_QUEUE_NAME } from '../config/constants';
import { UserModel } from '../models/user.model';
import { whatsappService } from '../services/whatsapp.service';

export const calendarSyncQueue = new Queue(CALENDAR_SYNC_QUEUE_NAME, {
  connection: redis,
});

export async function scheduleCalendarSyncPrompt(): Promise<void> {
  await calendarSyncQueue.add(
    'weekend_sync_prompt',
    {},
    {
      repeat: { pattern: '0 18 * * 4' },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export function startCalendarSyncWorker(): Worker {
  return new Worker(
    CALENDAR_SYNC_QUEUE_NAME,
    async () => {
      const hosts = await UserModel.find({ role: 'host' }).lean();
      const hostsWithPhone = hosts.filter((host): host is typeof host & { phoneNumber: string } => typeof host.phoneNumber === 'string' && host.phoneNumber.length > 0);
      await Promise.all(
        hostsWithPhone.map((host) =>
          whatsappService.sendGuestUpdate({
            guestPhone: host.phoneNumber,
            text: 'Do you have offline bookings this weekend? Reply YES to auto-block dates.',
          }),
        ),
      );
    },
    { connection: redis },
  );
}
