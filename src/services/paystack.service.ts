import axios, { isAxiosError } from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export interface PaystackService {
  initializeTransaction(input: {
    amountMinor: number;
    email: string;
    metadata: Record<string, unknown>;
    callbackUrl?: string;
    currency?: string;
    reference?: string;
  }): Promise<{ reference: string; authorizationUrl: string; accessCode: string }>;
  refundTransaction(reference: string): Promise<{ reference: string; status: 'refunded' }>;
  transferToHost(input: {
    amount: number;
    recipientCode: string;
    reason: string;
  }): Promise<{ transferReference: string }>;
  createTransferRecipient(input: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  }): Promise<{ recipientCode: string }>;
  resolveAccountName(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountNumber: string; accountName: string; bankCode: string }>;
  listBanks(): Promise<Array<{ name: string; code: string }>>;
  verifyTransaction(reference: string): Promise<{ reference: string; paid: boolean; status: string; paidAt?: Date }>;
  verifyWebhookSignature(input: { rawBody: string; signature?: string }): boolean;
}

class LivePaystackService implements PaystackService {
  private readonly client = axios.create({
    baseURL: env.PAYSTACK_BASE_URL,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  private throwPaystackError(error: unknown, fallbackMessage: string, fallbackCode: string): never {
    if (isAxiosError(error)) {
      const statusCode = error.response?.status ?? 502;
      const responseData = error.response?.data as { message?: unknown; code?: unknown } | undefined;
      const message = typeof responseData?.message === 'string' && responseData.message.trim().length > 0
        ? responseData.message
        : fallbackMessage;

      throw new AppError(message, statusCode >= 400 && statusCode < 600 ? statusCode : 502, fallbackCode);
    }

    throw new AppError(fallbackMessage, 502, fallbackCode);
  }

  public async initializeTransaction(input: {
    amountMinor: number;
    email: string;
    metadata: Record<string, unknown>;
    callbackUrl?: string;
    currency?: string;
    reference?: string;
  }): Promise<{ reference: string; authorizationUrl: string; accessCode: string }> {
    try {
      const { data } = await this.client.post('/transaction/initialize', {
        amount: input.amountMinor,
        email: input.email,
        currency: input.currency ?? 'NGN',
        reference: input.reference,
        metadata: input.metadata,
        callback_url: input.callbackUrl,
      });

      return {
        reference: data.data.reference as string,
        authorizationUrl: data.data.authorization_url as string,
        accessCode: data.data.access_code as string,
      };
    } catch (error) {
      this.throwPaystackError(error, 'Unable to initialize Paystack checkout', 'PAYSTACK_CHECKOUT_INIT_FAILED');
    }
  }

  public async refundTransaction(reference: string): Promise<{ reference: string; status: 'refunded' }> {
    try {
      await this.client.post('/refund', {
        transaction: reference,
      });
      return { reference, status: 'refunded' };
    } catch (error) {
      this.throwPaystackError(error, 'Unable to refund transaction', 'PAYSTACK_REFUND_FAILED');
    }
  }

  public async transferToHost(input: {
    amount: number;
    recipientCode: string;
    reason: string;
  }): Promise<{ transferReference: string }> {
    const { data } = await this.client.post('/transfer', {
      source: 'balance',
      amount: input.amount * 100,
      recipient: input.recipientCode,
      reason: input.reason,
    });

    return { transferReference: data.data.reference as string };
  }

  public async createTransferRecipient(input: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  }): Promise<{ recipientCode: string }> {
    try {
      const { data } = await this.client.post('/transferrecipient', {
        type: 'nuban',
        name: input.accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: 'NGN',
      });

      return { recipientCode: String(data.data.recipient_code) };
    } catch (error) {
      this.throwPaystackError(
        error,
        'Unable to register bank payout beneficiary',
        'PAYSTACK_TRANSFER_RECIPIENT_CREATE_FAILED',
      );
    }
  }

  public async resolveAccountName(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountNumber: string; accountName: string; bankCode: string }> {
    const { data } = await this.client.get('/bank/resolve', {
      params: {
        account_number: input.accountNumber,
        bank_code: input.bankCode,
      },
    });

    return {
      accountNumber: String(data.data.account_number ?? input.accountNumber),
      accountName: String(data.data.account_name),
      bankCode: String(data.data.bank_code ?? input.bankCode),
    };
  }

  public async listBanks(): Promise<Array<{ name: string; code: string }>> {
    const { data } = await this.client.get('/bank', {
      params: {
        country: 'nigeria',
        currency: 'NGN',
      },
    });

    const rows: Array<{ name?: unknown; code?: unknown }> = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => ({
        name: String(row.name ?? '').trim(),
        code: String(row.code ?? '').trim(),
      }))
      .filter((row) => row.name.length > 0 && row.code.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async verifyTransaction(reference: string): Promise<{ reference: string; paid: boolean; status: string; paidAt?: Date }> {
    const { data } = await this.client.get(`/transaction/verify/${reference}`);
    const status = String(data.data.status ?? '').toLowerCase();
    const paid = status === 'success';
    const paidAtRaw = data.data.paid_at as string | undefined;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : undefined;
    return { reference, paid, status, paidAt };
  }

  public verifyWebhookSignature(input: { rawBody: string; signature?: string }): boolean {
    if (!input.signature || !input.rawBody) {
      return false;
    }

    const expected = crypto
      .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
      .update(input.rawBody, 'utf8')
      .digest('hex');

    const actual = input.signature.trim();
    if (expected.length !== actual.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }
}

export const paystackService: PaystackService = new LivePaystackService();
