import amqp from 'amqplib';
import {
  BOOKING_EVENTS_EXCHANGE,
  BOOKING_EVENTS_QUEUE,
} from '../config/constants';
import { env } from '../config/env';
import { BookingModel } from '../models/booking.model';
import { WhatsappLogModel } from '../models/whatsappLog.model';
import { findUserById } from '../repositories/users.repository';
import { emailService } from '../services/email.service';
import { whatsappService } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

export async function startBookingEventConsumer(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URI);
  const channel = await connection.createChannel();

  await channel.assertExchange(BOOKING_EVENTS_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(BOOKING_EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(BOOKING_EVENTS_QUEUE, BOOKING_EVENTS_EXCHANGE, 'booking.confirmed');

  channel.consume(BOOKING_EVENTS_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      const payload = JSON.parse(message.content.toString()) as { bookingId: string };
      const booking = await BookingModel.findById(payload.bookingId).lean();
      if (!booking) {
        channel.ack(message);
        return;
      }

      const host = await findUserById(String(booking.hostId));
      if (!host) {
        channel.ack(message);
        return;
      }

      const guest = await findUserById(String(booking.guestId));
      const guestName = guest?.name?.trim() || 'Guest';

      const bookingId = String(booking._id);
      const checkIn = booking.checkIn.toISOString();
      const checkOut = booking.checkOut.toISOString();
      const paymentStatus = booking.status === 'confirmed' ? 'PAID' : 'NOT PAID';

      try {
        await emailService.sendHostConfirmedBookingEmail({
          to: host.email,
          bookingId,
          guestName,
          paymentStatus,
          checkIn,
          checkOut,
        });
      } catch (error) {
        logger.warn({ err: error, bookingId, hostId: String(host._id) }, 'host booking email notification failed');
      }

      if (host.phoneNumber) {
        try {
          const sent = await whatsappService.sendHostBookingNotification({
            hostPhone: host.phoneNumber,
            bookingId,
            guestName,
            paymentStatus,
            checkIn,
            checkOut,
          });

          await WhatsappLogModel.create({
            bookingId: booking._id,
            messageType: 'host_booking_notification',
            responsePayload: sent.payload,
          });
        } catch (error) {
          logger.warn({ err: error, bookingId, hostId: String(host._id) }, 'host booking whatsapp notification failed');
        }
      } else {
        logger.warn({ bookingId, hostId: String(host._id) }, 'host has no phone number; skipping booking whatsapp notification');
      }

      logger.info({ bookingId }, 'host booking notifications processed');
      channel.ack(message);
    } catch (error) {
      logger.error({ err: error }, 'booking event consumer failed');
      channel.nack(message, false, false);
    }
  });
}
