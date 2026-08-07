import { Router } from 'express';
import { z } from 'zod';
import {
  decideAdminOnboardingReviewController,
  decideAdminProfileChangeRequestController,
  forceAcceptController,
  forceDeclineController,
  getAdminOverviewController,
  listAdminOnboardingReviewsController,
  listAdminProfileChangeRequestsController,
  listAdminUnitsController,
  listAdminAuditLogsController,
  listAdminBookingsController,
  listAdminDisputesController,
  listAdminPaymentsController,
  listAdminPayoutsController,
  listAdminPropertiesController,
  listAdminUsersController,
  markAdminPayoutPaidOutController,
  restoreAdminUserController,
  setAdminBookingStatusController,
  suspendAdminUserController,
  updateAdminPropertyController,
  updateAdminUnitController,
  updateAdminUserController,
  getAdminBookingsController,
  getDisputesController,
  getHostEarningsController,
  getUnverifiedHostsController,
  resolveDisputeController,
} from '../controllers/admin.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const idParamSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

const resolveSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({ resolutionNotes: z.string().min(3) }),
  query: z.object({}).optional(),
});

const paginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const usersQuerySchema = z.object({
  search: z.string().min(1).optional(),
  role: z.enum(['guest', 'host', 'admin']).optional(),
  isSuspended: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const updateUserSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(2).optional(),
    role: z.enum(['guest', 'host', 'admin']).optional(),
    phoneNumber: z.string().min(7).optional(),
    hostVerified: z.boolean().optional(),
    emailVerified: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one update field is required',
  }),
  query: z.object({}).optional(),
});

const propertiesQuerySchema = z.object({
  search: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  verified: z.enum(['true', 'false']).optional(),
  bookingEnabled: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const updatePropertySchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    verified: z.boolean().optional(),
    bookingEnabled: z.boolean().optional(),
    instantBookEligible: z.boolean().optional(),
    hostTrustTier: z.enum(['starter', 'trusted', 'top']).optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one update field is required',
  }),
  query: z.object({}).optional(),
});

const unitsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  propertyId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
  hostId: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
  isAvailable: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const updateUnitSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(2).optional(),
    maxGuests: z.number().int().positive().optional(),
    pricePerNight: z.number().min(0).optional(),
    photos: z.array(z.url()).min(3, 'A unit/room must have at least 3 photos').optional(),
    isAvailable: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one update field is required',
  }),
  query: z.object({}).optional(),
});

const adminBookingsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  status: z.enum([
    'pending',
    'payment_failed',
    'confirmed',
    'declined',
    'checked_in',
    'paid_out',
    'cancelled_by_guest',
    'cancelled_by_host',
    'disputed',
    'escalated',
  ]).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const setBookingStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    status: z.enum([
      'pending',
      'payment_failed',
      'confirmed',
      'declined',
      'checked_in',
      'paid_out',
      'cancelled_by_guest',
      'cancelled_by_host',
      'disputed',
      'escalated',
    ]),
  }),
  query: z.object({}).optional(),
});

const payoutsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const paymentsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  status: z.enum(['pending', 'success', 'failed', 'abandoned', 'refunded']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const disputesQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const auditQuerySchema = z.object({
  action: z.string().min(1).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const onboardingReviewsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  role: z.enum(['guest', 'host']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const onboardingReviewDecisionSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    role: z.enum(['guest', 'host']),
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(500).optional(),
  }).superRefine((value, ctx) => {
    if (value.decision === 'reject' && (!value.note || value.note.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejection reason note (minimum 3 characters) is required',
        path: ['note'],
      });
    }
  }),
  query: z.object({}).optional(),
});

const profileChangeRequestsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  role: z.enum(['guest', 'host']).optional(),
  section: z.enum(['host_manager', 'host_business_contact', 'host_property', 'guest_profile']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const profileChangeDecisionSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(500).optional(),
  }).superRefine((value, ctx) => {
    if (value.decision === 'reject' && (!value.note || value.note.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejection reason note (minimum 3 characters) is required',
        path: ['note'],
      });
    }
  }),
  query: z.object({}).optional(),
});

const queryOnly = (query: z.ZodTypeAny) =>
  z.object({
    query,
    params: z.object({}).optional(),
    body: z.object({}).optional(),
  });

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin']));
adminRouter.get('/overview', validate(queryOnly(paginationQuerySchema)), getAdminOverviewController);

adminRouter.get('/users', validate(queryOnly(usersQuerySchema)), listAdminUsersController);
adminRouter.patch('/users/:id', validate(updateUserSchema), updateAdminUserController);
adminRouter.post('/users/:id/suspend', validate(idParamSchema), suspendAdminUserController);
adminRouter.post('/users/:id/restore', validate(idParamSchema), restoreAdminUserController);

adminRouter.get('/properties', validate(queryOnly(propertiesQuerySchema)), listAdminPropertiesController);
adminRouter.patch('/properties/:id', validate(updatePropertySchema), updateAdminPropertyController);
adminRouter.get('/units', validate(queryOnly(unitsQuerySchema)), listAdminUnitsController);
adminRouter.patch('/units/:id', validate(updateUnitSchema), updateAdminUnitController);

adminRouter.get('/bookings/all', validate(queryOnly(adminBookingsQuerySchema)), listAdminBookingsController);
adminRouter.patch('/bookings/:id/status', validate(setBookingStatusSchema), setAdminBookingStatusController);
adminRouter.get('/bookings', getAdminBookingsController);
adminRouter.post('/bookings/:id/force-accept', validate(idParamSchema), forceAcceptController);
adminRouter.post('/bookings/:id/force-decline', validate(idParamSchema), forceDeclineController);

adminRouter.get('/payouts', validate(queryOnly(payoutsQuerySchema)), listAdminPayoutsController);
adminRouter.post('/payouts/:id/mark-paid-out', validate(idParamSchema), markAdminPayoutPaidOutController);
adminRouter.get('/payments', validate(queryOnly(paymentsQuerySchema)), listAdminPaymentsController);

adminRouter.get('/disputes/all', validate(queryOnly(disputesQuerySchema)), listAdminDisputesController);
adminRouter.get('/disputes', getDisputesController);
adminRouter.post('/disputes/:id/resolve', validate(resolveSchema), resolveDisputeController);

adminRouter.get('/audit-logs', validate(queryOnly(auditQuerySchema)), listAdminAuditLogsController);

adminRouter.get('/onboarding/reviews', validate(queryOnly(onboardingReviewsQuerySchema)), listAdminOnboardingReviewsController);
adminRouter.post('/onboarding/reviews/:id/decision', validate(onboardingReviewDecisionSchema), decideAdminOnboardingReviewController);
adminRouter.get('/profile-change-requests', validate(queryOnly(profileChangeRequestsQuerySchema)), listAdminProfileChangeRequestsController);
adminRouter.post('/profile-change-requests/:id/decision', validate(profileChangeDecisionSchema), decideAdminProfileChangeRequestController);

adminRouter.get('/hosts', getUnverifiedHostsController);
adminRouter.get('/host/:id/earnings', validate(idParamSchema), getHostEarningsController);
