import twilio from 'twilio';
import { env } from '../config/env';

export interface WhatsappService {
  sendHostConfirmation(input: {
    hostPhone: string;
    bookingId: string;
    checkIn: string;
    checkOut: string;
  }): Promise<{ messageId: string; payload: unknown }>;
  sendGuestUpdate(input: { guestPhone: string; text: string }): Promise<{ messageId: string; payload: unknown }>;
  verifyWebhookSignature(input: {
    signature: string | undefined;
    requestUrl: string;
    payload: Record<string, string>;
  }): boolean;
}

function normalizeWhatsappAddress(phone: string): string {
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}

class LiveWhatsappService implements WhatsappService {
  private readonly client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

  public async sendHostConfirmation(input: {
    hostPhone: string;
    bookingId: string;
    checkIn: string;
    checkOut: string;
  }): Promise<{ messageId: string; payload: unknown }> {
    const body = [
      'New booking request on Kribo.',
      `Booking ID: ${input.bookingId}`,
      `Check-in: ${input.checkIn}`,
      `Check-out: ${input.checkOut}`,
      `Reply: ACCEPT ${input.bookingId} or DECLINE ${input.bookingId}`,
    ].join('\n');

    const data = await this.client.messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to: normalizeWhatsappAddress(input.hostPhone),
      body,
    });

    return {
      messageId: data.sid,
      payload: data,
    };
  }

  public async sendGuestUpdate(input: { guestPhone: string; text: string }): Promise<{ messageId: string; payload: unknown }> {
    const data = await this.client.messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to: normalizeWhatsappAddress(input.guestPhone),
      body: input.text,
    });

    return {
      messageId: data.sid,
      payload: data,
    };
  }

  public verifyWebhookSignature(input: {
    signature: string | undefined;
    requestUrl: string;
    payload: Record<string, string>;
  }): boolean {
    if (!input.signature) {
      return false;
    }

    return twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN!,
      input.signature,
      input.requestUrl,
      input.payload,
    );
  }
}

export const whatsappService: WhatsappService = new LiveWhatsappService();
