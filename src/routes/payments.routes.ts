import { Router } from 'express';
import { z } from 'zod';
import {
  getPaymentCallbackStatusController,
  getPaymentStatusController,
  initializeBookingPaymentController,
} from '../controllers/payments.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const initializePaymentSchema = z.object({
  params: z.object({}).optional(),
  query: z.object({}).optional(),
  body: z.object({
    bookingId: z.string().min(1),
    email: z.string().email().optional(),
  }),
});

const paymentReferenceSchema = z.object({
  params: z.object({ reference: z.string().min(1) }),
  query: z.object({}).optional(),
  body: z.object({}).optional(),
});

export const paymentsRouter = Router();

paymentsRouter.post('/initialize', requireAuth, requireRole(['guest', 'admin']), validate(initializePaymentSchema), initializeBookingPaymentController);
paymentsRouter.get('/:reference/callback-status', validate(paymentReferenceSchema), getPaymentCallbackStatusController);
paymentsRouter.get('/:reference/status', requireAuth, requireRole(['guest', 'admin']), validate(paymentReferenceSchema), getPaymentStatusController);
