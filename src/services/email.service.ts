import nodemailer from 'nodemailer';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { EmailOtpPurpose } from '../constants/enums';
import { env } from '../config/env';

interface SendOtpEmailInput {
  to: string;
  otp: string;
  purpose: EmailOtpPurpose;
}

interface SendHostConfirmedBookingEmailInput {
  to: string;
  bookingId: string;
  guestName: string;
  paymentStatus: 'PAID' | 'NOT PAID';
  checkIn: string;
  checkOut: string;
}

interface SendHostCheckInReminderEmailInput {
  to: string;
  bookingId: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
}

interface SendHostAvailabilityReminderEmailInput {
  to: string;
  properties: Array<{
    propertyName: string;
    bookingEnabled: boolean;
  }>;
}

export interface EmailSendResult {
  provider: 'gmail_smtp' | 'aws_ses';
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  response: string | null;
}

interface EmailService {
  sendOtpEmail(input: SendOtpEmailInput): Promise<EmailSendResult>;
  sendHostConfirmedBookingEmail(input: SendHostConfirmedBookingEmailInput): Promise<EmailSendResult>;
  sendHostCheckInReminderEmail(input: SendHostCheckInReminderEmailInput): Promise<EmailSendResult>;
  sendHostAvailabilityReminderEmail(input: SendHostAvailabilityReminderEmailInput): Promise<EmailSendResult>;
}

function buildHostLoginRedirectUrl(redirectPath: string): string {
  const authUrl = new URL('/auth', env.HOST_APP_BASE_URL);
  authUrl.searchParams.set('role', 'host');
  authUrl.searchParams.set('mode', 'signin');
  authUrl.searchParams.set('redirect', redirectPath);
  return authUrl.toString();
}

function formatPropertyAvailabilityLines(properties: Array<{ propertyName: string; bookingEnabled: boolean }>): string[] {
  return properties.map((property) => {
    const state = property.bookingEnabled ? 'ON' : 'OFF';
    return `- ${property.propertyName}: ${state}`;
  });
}

class EnvironmentEmailService implements EmailService {
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

  private getTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    if (this.transporter) {
      return this.transporter;
    }

