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

interface SendAdminManualPayoutRequestEmailInput {
  to: string[];
  bookingId: string;
  hostName: string;
  hostEmail: string;
  amount: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  recipientCode: string;
  transferReference: string;
}

interface SendHostOnboardingRejectedEmailInput {
  to: string;
  hostName: string;
  reasonNote: string;
}

interface SendAdminHostOnboardingSubmittedEmailInput {
  to: string[];
  hostName: string;
  hostEmail: string;
  propertyName: string;
  propertyType: string;
}

interface SendHostOnboardingApprovedEmailInput {
  to: string;
  hostName: string;
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
  sendAdminManualPayoutRequestEmail(input: SendAdminManualPayoutRequestEmailInput): Promise<EmailSendResult>;
  sendHostOnboardingRejectedEmail(input: SendHostOnboardingRejectedEmailInput): Promise<EmailSendResult>;
  sendAdminHostOnboardingSubmittedEmail(input: SendAdminHostOnboardingSubmittedEmailInput): Promise<EmailSendResult>;
  sendHostOnboardingApprovedEmail(input: SendHostOnboardingApprovedEmailInput): Promise<EmailSendResult>;
}

function buildHostLoginRedirectUrl(redirectPath: string): string {
  const authUrl = new URL('/auth', env.HOST_APP_BASE_URL);
  authUrl.searchParams.set('role', 'host');
  authUrl.searchParams.set('mode', 'signin');
  authUrl.searchParams.set('redirect', redirectPath);
  return authUrl.toString();
}

