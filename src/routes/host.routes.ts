import { Router } from 'express';
import { z } from 'zod';
import { getHostEarningsController } from '../controllers/admin.controller';
import { hostWithdrawController } from '../controllers/bookings.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const idParamSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const hostRouter = Router();

hostRouter.get('/:id/earnings', requireAuth, requireRole(['host', 'admin']), validate(idParamSchema), getHostEarningsController);
hostRouter.post('/bookings/:id/withdraw', requireAuth, requireRole(['host', 'admin']), validate(idParamSchema), hostWithdrawController);
