import type { Request, Response } from 'express';
import {
  acceptBookingByHost,
  confirmBookingPaymentFromWebhook,
  createBookingFromPropertyRequest,
  createBookingRequest,
  decideBookingByHost,
  confirmBookingPreauthorization,
  getBookingApiDetails,
  getBookingApiStatus,
  listBookings,
  getBookingStats,
  initializeBookingPreauthorization,
  cancelBooking,
  confirmBookingPayment,
  markBookingCheckedIn,
  markBookingCheckedInByHost,
  processHostDecision,
  withdrawBookingPayoutByHost,
} from '../services/bookings.service';
import { env } from '../config/env';
import { whatsappService } from '../services/whatsapp.service';
import { paystackService } from '../services/paystack.service';
import type { CreateBookingBodyDto, WhatsappWebhookBodyDto } from '../types/bookings.dto';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

function getRequiredIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError('Invalid id parameter', 400, 'INVALID_ID_PARAM');
  }

  return id;
}

export async function createBookingController(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateBookingBodyDto & {
    propertyId?: string;
    roomType?: string;
    nightlyRate?: number;
    paymentMethod?: 'card' | 'bank_transfer' | 'transfer';
  };

  if (body.propertyId) {
    const result = await createBookingFromPropertyRequest({
      guestId: req.user!.userId,
      propertyId: body.propertyId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      roomType: body.roomType,
      nightlyRate: body.nightlyRate,
      paymentMethod: body.paymentMethod,
    });

    res.status(201).json(result);
    return;
  }

  const result = await createBookingRequest({
    guestId: req.user!.userId,
    unitId: body.unitId,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    paymentMethod: body.paymentMethod,
  });

  res.status(201).json(result);
}

export async function initializeBookingPreauthorizationController(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    propertyId: string;
    checkIn: string;
    checkOut: string;
    guestCount?: number;
    roomType?: string;
    nightlyRate?: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    paymentMethod?: 'card' | 'bank_transfer' | 'transfer';
  };

  const result = await initializeBookingPreauthorization({
    guestId: req.user!.userId,
    propertyId: body.propertyId,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    roomType: body.roomType,
    nightlyRate: body.nightlyRate,
    paymentMethod: body.paymentMethod,
  });

  res.status(201).json(result);
}

export async function confirmBookingPreauthorizationController(req: Request, res: Response): Promise<void> {
  const body = req.body as { reference: string };

  const result = await confirmBookingPreauthorization({
    reference: body.reference,
    requesterId: req.user!.userId,
    requesterRole: req.user!.role === 'admin' ? 'admin' : 'guest',
  });

  res.status(200).json(result);
}

export async function confirmBookingPaymentController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);

  const result = await confirmBookingPayment({
    bookingId: id,
    requesterId: req.user!.userId,
    requesterRole: req.user!.role === 'admin' ? 'admin' : 'guest',
  });

  res.status(200).json(result);
}

export async function getBookingStatusController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const result = await getBookingApiStatus(id);
  res.status(200).json(result);
}

export async function getBookingStatsController(req: Request, res: Response): Promise<void> {
  const role = req.user!.role;
  if (role !== 'host' && role !== 'admin') {
    throw new AppError('Only hosts and admins can view booking stats', 403, 'FORBIDDEN');
  }

  const result = await getBookingStats({
    requesterId: req.user!.userId,
    requesterRole: role,
  });

  res.status(200).json(result);
}

export async function getBookingDetailsController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const result = await getBookingApiDetails({
    bookingId: id,
    requesterId: req.user!.userId,
    requesterRole: req.user!.role,
  });

  res.status(200).json(result);
}

