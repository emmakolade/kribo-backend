import amqp from 'amqplib';
import {
  BOOKING_CONFIRMATION_WINDOW_MINUTES_FUTURE,
  BOOKING_CONFIRMATION_WINDOW_MINUTES_SAME_DAY,
  BOOKING_EVENTS_EXCHANGE,
  BOOKING_EVENTS_QUEUE,
  REDIS_TIMER_PREFIX,
} from '../config/constants';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { BookingModel } from '../models/booking.model';
import { WhatsappLogModel } from '../models/whatsappLog.model';
import { findUserById } from '../repositories/users.repository';
import { whatsappService } from '../services/whatsapp.service';
import { isSameDay } from '../utils/dates';
import { logger } from '../utils/logger';

function timerSeconds(checkIn: Date): number {
  const now = new Date();
  const minutes = isSameDay(now, checkIn)
    ? BOOKING_CONFIRMATION_WINDOW_MINUTES_SAME_DAY
    : BOOKING_CONFIRMATION_WINDOW_MINUTES_FUTURE;
  return minutes * 60;
}

export async function startBookingEventConsumer(): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URI);
  const channel = await connection.createChannel();

  await channel.assertExchange(BOOKING_EVENTS_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(BOOKING_EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(BOOKING_EVENTS_QUEUE, BOOKING_EVENTS_EXCHANGE, 'booking.pending');

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

      if (!host.phoneNumber) {
        logger.warn({ bookingId: String(booking._id), hostId: String(host._id) }, 'host has no phone number; skipping confirmation message');
        channel.ack(message);
        return;
      }

      const sent = await whatsappService.sendHostConfirmation({
        hostPhone: host.phoneNumber,
        bookingId: String(booking._id),
        checkIn: booking.checkIn.toISOString(),
        checkOut: booking.checkOut.toISOString(),
      });

      await WhatsappLogModel.create({
        bookingId: booking._id,
        messageType: 'host_confirmation',
        responsePayload: sent.payload,
      });

      await redis.set(
        `${REDIS_TIMER_PREFIX}${String(booking._id)}`,
        'pending',
        'EX',
        timerSeconds(booking.checkIn),
      );

      logger.info({ bookingId: String(booking._id) }, 'host confirmation message sent');
      channel.ack(message);
    } catch (error) {
      logger.error({ err: error }, 'booking event consumer failed');
      channel.nack(message, false, false);
    }
  });
}
