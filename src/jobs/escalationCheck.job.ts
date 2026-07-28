import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { ESCALATION_QUEUE_NAME } from '../config/constants';
import { escalateExpiredBookings } from '../services/bookings.service';
import { pushOpsAlert } from '../queue/opsAlerts.producer';

export const escalationQueue = new Queue(ESCALATION_QUEUE_NAME, {
  connection: redis,
});

export async function scheduleEscalationChecks(): Promise<void> {
  await escalationQueue.add(
    'check_escalations',
    {},
    {
      repeat: { every: 60_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export function startEscalationWorker(): Worker {
  return new Worker(
    ESCALATION_QUEUE_NAME,
    async () => {
      const escalated = await escalateExpiredBookings();
      if (escalated > 0) {
        await pushOpsAlert({ escalated });
      }
    },
    { connection: redis },
  );
}
