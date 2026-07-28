import type { Request, Response } from 'express';
import { BookingStatus } from '../types/booking';
import type { AdminBookingsQueryDto, ResolveDisputeBodyDto } from '../types/admin';
import {
  forceAccept,
  forceDecline,
  getDisputes,
  getUnverifiedHosts,
  listBookingsByStatus,
  resolveDispute,
} from '../services/admin.service';
import { getHostEarnings } from '../services/payouts.service';
import { AppError } from '../utils/AppError';

function getRequiredIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError('Invalid id parameter', 400, 'INVALID_ID_PARAM');
  }

  return id;
}

export async function getAdminBookingsController(req: Request, res: Response): Promise<void> {
  const query: AdminBookingsQueryDto = {
    status: typeof req.query.status === 'string' ? (req.query.status as BookingStatus) : undefined,
  };
  const status = query.status ?? BookingStatus.ESCALATED;
  const rows = await listBookingsByStatus(status);
  res.status(200).json(rows);
}

export async function forceAcceptController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const result = await forceAccept(id);
  res.status(200).json(result);
}

export async function forceDeclineController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const result = await forceDecline(id);
  res.status(200).json(result);
}

export async function getDisputesController(_req: Request, res: Response): Promise<void> {
  const rows = await getDisputes();
  res.status(200).json(rows);
}

export async function resolveDisputeController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const body = req.body as ResolveDisputeBodyDto;
  await resolveDispute(
    id,
    body.resolutionNotes,
    req.user!.userId,
  );
  res.status(200).json({ ok: true });
}

export async function getUnverifiedHostsController(_req: Request, res: Response): Promise<void> {
  const rows = await getUnverifiedHosts();
  res.status(200).json(rows);
}

export async function getHostEarningsController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const data = await getHostEarnings(id);
  res.status(200).json(data);
}
