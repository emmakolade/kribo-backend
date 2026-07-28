import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import { OPS_ALERT_QUEUE } from '../config/constants';

export const opsAlertQueue = new Queue(OPS_ALERT_QUEUE, {
  connection: redis,
});

export async function pushOpsAlert(payload: unknown): Promise<void> {
  await opsAlertQueue.add('escalated_booking', payload);
}