export async function whatsappWebhookController(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-twilio-signature'];
  const signatureValue = Array.isArray(signature) ? signature[0] : signature;

  const payload = req.body as WhatsappWebhookBodyDto;
  const verified = whatsappService.verifyWebhookSignature({
    signature: signatureValue,
    requestUrl: env.TWILIO_WEBHOOK_URL ?? '',
    payload: payload as Record<string, string>,
  });

  if (!verified) {
    throw new AppError('Invalid webhook signature', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }

  let bookingId = payload.bookingId;
  let decision = payload.decision;
  const webhookId = payload.webhookId ?? payload.MessageSid;

  if (!bookingId || !decision) {
    const incomingBody = payload.Body ?? '';
    const parsed = incomingBody.match(/^\s*(accept|decline)\s+([a-zA-Z0-9_-]+)\s*$/i);
    if (!parsed) {
      throw new AppError('Invalid Twilio webhook payload', 400, 'INVALID_TWILIO_WEBHOOK_PAYLOAD');
    }

    decision = parsed[1]?.toLowerCase() as 'accept' | 'decline';
    bookingId = parsed[2];
  }

  if (!webhookId) {
    throw new AppError('Missing webhook identifier', 400, 'MISSING_WEBHOOK_ID');
  }

  if (!bookingId) {
    throw new AppError('Missing booking identifier', 400, 'MISSING_BOOKING_ID');
  }

  const result = await processHostDecision({
    bookingId,
    decision,
    webhookId,
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
      status?: string;
      id?: string | number;
    };
  };

  const event = String(payload.event ?? '').toLowerCase();
  const isChargeSuccess = event === 'charge.success';
  const isPreauthReserveSuccess = event === 'preauthorization.reserve.success';
  const reference = payload.data?.reference;
  const status = String(payload.data?.status ?? '').toLowerCase();
  const eventId = String(payload.data?.id ?? '').trim();

  const isSuccessStatus = status === 'success' || status === 'authorized';

  if ((!isChargeSuccess && !isPreauthReserveSuccess) || !isSuccessStatus || !reference || !eventId) {
    logger.info(
      {
        event,
        status: payload.data?.status,
        hasReference: Boolean(reference),
      },
      'paystack webhook ignored',
    );
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const result = await confirmBookingPaymentFromWebhook({
    paystackReference: reference,
    webhookId: `paystack:${event}:${eventId}`,
  });

  res.status(200).json({ ok: true, ...result });
}

export async function checkInController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  await markBookingCheckedIn(id);
  res.status(200).json({ ok: true });
}

export async function listBookingsController(req: Request, res: Response): Promise<void> {
  const result = await listBookings({
    requesterId: req.user!.userId,
    requesterRole: req.user!.role,
  });

  res.status(200).json(result);
}

export async function hostActionController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const role = req.user!.role;
  if (role !== 'host' && role !== 'admin') {
    throw new AppError('Only hosts and admins can act on bookings', 403, 'FORBIDDEN');
  }

  const action = req.body?.action as 'accept' | 'decline' | 'check-in';
  const result = await decideBookingByHost({
    bookingId: id,
    requesterId: req.user!.userId,
    requesterRole: role,
    action,
  });

  res.status(200).json({
    bookingId: id,
    status: result.status,
    ttlSeconds: result.ttlSeconds,
  });
}

export async function hostCheckInController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const role = req.user!.role;
  if (role !== 'host' && role !== 'admin') {
    throw new AppError('Only hosts and admins can check in bookings', 403, 'FORBIDDEN');
  }

  const result = await markBookingCheckedInByHost({
    bookingId: id,
    requesterId: req.user!.userId,
    requesterRole: role,
  });

  res.status(200).json({
    bookingId: id,
    status: result.status,
    ttlSeconds: result.ttlSeconds,
  });
}

export async function hostWithdrawController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const role = req.user!.role;
  if (role !== 'host' && role !== 'admin') {
    throw new AppError('Only hosts and admins can withdraw payouts', 403, 'FORBIDDEN');
  }

  const result = await withdrawBookingPayoutByHost({
    bookingId: id,
    requesterId: req.user!.userId,
    requesterRole: role,
  });

  res.status(200).json({
    bookingId: id,
    status: result.status,
    ttlSeconds: result.ttlSeconds,
  });
}

export async function cancelBookingController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const result = await cancelBooking(
    id,
    req.user!.role === 'host' ? 'host' : 'guest',
  );
  res.status(200).json(result);
}

export async function acceptBookingController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const role = req.user!.role;
  if (role !== 'host' && role !== 'admin') {
    throw new AppError('Only hosts and admins can accept bookings', 403, 'FORBIDDEN');
  }

  const result = await acceptBookingByHost({
    bookingId: id,
    requesterId: req.user!.userId,
    requesterRole: role,
  });

  res.status(200).json(result);
}
