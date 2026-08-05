import { Queue, Worker } from 'bullmq';
import { CHECKIN_REMINDER_QUEUE_NAME } from '../config/constants';
import { redis } from '../config/redis';
import {
  findConfirmedBookingsForCheckInDate,
  markCheckInReminderSent,
} from '../repositories/bookings.repository';
import { findUserById } from '../repositories/users.repository';
import { emailService } from '../services/email.service';
import { whatsappService } from '../services/whatsapp.service';
import { WhatsappLogModel } from '../models/whatsappLog.model';
import { logger } from '../utils/logger';

export const checkInReminderQueue = new Queue(CHECKIN_REMINDER_QUEUE_NAME, {
  connection: redis,
});

function startAndEndOfToday(): { dayStart: Date; dayEnd: Date } {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return { dayStart, dayEnd };
}

export async function scheduleCheckInReminderJob(): Promise<void> {
  await checkInReminderQueue.add(
    'daily_checkin_reminders',
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export function startCheckInReminderWorker(): Worker {
  return new Worker(
    CHECKIN_REMINDER_QUEUE_NAME,
    async () => {
      const { dayStart, dayEnd } = startAndEndOfToday();
      const bookings = await findConfirmedBookingsForCheckInDate({ dayStart, dayEnd });

      for (const booking of bookings) {
        const [host, guest] = await Promise.all([
          findUserById(String(booking.hostId)),
          findUserById(String(booking.guestId)),
        ]);

        if (!host) {
          continue;
        }

        const bookingId = String(booking._id);
        const checkIn = booking.checkIn.toISOString();
        const checkOut = booking.checkOut.toISOString();
        const guestName = guest?.name?.trim() || 'Guest';

        let delivered = false;

        try {
          await emailService.sendHostCheckInReminderEmail({
            to: host.email,
            bookingId,
            guestName,
            checkIn,
            checkOut,
          });
          delivered = true;
        } catch (error) {
          logger.warn({ err: error, bookingId, hostId: String(host._id) }, 'host check-in reminder email failed');
        }

        if (host.phoneNumber) {
          try {
            const result = await whatsappService.sendHostCheckInReminder({
              hostPhone: host.phoneNumber,
              bookingId,
              guestName,
              checkIn,
              checkOut,
            });

            await WhatsappLogModel.create({
              bookingId: booking._id,
              messageType: 'host_checkin_reminder',
              responsePayload: result.payload,
            });

            delivered = true;
          } catch (error) {
            logger.warn({ err: error, bookingId, hostId: String(host._id) }, 'host check-in reminder whatsapp failed');
          }
        } else {
          logger.warn({ bookingId, hostId: String(host._id) }, 'host has no phone number; skipping check-in reminder whatsapp');
        }

        if (delivered) {
          await markCheckInReminderSent(bookingId);
        }
      }

      if (bookings.length > 0) {
        logger.info({ count: bookings.length }, 'check-in reminder job sent host notifications');
      }
    },
    { connection: redis },
  );
}