    if (env.NODE_ENV === 'production') {
      const sesClient = new SESv2Client({ region: env.AWS_REGION! });
      this.transporter = nodemailer.createTransport({
        SES: { sesClient, SendEmailCommand },
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }

    return this.transporter;
  }

  public async sendOtpEmail(input: SendOtpEmailInput): Promise<EmailSendResult> {
    const provider = env.NODE_ENV === 'production' ? 'aws_ses' : 'gmail_smtp';

    const transporter = this.getTransporter();
    const fromEmail = env.NODE_ENV === 'production' ? env.AWS_SES_FROM_EMAIL : env.SMTP_FROM_EMAIL;

    const info = await transporter.sendMail({
      from: fromEmail,
      to: input.to,
      subject: 'Kribo verification code',
      text: `Your verification code is ${input.otp}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong>${input.otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });

    return {
      provider,
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map((value) => String(value)),
      rejected: (info.rejected ?? []).map((value) => String(value)),
      response: info.response ?? null,
    };
  }

  public async sendHostConfirmedBookingEmail(input: SendHostConfirmedBookingEmailInput): Promise<EmailSendResult> {
    const provider = env.NODE_ENV === 'production' ? 'aws_ses' : 'gmail_smtp';
    const transporter = this.getTransporter();
    const fromEmail = env.NODE_ENV === 'production' ? env.AWS_SES_FROM_EMAIL : env.SMTP_FROM_EMAIL;
    const reviewBookingLink = buildHostLoginRedirectUrl(`/host/bookings/${encodeURIComponent(input.bookingId)}`);

    const info = await transporter.sendMail({
      from: fromEmail,
      to: input.to,
      subject: `New confirmed booking ${input.bookingId}`,
      text: [
        'New booking received on Kribo.',
        `Booking ID: ${input.bookingId}`,
        `Guest Name: ${input.guestName}`,
        `Payment Status: ${input.paymentStatus}`,
        `Check-in: ${input.checkIn}`,
        `Check-out: ${input.checkOut}`,
        'Please prepare to host this guest.',
        `Login to view booking: ${reviewBookingLink}`,
      ].join('\n'),
      html: [
        '<p>New booking received on Kribo.</p>',
        `<p><strong>Booking ID:</strong> ${input.bookingId}</p>`,
        `<p><strong>Guest Name:</strong> ${input.guestName}</p>`,
        `<p><strong>Payment Status:</strong> ${input.paymentStatus}</p>`,
        `<p><strong>Check-in:</strong> ${input.checkIn}</p>`,
        `<p><strong>Check-out:</strong> ${input.checkOut}</p>`,
        '<p>Please prepare to host this guest.</p>',
        `<p><a href="${reviewBookingLink}">Login and open this confirmed booking</a></p>`,
      ].join(''),
    });

    return {
      provider,
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map((value) => String(value)),
      rejected: (info.rejected ?? []).map((value) => String(value)),
      response: info.response ?? null,
    };
  }

  public async sendHostCheckInReminderEmail(input: SendHostCheckInReminderEmailInput): Promise<EmailSendResult> {
    const provider = env.NODE_ENV === 'production' ? 'aws_ses' : 'gmail_smtp';
    const transporter = this.getTransporter();
    const fromEmail = env.NODE_ENV === 'production' ? env.AWS_SES_FROM_EMAIL : env.SMTP_FROM_EMAIL;
    const checkInLink = buildHostLoginRedirectUrl(`/host/bookings/${encodeURIComponent(input.bookingId)}`);

    const info = await transporter.sendMail({
      from: fromEmail,
      to: input.to,
      subject: `Check-in due today for booking ${input.bookingId}`,
      text: [
        'Check-in reminder for today on Kribo.',
        `Booking ID: ${input.bookingId}`,
        `Guest Name: ${input.guestName}`,
        'Payment Status: PAID',
        `Check-in: ${input.checkIn}`,
        `Check-out: ${input.checkOut}`,
        `WhatsApp command: CHECK-IN ${input.bookingId}`,
        'Recommended: login to the Kribo app and confirm check-in there.',
        'After check-in, you can withdraw your payout in the app.',
        `Login to check in: ${checkInLink}`,
      ].join('\n'),
      html: [
        '<p>Check-in reminder for today on Kribo.</p>',
        `<p><strong>Booking ID:</strong> ${input.bookingId}</p>`,
        `<p><strong>Guest Name:</strong> ${input.guestName}</p>`,
        '<p><strong>Payment Status:</strong> PAID</p>',
        `<p><strong>Check-in:</strong> ${input.checkIn}</p>`,
        `<p><strong>Check-out:</strong> ${input.checkOut}</p>`,
        `<p><strong>WhatsApp command:</strong> CHECK-IN ${input.bookingId}</p>`,
        '<p>Recommended: login to the Kribo app and confirm check-in there.</p>',
        '<p>After check-in, you can withdraw your payout in the app.</p>',
        `<p><a href="${checkInLink}">Login and go to the check-in page</a></p>`,
      ].join(''),
    });

    return {
      provider,
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map((value) => String(value)),
      rejected: (info.rejected ?? []).map((value) => String(value)),
      response: info.response ?? null,
    };
  }

  public async sendHostAvailabilityReminderEmail(input: SendHostAvailabilityReminderEmailInput): Promise<EmailSendResult> {
    const provider = env.NODE_ENV === 'production' ? 'aws_ses' : 'gmail_smtp';
    const transporter = this.getTransporter();
    const fromEmail = env.NODE_ENV === 'production' ? env.AWS_SES_FROM_EMAIL : env.SMTP_FROM_EMAIL;
    const manageAvailabilityLink = buildHostLoginRedirectUrl('/host/properties/manage');
    const propertyLines = formatPropertyAvailabilityLines(input.properties);

    const info = await transporter.sendMail({
      from: fromEmail,
      to: input.to,
      subject: 'Kribo availability reminder',
      text: [
        'Availability reminder from Kribo.',
        'Turn ON availability when your property can accept bookings.',
        'Turn OFF availability when your property is not available to avoid receiving bookings.',
        '',
        'Current status:',
        ...propertyLines,
        '',
        `Login to manage availability: ${manageAvailabilityLink}`,
      ].join('\n'),
      html: [
        '<p>Availability reminder from Kribo.</p>',
        '<p>Turn <strong>ON</strong> availability when your property can accept bookings.</p>',
        '<p>Turn <strong>OFF</strong> availability when your property is not available to avoid receiving bookings.</p>',
        '<p><strong>Current status:</strong></p>',
        `<ul>${input.properties.map((property) => `<li>${property.propertyName}: <strong>${property.bookingEnabled ? 'ON' : 'OFF'}</strong></li>`).join('')}</ul>`,
        `<p><a href="${manageAvailabilityLink}">Login and manage property availability</a></p>`,
      ].join(''),
    });

    return {
      provider,
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map((value) => String(value)),
      rejected: (info.rejected ?? []).map((value) => String(value)),
      response: info.response ?? null,
    };
  }
}

export const emailService: EmailService = new EnvironmentEmailService();
