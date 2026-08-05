import type { Request, Response } from 'express';
import {
  confirmBookingPaymentFromWebhook,
  createBookingFromPropertyRequest,
  createBookingRequest,
  decideBookingByHost,
  getBookingApiDetails,
  getBookingApiStatus,
  listBookings,
  getBookingStats,
  confirmBookingPayment,
  markBookingCheckedIn,
  markBookingCheckedInByHost,
  withdrawBookingPayoutByHost,
} from '../services/bookings.service';
import { env } from '../config/env';
import { whatsappService } from '../services/whatsapp.service';
import { paystackService } from '../services/paystack.service';
import type { CreateBookingBodyDto, WhatsappWebhookBodyDto } from '../types/bookings.dto';
import { findUserByPhoneCandidates } from '../repositories/users.repository';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

function getRequiredIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError('Invalid id parameter', 400, 'INVALID_ID_PARAM');
  }

  return id;
}

function normalizeIncomingWhatsappPhone(from: string): string[] {
  const withoutPrefix = from.replace(/^whatsapp:/i, '').trim();
  const compact = withoutPrefix.replace(/\s+/g, '');
  if (!compact) {
    return [];
  }

  const candidates = new Set<string>();
  candidates.add(compact);

  if (compact.startsWith('+')) {
    candidates.add(compact.slice(1));
  } else {
    candidates.add(`+${compact}`);
  }

  return Array.from(candidates);
}

function extractCheckInCommand(input: string): { bookingId: string } | null {
  const command = input.trim();
  const match = command.match(/^CHECK-?IN\s+([a-fA-F0-9]{24})$/i);
  if (!match) {
    return null;
  }

  const bookingId = match[1];
  if (!bookingId) {
    return null;
  }

  return { bookingId };
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

  const from = String(payload.From ?? '');
  const text = String(payload.Body ?? '').trim();
  const checkInCommand = extractCheckInCommand(text);

  if (!checkInCommand || !from) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const phoneCandidates = normalizeIncomingWhatsappPhone(from);
  const host = await findUserByPhoneCandidates(phoneCandidates);
  if (!host || host.role !== 'host') {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    await markBookingCheckedInByHost({
      bookingId: checkInCommand.bookingId,
      requesterId: String(host._id),
      requesterRole: 'host',
    });

    await whatsappService.sendGuestUpdate({
      guestPhone: from,
      text: 'Check-in recorded successfully. You can now login to Kribo and withdraw your payout.',
    });

    res.status(200).json({ ok: true, processed: true });
  } catch (error) {
    logger.warn(
      {
        err: error,
        bookingId: checkInCommand.bookingId,
        hostId: String(host._id),
      },
      'whatsapp check-in command failed',
    );

    await whatsappService.sendGuestUpdate({
      guestPhone: from,
      text: 'Check-in failed. Please login to Kribo app and check in from your bookings page.',
    });

    res.status(200).json({ ok: true, processed: false });
  }
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
  const reference = payload.data?.reference;
  const status = String(payload.data?.status ?? '').toLowerCase();
  const eventId = String(payload.data?.id ?? '').trim();

  const isSuccessStatus = status === 'success';

  if (!isChargeSuccess || !isSuccessStatus || !reference || !eventId) {
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

  const action = req.body?.action as 'check-in';
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
