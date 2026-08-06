import twilio from 'twilio';
import { env } from '../config/env';

export interface WhatsappService {
  sendHostBookingNotification(input: {
    hostPhone: string;
    bookingId: string;
    guestName: string;
    paymentStatus: 'PAID' | 'NOT PAID';
    checkIn: string;
    checkOut: string;
  }): Promise<{ messageId: string; payload: unknown }>;
  sendHostCheckInReminder(input: {
    hostPhone: string;
    bookingId: string;
    guestName: string;
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

function toBsonSafeTwilioPayload(message: {
  sid?: string;
  accountSid?: string;
  messagingServiceSid?: string | null;
  status?: string;
  from?: string | null;
  to?: string | null;
  body?: string | null;
  direction?: string;
  dateCreated?: Date | string | null;
  dateUpdated?: Date | string | null;
  dateSent?: Date | string | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  price?: string | null;
  priceUnit?: string | null;
  apiVersion?: string;
  uri?: string;
}): Record<string, unknown> {
  return {
    sid: message.sid ?? null,
    accountSid: message.accountSid ?? null,
    messagingServiceSid: message.messagingServiceSid ?? null,
    status: message.status ?? null,
    from: message.from ?? null,
    to: message.to ?? null,
    body: message.body ?? null,
    direction: message.direction ?? null,
    dateCreated: message.dateCreated ? new Date(message.dateCreated).toISOString() : null,
    dateUpdated: message.dateUpdated ? new Date(message.dateUpdated).toISOString() : null,
    dateSent: message.dateSent ? new Date(message.dateSent).toISOString() : null,
    errorCode: message.errorCode ?? null,
    errorMessage: message.errorMessage ?? null,
    price: message.price ?? null,
    priceUnit: message.priceUnit ?? null,
    apiVersion: message.apiVersion ?? null,
    uri: message.uri ?? null,
  };
}

class LiveWhatsappService implements WhatsappService {
  private readonly client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

  public async sendHostBookingNotification(input: {
    hostPhone: string;
    bookingId: string;
    guestName: string;
    paymentStatus: 'PAID' | 'NOT PAID';
    checkIn: string;
    checkOut: string;
  }): Promise<{ messageId: string; payload: unknown }> {
    const body = [
      'New booking received on Kribo.',
      `Booking ID: ${input.bookingId}`,
      `Guest Name: ${input.guestName}`,
      `Payment Status: *${input.paymentStatus}*`,
      `Check-in: ${input.checkIn}`,
      `Check-out: ${input.checkOut}`,
      'Please prepare to host this guest.',
    ].join('\n');

    const data = await this.client.messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to: normalizeWhatsappAddress(input.hostPhone),
      body,
    });

    return {
      messageId: data.sid,
      payload: toBsonSafeTwilioPayload(data),
    };
  }

  public async sendHostCheckInReminder(input: {
    hostPhone: string;
    bookingId: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
  }): Promise<{ messageId: string; payload: unknown }> {
    const checkInCommand = `CHECK-IN ${input.bookingId}`;

    if (env.TWILIO_CHECKIN_REMINDER_CONTENT_SID) {
      const contentVariables = {
        1: input.bookingId,
        2: input.guestName,
        3: input.checkIn,
        4: input.checkOut,
        5: checkInCommand,
      };

      const data = await this.client.messages.create({
        from: env.TWILIO_WHATSAPP_FROM!,
        to: normalizeWhatsappAddress(input.hostPhone),
        contentSid: env.TWILIO_CHECKIN_REMINDER_CONTENT_SID,
        contentVariables: JSON.stringify(contentVariables),
      });

      return {
        messageId: data.sid,
        payload: toBsonSafeTwilioPayload(data),
      };
    }

    const body = [
      'Check-in reminder for today on Kribo.',
      `Booking ID: ${input.bookingId}`,
      `Guest Name: ${input.guestName}`,
      'Payment Status: *PAID*',
      `Check-in: ${input.checkIn}`,
      `Check-out: ${input.checkOut}`,
      'You can mark check-in here on WhatsApp by replying:',
      checkInCommand,
      'Recommended: Login to the Kribo app and confirm check-in there.',
      'After check-in, you can withdraw your payout in the app.',
    ].join('\n');

    const data = await this.client.messages.create({
      from: env.TWILIO_WHATSAPP_FROM!,
      to: normalizeWhatsappAddress(input.hostPhone),
      body,
    });

    return {
      messageId: data.sid,
      payload: toBsonSafeTwilioPayload(data),
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
      payload: toBsonSafeTwilioPayload(data),
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
