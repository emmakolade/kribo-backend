import { Router } from 'express';
import { z } from 'zod';
import {
  confirmBookingPreauthorizationController,
  confirmBookingPaymentController,
  createBookingController,
  getBookingDetailsController,
  getBookingStatsController,
  getBookingStatusController,
  hostActionController,
  initializeBookingPreauthorizationController,
  listBookingsController,
} from '../controllers/bookings.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const createBookingSchema = z.object({
  body: z.object({
    unitId: z.string().optional(),
    propertyId: z.string().optional(),
    checkIn: z.string(),
    checkOut: z.string(),
    guestCount: z.number().int().min(1).optional(),
    roomType: z.string().optional(),
    nightlyRate: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    paymentMethod: z.enum(['card', 'bank_transfer', 'transfer']).optional(),
  }).refine((body) => Boolean(body.unitId || body.propertyId), {
    message: 'Either unitId or propertyId is required',
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

const bookingActionSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    action: z.enum(['accept', 'decline', 'check-in']),
  }),
  query: z.object({}).optional(),
});

const emptySchema = z.object({
  params: z.object({}).optional(),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

const preauthInitializeSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z.object({
    propertyId: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
    guestCount: z.number().int().min(1),
    roomType: z.string().optional(),
    nightlyRate: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    paymentMethod: z.enum(['card', 'bank_transfer', 'transfer']).optional(),
    amount: z.number().int().positive().optional(),
    currency: z.string().optional(),
    reference: z.string().optional(),
  }),
});

const preauthConfirmSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z.object({
    reference: z.string().min(1),
  }),
});

export const bookingsRouter = Router();

/**
 * @openapi
 * /bookings:
 *   post:
 *     summary: Create booking and initialize preauthorization
 */
bookingsRouter.post('/', requireAuth, requireRole(['guest']), validate(createBookingSchema), createBookingController);
bookingsRouter.post(
  '/preauth/initialize',
  requireAuth,
  requireRole(['guest']),
  validate(preauthInitializeSchema),
  initializeBookingPreauthorizationController,
);
bookingsRouter.post(
  '/preauth/confirm',
  requireAuth,
  requireRole(['guest', 'admin']),
  validate(preauthConfirmSchema),
  confirmBookingPreauthorizationController,
);
bookingsRouter.post('/:id/confirm-payment', requireAuth, requireRole(['guest', 'admin']), validate(idParamSchema), confirmBookingPaymentController);
bookingsRouter.get('/', requireAuth, validate(emptySchema), listBookingsController);
bookingsRouter.get('/stats', requireAuth, requireRole(['host', 'admin']), validate(emptySchema), getBookingStatsController);
bookingsRouter.get('/:id', requireAuth, validate(idParamSchema), getBookingDetailsController);
bookingsRouter.get('/:id/status', requireAuth, validate(idParamSchema), getBookingStatusController);
bookingsRouter.post('/:id/action', requireAuth, requireRole(['host', 'admin']), validate(bookingActionSchema), hostActionController);
