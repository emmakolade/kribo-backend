import amqp from 'amqplib';
import { env } from '../config/env';
import { BOOKING_EVENTS_EXCHANGE } from '../config/constants';

let channel: amqp.Channel | null = null;

export async function getProducerChannel(): Promise<amqp.Channel> {
  if (channel) {
    return channel;
  }

  const connection = await amqp.connect(env.RABBITMQ_URI);
  channel = await connection.createChannel();
  await channel.assertExchange(BOOKING_EVENTS_EXCHANGE, 'topic', { durable: true });
  return channel;
}

export async function publishBookingEvent(routingKey: string, payload: unknown): Promise<void> {
  const producerChannel = await getProducerChannel();
  producerChannel.publish(
    BOOKING_EVENTS_EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true },
  );
}
