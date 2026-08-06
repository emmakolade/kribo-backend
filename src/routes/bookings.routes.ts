import { Router } from 'express';
import { z } from 'zod';
import {
  createBookingController,
  getBookingDetailsController,
  getBookingStatsController,
  getBookingStatusController,
  hostActionController,
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
    action: z.literal('check-in'),
  }),
  query: z.object({}).optional(),
});

const emptySchema = z.object({
  params: z.object({}).optional(),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const bookingsRouter = Router();

/**
 * @openapi
 * /bookings:
 *   post:
 *     summary: Create booking and initialize checkout
 */
bookingsRouter.post('/', requireAuth, requireRole(['guest']), validate(createBookingSchema), createBookingController);
bookingsRouter.get('/', requireAuth, validate(emptySchema), listBookingsController);
bookingsRouter.get('/stats', requireAuth, requireRole(['host', 'admin']), validate(emptySchema), getBookingStatsController);
bookingsRouter.get('/:id', requireAuth, validate(idParamSchema), getBookingDetailsController);
bookingsRouter.get('/:id/status', requireAuth, validate(idParamSchema), getBookingStatusController);
bookingsRouter.post('/:id/action', requireAuth, requireRole(['host', 'admin']), validate(bookingActionSchema), hostActionController);
