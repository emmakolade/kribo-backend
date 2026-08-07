import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { PAYOUT_QUEUE_NAME } from '../config/constants';
import { processHostPayoutRequest } from '../services/payouts.service';

export const payoutQueue = new Queue(PAYOUT_QUEUE_NAME, {
  connection: redis,
});

export async function enqueueHostPayoutRequest(bookingId: string): Promise<void> {
  await payoutQueue.add(
    'host_payout_request',
    { bookingId },
    {
      jobId: `host_payout_request_${bookingId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export function startPayoutWorker(): Worker {
  return new Worker(
    PAYOUT_QUEUE_NAME,
    async (job) => {
      if (job.name === 'host_payout_request') {
        const payload = job.data as { bookingId?: string };
        if (!payload.bookingId) {
          throw new Error('host payout request missing bookingId');
        }

        await processHostPayoutRequest(payload.bookingId);
        return;
      }

      throw new Error(`unknown payout job: ${job.name}`);
    },
    { connection: redis },
  );
}
