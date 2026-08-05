import { Queue, Worker } from 'bullmq';
import { HOST_AVAILABILITY_REMINDER_QUEUE_NAME } from '../config/constants';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { PropertyModel } from '../models/property.model';
import { findUserById } from '../repositories/users.repository';
import { emailService } from '../services/email.service';
import { whatsappService } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

type HostPropertyStatus = {
  propertyName: string;
  bookingEnabled: boolean;
};

export const hostAvailabilityReminderQueue = new Queue(HOST_AVAILABILITY_REMINDER_QUEUE_NAME, {
  connection: redis,
});

function buildWhatsappText(properties: HostPropertyStatus[]): string {
  const authUrl = new URL('/auth', env.HOST_APP_BASE_URL);
  authUrl.searchParams.set('role', 'host');
  authUrl.searchParams.set('mode', 'signin');
  authUrl.searchParams.set('redirect', '/host/properties/manage');

  const lines = properties.map((property) => {
    const status = property.bookingEnabled ? 'ON' : 'OFF';
    return `- ${property.propertyName}: ${status}`;
  });

  return [
    'Kribo availability reminder.',
    'Turn ON availability when your property can accept bookings.',
    'Turn OFF availability when your property is not available to avoid receiving bookings.',
    'Current status:',
    ...lines,
    `Login to manage availability: ${authUrl.toString()}`,
  ].join('\n');
}

export async function scheduleHostAvailabilityReminderJob(): Promise<void> {
  await hostAvailabilityReminderQueue.add(
    'daily_host_availability_reminder',
    {},
    {
      repeat: { pattern: '0 9 * * *' },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export function startHostAvailabilityReminderWorker(): Worker {
  return new Worker(
    HOST_AVAILABILITY_REMINDER_QUEUE_NAME,
    async () => {
      const properties = await PropertyModel.find({}).lean();

      const byHost = new Map<string, HostPropertyStatus[]>();
      for (const property of properties) {
        const hostId = String(property.hostId);
        const entry = byHost.get(hostId) ?? [];
        entry.push({
          propertyName: property.name,
          bookingEnabled: Boolean(property.bookingEnabled ?? true),
        });
        byHost.set(hostId, entry);
      }

      for (const [hostId, statuses] of byHost.entries()) {
        const host = await findUserById(hostId);
        if (!host) {
          continue;
        }

        let delivered = false;

        try {
          await emailService.sendHostAvailabilityReminderEmail({
            to: host.email,
            properties: statuses,
          });
          delivered = true;
        } catch (error) {
          logger.warn({ err: error, hostId }, 'host availability reminder email failed');
        }

        if (host.phoneNumber) {
          try {
            await whatsappService.sendGuestUpdate({
              guestPhone: host.phoneNumber,
              text: buildWhatsappText(statuses),
            });
            delivered = true;
          } catch (error) {
            logger.warn({ err: error, hostId }, 'host availability reminder whatsapp failed');
          }
        }

        if (delivered) {
          logger.info({ hostId, propertyCount: statuses.length }, 'host availability reminder sent');
        }
      }
    },
    { connection: redis },
  );
}