function buildAdminLoginRedirectUrl(redirectPath: string): string {
  const authUrl = new URL('/auth', env.HOST_APP_BASE_URL);
  authUrl.searchParams.set('role', 'admin');
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

interface KriboTemplateInput {
  title: string;
  bodyHtml: string;
}

const KRIBO_COLORS = {
  teal: '#0F5E5A',
  terracotta: '#E2703A',
  offWhite: '#F7F5F1',
  charcoal: '#232323',
  success: '#4C8C6B',
};

function buildKriboLogoHtml(): string {
  if (env.KRIBO_LOGO_URL) {
    return [
      `<img src="${env.KRIBO_LOGO_URL}" alt="Kribo" style="display:block;max-height:38px;width:auto;" />`,
    ].join('');
  }

  return [
    `<span style="font-size:28px;font-weight:700;letter-spacing:0.2px;color:#ffffff;font-family:'Outfit','Segoe UI',Arial,sans-serif;">Kribo</span>`,
  ].join('');
}

function buildKriboEmailTemplate(input: KriboTemplateInput): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />',
    `<title>${input.title}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:${KRIBO_COLORS.offWhite};color:${KRIBO_COLORS.charcoal};font-family:'Outfit','Segoe UI',Arial,sans-serif;">`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F5F1;padding:24px 12px;">',
    '<tr>',
    '<td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #EDE7DD;border-radius:18px;overflow:hidden;">',
    '<tr>',
    `<td style="padding:22px 24px;background:linear-gradient(135deg, ${KRIBO_COLORS.teal} 0%, #0B4B48 100%);">${buildKriboLogoHtml()}</td>`,
    '</tr>',
    '<tr>',
    `<td style="padding:26px 24px 20px 24px;font-family:'Outfit','Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.6;color:${KRIBO_COLORS.charcoal};">`,
    `<h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.3;color:${KRIBO_COLORS.teal};">${input.title}</h1>`,
    input.bodyHtml,
    '</td>',
    '</tr>',
    '<tr>',
    `<td style="padding:14px 24px 24px 24px;font-family:'Outfit','Segoe UI',Arial,sans-serif;font-size:12px;color:#6E665B;border-top:1px solid #EFE8DE;">Kribo • Better bookings, reliable stays.</td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

class EnvironmentEmailService implements EmailService {
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

  private mapSendResult(info: SMTPTransport.SentMessageInfo): EmailSendResult {
    const provider = env.NODE_ENV === 'production' ? 'aws_ses' : 'gmail_smtp';

    return {
      provider,
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map((value) => String(value)),
      rejected: (info.rejected ?? []).map((value) => String(value)),
      response: info.response ?? null,
    };
  }

  private async sendKriboEmail(input: {
    to: string | string[];
    subject: string;
    title: string;
    text: string;
    bodyHtml: string;
  }): Promise<EmailSendResult> {
    const transporter = this.getTransporter();
    const fromEmail = env.NODE_ENV === 'production' ? env.AWS_SES_FROM_EMAIL : env.SMTP_FROM_EMAIL;

    const info = await transporter.sendMail({
      from: fromEmail,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: buildKriboEmailTemplate({
        title: input.title,
        bodyHtml: input.bodyHtml,
      }),
    });

    return this.mapSendResult(info);
  }

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
    return this.sendKriboEmail({
      to: input.to,
      subject: 'Kribo verification code',
      title: 'Verify your email',
      text: `Your verification code is ${input.otp}. It expires in 10 minutes.`,
      bodyHtml: `<p>Your verification code is <strong>${input.otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
  }

  public async sendHostConfirmedBookingEmail(input: SendHostConfirmedBookingEmailInput): Promise<EmailSendResult> {
    const reviewBookingLink = buildHostLoginRedirectUrl(`/host/bookings/${encodeURIComponent(input.bookingId)}`);

    return this.sendKriboEmail({
      to: input.to,
      subject: `New confirmed booking ${input.bookingId}`,
      title: 'New confirmed booking',
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
      bodyHtml: [
        '<p>New booking received on Kribo.</p>',
        `<p><strong>Booking ID:</strong> ${input.bookingId}</p>`,
        `<p><strong>Guest Name:</strong> ${input.guestName}</p>`,
        `<p><strong>Payment Status:</strong> ${input.paymentStatus}</p>`,
        `<p><strong>Check-in:</strong> ${input.checkIn}</p>`,
        `<p><strong>Check-out:</strong> ${input.checkOut}</p>`,
        '<p>Please prepare to host this guest.</p>',
        `<p><a href="${reviewBookingLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${KRIBO_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;">Open booking</a></p>`,
      ].join(''),
    });
  }

  public async sendHostCheckInReminderEmail(input: SendHostCheckInReminderEmailInput): Promise<EmailSendResult> {
    const checkInLink = buildHostLoginRedirectUrl(`/host/bookings/${encodeURIComponent(input.bookingId)}`);

    return this.sendKriboEmail({
      to: input.to,
      subject: `Check-in due today for booking ${input.bookingId}`,
      title: 'Check-in reminder',
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
      bodyHtml: [
        '<p>Check-in reminder for today on Kribo.</p>',
        `<p><strong>Booking ID:</strong> ${input.bookingId}</p>`,
        `<p><strong>Guest Name:</strong> ${input.guestName}</p>`,
        '<p><strong>Payment Status:</strong> <span style="color:#4C8C6B;">PAID</span></p>',
        `<p><strong>Check-in:</strong> ${input.checkIn}</p>`,
        `<p><strong>Check-out:</strong> ${input.checkOut}</p>`,
        `<p><strong>WhatsApp command:</strong> CHECK-IN ${input.bookingId}</p>`,
        '<p>Recommended: login to the Kribo app and confirm check-in there.</p>',
        '<p>After check-in, you can withdraw your payout in the app.</p>',
        `<p><a href="${checkInLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${KRIBO_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;">Go to check-in</a></p>`,
      ].join(''),
    });
  }

  public async sendHostAvailabilityReminderEmail(input: SendHostAvailabilityReminderEmailInput): Promise<EmailSendResult> {
    const manageAvailabilityLink = buildHostLoginRedirectUrl('/host/properties/manage');
    const propertyLines = formatPropertyAvailabilityLines(input.properties);

    return this.sendKriboEmail({
      to: input.to,
      subject: 'Kribo availability reminder',
      title: 'Availability reminder',
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
      bodyHtml: [
        '<p>Availability reminder from Kribo.</p>',
        '<p>Turn <strong style="color:#4C8C6B;">ON</strong> availability when your property can accept bookings.</p>',
        '<p>Turn <strong style="color:#E2703A;">OFF</strong> availability when your property is not available to avoid receiving bookings.</p>',
        '<p><strong>Current status:</strong></p>',
        `<ul>${input.properties.map((property) => `<li>${property.propertyName}: <strong>${property.bookingEnabled ? 'ON' : 'OFF'}</strong></li>`).join('')}</ul>`,
        `<p><a href="${manageAvailabilityLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${KRIBO_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;">Manage availability</a></p>`,
      ].join(''),
    });
  }

  public async sendAdminManualPayoutRequestEmail(input: SendAdminManualPayoutRequestEmailInput): Promise<EmailSendResult> {

    return this.sendKriboEmail({
      to: input.to,
      subject: `Manual payout required for booking ${input.bookingId}`,
      title: 'Manual payout required',
      text: [
        'A host payout has been requested and requires manual transfer.',
        `Booking ID: ${input.bookingId}`,
        `Host Name: ${input.hostName}`,
        `Host Email: ${input.hostEmail}`,
        `Amount (NGN): ${input.amount}`,
        `Bank Name: ${input.bankName}`,
        `Account Name: ${input.accountName}`,
        `Account Number: ${input.accountNumber}`,
        `Recipient Code: ${input.recipientCode}`,
        `Transfer Reference: ${input.transferReference}`,
        'Please complete the transfer manually in Paystack and then mark payout as completed in the system.',
      ].join('\n'),
      bodyHtml: [
        '<p>A host payout has been requested and requires manual transfer.</p>',
        '<p style="margin:16px 0;padding:14px;border:1px solid #EFE8DE;border-radius:12px;background:#FCFAF7;">',
        `<strong>Booking ID:</strong> ${input.bookingId}<br/>`,
        `<strong>Host Name:</strong> ${input.hostName}<br/>`,
        `<strong>Host Email:</strong> ${input.hostEmail}<br/>`,
        `<strong>Amount (NGN):</strong> ${input.amount}<br/>`,
        `<strong>Bank Name:</strong> ${input.bankName}<br/>`,
        `<strong>Account Name:</strong> ${input.accountName}<br/>`,
        `<strong>Account Number:</strong> ${input.accountNumber}<br/>`,
        `<strong>Recipient Code:</strong> ${input.recipientCode}<br/>`,
        `<strong>Transfer Reference:</strong> ${input.transferReference}`,
        '</p>',
        `<p><span style="display:inline-block;padding:8px 12px;border-radius:999px;background:${KRIBO_COLORS.terracotta};color:#ffffff;font-weight:600;">Action needed: Manual transfer</span></p>`,
        '<p>Please complete the transfer manually in Paystack and then mark payout as completed in the system.</p>',
      ].join(''),
    });
  }

  public async sendHostOnboardingRejectedEmail(input: SendHostOnboardingRejectedEmailInput): Promise<EmailSendResult> {
    const loginLink = buildHostLoginRedirectUrl('/host/onboarding');
    const safeReason = escapeHtml(input.reasonNote.trim() || 'No specific reason was provided. Please review your details and try again.');

    return this.sendKriboEmail({
      to: input.to,
      subject: 'Kribo host onboarding update',
      title: 'Host onboarding requires updates',
      text: [
        `Hi ${input.hostName},`,
        '',
        'Your host onboarding submission was reviewed and needs updates before approval.',
        `Reason: ${input.reasonNote.trim() || 'No specific reason was provided. Please review your details and try again.'}`,
        '',
        `Login to update your onboarding details: ${loginLink}`,
      ].join('\n'),
      bodyHtml: [
        `<p>Hi <strong>${escapeHtml(input.hostName)}</strong>,</p>`,
        '<p>Your host onboarding submission was reviewed and needs updates before approval.</p>',
        '<p><strong>Reason for rejection:</strong></p>',
        `<p style="padding:12px;border:1px solid #F0D2C3;border-radius:10px;background:#FFF7F2;color:#7A3E23;">${safeReason}</p>`,
        `<p><a href="${loginLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${KRIBO_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;">Update onboarding</a></p>`,
      ].join(''),
    });
  }

  public async sendAdminHostOnboardingSubmittedEmail(input: SendAdminHostOnboardingSubmittedEmailInput): Promise<EmailSendResult> {
    const reviewLink = buildAdminLoginRedirectUrl('/admin/onboarding-reviews?role=host&status=pending');

    return this.sendKriboEmail({
      to: input.to,
      subject: 'Host onboarding submitted for review',
      title: 'Host onboarding review required',
      text: [
        'A host has completed onboarding and requires admin review.',
        `Host Name: ${input.hostName}`,
        `Host Email: ${input.hostEmail}`,
        `Property Name: ${input.propertyName || 'N/A'}`,
        `Property Type: ${input.propertyType || 'N/A'}`,
        `Open review queue: ${reviewLink}`,
      ].join('\n'),
      bodyHtml: [
        '<p>A host has completed onboarding and requires admin review.</p>',
        '<p style="margin:16px 0;padding:14px;border:1px solid #EFE8DE;border-radius:12px;background:#FCFAF7;">',
        `<strong>Host Name:</strong> ${escapeHtml(input.hostName)}<br/>`,
        `<strong>Host Email:</strong> ${escapeHtml(input.hostEmail)}<br/>`,
        `<strong>Property Name:</strong> ${escapeHtml(input.propertyName || 'N/A')}<br/>`,
        `<strong>Property Type:</strong> ${escapeHtml(input.propertyType || 'N/A')}`,
        '</p>',
        `<p><a href="${reviewLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${KRIBO_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;">Open onboarding reviews</a></p>`,
      ].join(''),
    });
  }

  public async sendHostOnboardingApprovedEmail(input: SendHostOnboardingApprovedEmailInput): Promise<EmailSendResult> {
    const dashboardLink = buildHostLoginRedirectUrl('/host/dashboard');

    return this.sendKriboEmail({
      to: input.to,
      subject: 'Kribo host onboarding approved',
      title: 'Your host onboarding is approved',
      text: [
        `Hi ${input.hostName},`,
        '',
        'Great news. Your host onboarding has been approved.',
        `You can now access your host dashboard: ${dashboardLink}`,
      ].join('\n'),
      bodyHtml: [
        `<p>Hi <strong>${escapeHtml(input.hostName)}</strong>,</p>`,
        '<p>Great news. Your host onboarding has been approved.</p>',
        `<p><a href="${dashboardLink}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:${KRIBO_COLORS.teal};color:#ffffff;text-decoration:none;font-weight:600;">Open host dashboard</a></p>`,
      ].join(''),
    });
  }
}

export const emailService: EmailService = new EnvironmentEmailService();
