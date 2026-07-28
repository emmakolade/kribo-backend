import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis';
import { PAYOUT_QUEUE_NAME } from '../config/constants';
import { runDailyPayoutSweep } from '../services/payouts.service';

export const payoutQueue = new Queue(PAYOUT_QUEUE_NAME, {
  connection: redis,
});

export async function schedulePayoutSweep(): Promise<void> {
  await payoutQueue.add(
    'daily_payout_sweep',
    {},
    {
      repeat: { pattern: '0 1 * * *' },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export function startPayoutWorker(): Worker {
  return new Worker(
    PAYOUT_QUEUE_NAME,
    async () => {
      await runDailyPayoutSweep();
    },
    { connection: redis },
  );
}
