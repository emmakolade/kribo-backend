import type { Request, Response } from 'express';
import { BookingStatus } from '../types/booking';
import type {
  AdminAuditLogQueryDto,
  AdminBookingsListQueryDto,
  AdminBookingsQueryDto,
  AdminDisputesQueryDto,
  AdminProfileChangeRequestDecisionDto,
  AdminProfileChangeRequestsQueryDto,
  AdminOnboardingReviewDecisionDto,
  AdminOnboardingReviewsQueryDto,
  AdminPaymentsQueryDto,
  AdminPayoutsQueryDto,
  AdminPropertiesQueryDto,
  AdminUnitsQueryDto,
  AdminUsersQueryDto,
  ResolveDisputeBodyDto,
  UpdateAdminPropertyDto,
  UpdateAdminUnitDto,
  UpdateAdminUserDto,
} from '../types/admin';
import {
  decideAdminOnboardingReview,
  decideAdminProfileChangeRequest,
  forceAccept,
  forceDecline,
  getAdminOverview,
  listAdminProfileChangeRequests,
  listAdminOnboardingReviews,
  listAdminUnits,
  listAdminAuditLogs,
  listAdminBookings,
  listAdminDisputes,
  listAdminPayments,
  listAdminPayouts,
  listAdminProperties,
  listAdminUsers,
  markAdminPayoutPaidOut,
  restoreAdminUser,
  setAdminBookingStatus,
  suspendAdminUser,
  updateAdminProperty,
  updateAdminUnit,
  updateAdminUser,
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

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function parsePage(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getAdminOverviewController(_req: Request, res: Response): Promise<void> {
  const data = await getAdminOverview();
  res.status(200).json(data);
}

export async function listAdminUsersController(req: Request, res: Response): Promise<void> {
  const query: AdminUsersQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    role: typeof req.query.role === 'string' ? (req.query.role as 'guest' | 'host' | 'admin') : undefined,
    isSuspended: parseOptionalBoolean(req.query.isSuspended),
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminUsers(query);
  res.status(200).json(data);
}

export async function updateAdminUserController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const data = await updateAdminUser({
    adminId: req.user!.userId,
    userId: id,
    updates: req.body as UpdateAdminUserDto,
  });
  res.status(200).json(data);
}

export async function suspendAdminUserController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  await suspendAdminUser({ adminId: req.user!.userId, userId: id });
  res.status(200).json({ ok: true });
}

export async function restoreAdminUserController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  await restoreAdminUser({ adminId: req.user!.userId, userId: id });
  res.status(200).json({ ok: true });
}

export async function listAdminPropertiesController(req: Request, res: Response): Promise<void> {
  const query: AdminPropertiesQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    city: typeof req.query.city === 'string' ? req.query.city : undefined,
    verified: parseOptionalBoolean(req.query.verified),
    bookingEnabled: parseOptionalBoolean(req.query.bookingEnabled),
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminProperties(query);
  res.status(200).json(data);
}

export async function updateAdminPropertyController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const data = await updateAdminProperty({
    adminId: req.user!.userId,
    propertyId: id,
    updates: req.body as UpdateAdminPropertyDto,
  });
  res.status(200).json(data);
}

export async function listAdminUnitsController(req: Request, res: Response): Promise<void> {
  const query: AdminUnitsQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    propertyId: typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined,
    hostId: typeof req.query.hostId === 'string' ? req.query.hostId : undefined,
    isAvailable: parseOptionalBoolean(req.query.isAvailable),
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminUnits(query);
  res.status(200).json(data);
}

export async function updateAdminUnitController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const data = await updateAdminUnit({
    adminId: req.user!.userId,
    unitId: id,
    updates: req.body as UpdateAdminUnitDto,
  });
  res.status(200).json(data);
}

export async function listAdminBookingsController(req: Request, res: Response): Promise<void> {
  const query: AdminBookingsListQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    status: typeof req.query.status === 'string' ? (req.query.status as BookingStatus) : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminBookings(query);
  res.status(200).json(data);
}

export async function setAdminBookingStatusController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const body = req.body as { status: BookingStatus };
  const data = await setAdminBookingStatus({
    adminId: req.user!.userId,
    bookingId: id,
    status: body.status,
  });

  res.status(200).json(data);
}

export async function listAdminPayoutsController(req: Request, res: Response): Promise<void> {
  const query: AdminPayoutsQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    status: typeof req.query.status === 'string' ? (req.query.status as 'pending' | 'completed' | 'failed') : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };
  const data = await listAdminPayouts(query);
  res.status(200).json(data);
}

export async function markAdminPayoutPaidOutController(req: Request, res: Response): Promise<void> {
  const bookingId = getRequiredIdParam(req);
  await markAdminPayoutPaidOut({ adminId: req.user!.userId, bookingId });
  res.status(200).json({ ok: true });
}

export async function listAdminPaymentsController(req: Request, res: Response): Promise<void> {
  const query: AdminPaymentsQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    status: typeof req.query.status === 'string'
      ? (req.query.status as 'pending' | 'success' | 'failed' | 'abandoned' | 'refunded')
      : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminPayments(query);
  res.status(200).json(data);
}

export async function listAdminDisputesController(req: Request, res: Response): Promise<void> {
  const query: AdminDisputesQueryDto = {
    status: typeof req.query.status === 'string' ? (req.query.status as 'open' | 'resolved') : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminDisputes(query);
  res.status(200).json(data);
}

export async function listAdminAuditLogsController(req: Request, res: Response): Promise<void> {
  const query: AdminAuditLogQueryDto = {
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminAuditLogs(query);
  res.status(200).json(data);
}

export async function listAdminOnboardingReviewsController(req: Request, res: Response): Promise<void> {
  const query: AdminOnboardingReviewsQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    role: typeof req.query.role === 'string' ? (req.query.role as 'guest' | 'host') : undefined,
    status: typeof req.query.status === 'string' ? (req.query.status as 'pending' | 'approved' | 'rejected') : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminOnboardingReviews(query);
  res.status(200).json(data);
}

export async function decideAdminOnboardingReviewController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const body = req.body as AdminOnboardingReviewDecisionDto;
  const data = await decideAdminOnboardingReview({
    adminId: req.user!.userId,
    userId: id,
    role: body.role,
    decision: body.decision,
    note: body.note,
  });

  res.status(200).json(data);
}

export async function listAdminProfileChangeRequestsController(req: Request, res: Response): Promise<void> {
  const query: AdminProfileChangeRequestsQueryDto = {
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    role: typeof req.query.role === 'string' ? (req.query.role as 'guest' | 'host') : undefined,
    section: typeof req.query.section === 'string'
      ? (req.query.section as 'host_manager' | 'host_business_contact' | 'host_property' | 'guest_profile')
      : undefined,
    status: typeof req.query.status === 'string'
      ? (req.query.status as 'pending' | 'approved' | 'rejected')
      : undefined,
    page: parsePage(req.query.page),
    limit: parsePage(req.query.limit),
  };

  const data = await listAdminProfileChangeRequests(query);
  res.status(200).json(data);
}

export async function decideAdminProfileChangeRequestController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const body = req.body as AdminProfileChangeRequestDecisionDto;
  const data = await decideAdminProfileChangeRequest({
    adminId: req.user!.userId,
    requestId: id,
    decision: body.decision,
    note: body.note,
  });

  res.status(200).json(data);
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
