import { Router } from 'express';
import { z } from 'zod';
import {
  createUnitController,
  deleteAllUnitsController,
  deleteUnitController,
  getUnitController,
  getUnitsController,
  patchUnitController,
} from '../controllers/units.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const mongoObjectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid Mongo ObjectId');

const createSchema = z.object({
  body: z.object({
    propertyId: mongoObjectIdSchema,
    name: z.string().min(2),
    maxGuests: z.number().int().positive(),
    pricePerNight: z.number().min(0),
    photos: z.array(z.url()).min(3, 'A unit/room must have at least 3 photos'),
    isAvailable: z.boolean().optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const patchSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    maxGuests: z.number().int().positive().optional(),
    pricePerNight: z.number().min(0).optional(),
    photos: z.array(z.url()).min(3, 'A unit/room must have at least 3 photos').optional(),
    isAvailable: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  }),
  params: z.object({ id: mongoObjectIdSchema }),
  query: z.object({}).optional(),
});

const unitIdParamsSchema = z.object({
  params: z.object({ id: mongoObjectIdSchema }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

const propertyIdParamsSchema = z.object({
  params: z.object({ propertyId: mongoObjectIdSchema }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const unitsRouter = Router();

unitsRouter.post('/', requireAuth, requireRole(['host']), validate(createSchema), createUnitController);
unitsRouter.get('/property/:propertyId', requireAuth, requireRole(['host']), validate(propertyIdParamsSchema), getUnitsController);
unitsRouter.get('/:id', requireAuth, requireRole(['host']), validate(unitIdParamsSchema), getUnitController);
unitsRouter.patch('/:id', requireAuth, requireRole(['host']), validate(patchSchema), patchUnitController);
unitsRouter.delete('/:id', requireAuth, requireRole(['host']), validate(unitIdParamsSchema), deleteUnitController);
unitsRouter.delete('/property/:propertyId', requireAuth, requireRole(['host']), validate(propertyIdParamsSchema), deleteAllUnitsController);
