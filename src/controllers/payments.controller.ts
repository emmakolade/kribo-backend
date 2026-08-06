import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { paystackService } from '../services/paystack.service';
import {
  getPaymentCallbackStatusByReference,
  getPaymentStatusByReference,
  initializeBookingPayment,
  processPaystackWebhookEvent,
} from '../services/payments.service';
import { logger } from '../utils/logger';

function getRequiredReferenceParam(req: Request): string {
  const reference = req.params.reference;
  if (typeof reference !== 'string' || reference.trim().length === 0) {
    throw new AppError('Invalid payment reference', 400, 'INVALID_PAYMENT_REFERENCE');
  }

  return reference.trim();
}

export async function initializeBookingPaymentController(req: Request, res: Response): Promise<void> {
  const body = req.body as { bookingId?: string; email?: string };
  if (!body.bookingId || body.bookingId.trim().length === 0) {
    throw new AppError('bookingId is required', 400, 'VALIDATION_ERROR');
  }

  const result = await initializeBookingPayment({
    bookingId: body.bookingId,
    email: body.email,
    requesterId: req.user!.userId,
    requesterRole: req.user!.role === 'admin' ? 'admin' : 'guest',
  });

  res.status(200).json(result);
}

export async function getPaymentStatusController(req: Request, res: Response): Promise<void> {
  const reference = getRequiredReferenceParam(req);

  const result = await getPaymentStatusByReference({
    paymentReference: reference,
    requesterId: req.user!.userId,
    requesterRole: req.user!.role === 'admin' ? 'admin' : 'guest',
  });

  res.status(200).json(result);
}

export async function getPaymentCallbackStatusController(req: Request, res: Response): Promise<void> {
  const reference = getRequiredReferenceParam(req);

  const result = await getPaymentCallbackStatusByReference({
    paymentReference: reference,
  });

  res.status(200).json(result);
}

export async function paystackWebhookController(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-paystack-signature'];
  const signatureValue = Array.isArray(signature) ? signature[0] : signature;
  const rawBody = req.rawBody ?? '';

  const verified = paystackService.verifyWebhookSignature({
    rawBody,
    signature: signatureValue,
  });

  if (!verified) {
    throw new AppError('Invalid webhook signature', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }

  const payload = req.body as {
    event?: string;
    data?: {
      reference?: string;
      id?: string | number;
    };
  };

  const eventType = String(payload.event ?? '').trim().toLowerCase();
  const paymentReference = String(payload.data?.reference ?? '').trim();
  const providerEventId = String(payload.data?.id ?? '').trim();

  if (!paymentReference || !providerEventId) {
    logger.info(
      {
        eventType,
        hasReference: Boolean(paymentReference),
      },
      'paystack webhook ignored because required payload fields are missing',
    );
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const result = await processPaystackWebhookEvent({
    eventType,
    eventId: `paystack:${eventType}:${providerEventId}`,
    paymentReference,
    payload: payload as unknown as Record<string, unknown>,
  });

  res.status(200).json({ ok: true, ...result });
}
