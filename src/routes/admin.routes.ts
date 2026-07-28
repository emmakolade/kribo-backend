import { Router } from 'express';
import { z } from 'zod';
import {
  forceAcceptController,
  forceDeclineController,
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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin']));
adminRouter.get('/bookings', getAdminBookingsController);
adminRouter.post('/bookings/:id/force-accept', validate(idParamSchema), forceAcceptController);
adminRouter.post('/bookings/:id/force-decline', validate(idParamSchema), forceDeclineController);
adminRouter.get('/disputes', getDisputesController);
adminRouter.post('/disputes/:id/resolve', validate(resolveSchema), resolveDisputeController);
adminRouter.get('/hosts', getUnverifiedHostsController);
adminRouter.get('/host/:id/earnings', validate(idParamSchema), getHostEarningsController);
