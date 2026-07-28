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

export interface EmailSendResult {
  provider: 'gmail_smtp' | 'aws_ses';
  messageId: string | null;
  accepted: string[];
  rejected: string[];
  response: string | null;
}

interface EmailService {
  sendOtpEmail(input: SendOtpEmailInput): Promise<EmailSendResult>;
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
}

export const emailService: EmailService = new EnvironmentEmailService();
