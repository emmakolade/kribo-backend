import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';

export interface PaystackService {
  initializePreauth(input: {
    amount: number;
    email: string;
    metadata: Record<string, unknown>;
  }): Promise<{ reference: string; authorizationUrl: string }>;
  capturePreauth(reference: string): Promise<{ reference: string; status: 'captured' }>;
  releasePreauth(reference: string): Promise<{ reference: string; status: 'released' }>;
  transferToHost(input: {
    amount: number;
    recipientCode: string;
    reason: string;
  }): Promise<{ transferReference: string }>;
  resolveAccountName(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountNumber: string; accountName: string; bankCode: string }>;
  listBanks(): Promise<Array<{ name: string; code: string }>>;
  verifyTransaction(reference: string): Promise<{ reference: string; paid: boolean }>;
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

  public async initializePreauth(input: {
    amount: number;
    email: string;
    metadata: Record<string, unknown>;
  }): Promise<{ reference: string; authorizationUrl: string }> {
    const { data } = await this.client.post('/transaction/initialize', {
      amount: input.amount * 100,
      email: input.email,
      metadata: input.metadata,
    });

    return {
      reference: data.data.reference as string,
      authorizationUrl: data.data.authorization_url as string,
    };
  }

  public async capturePreauth(reference: string): Promise<{ reference: string; status: 'captured' }> {
    await this.client.post('/transaction/charge_authorization', { reference });
    return { reference, status: 'captured' };
  }

  public async releasePreauth(reference: string): Promise<{ reference: string; status: 'released' }> {
    await this.client.post('/transaction/refund', { transaction: reference });
    return { reference, status: 'released' };
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

  public async verifyTransaction(reference: string): Promise<{ reference: string; paid: boolean }> {
    const { data } = await this.client.get(`/transaction/verify/${reference}`);
    const paid = String(data.data.status).toLowerCase() === 'success';
    return { reference, paid };
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
