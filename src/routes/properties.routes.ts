import { Router } from 'express';
import { z } from 'zod';
import { AMENITIES, PROPERTY_TYPES } from '../constants/enums';
import {
  createPropertyController,
  getHostPrimaryPropertyController,
  getPropertyController,
  listHostPropertiesAvailabilityController,
  listPropertiesController,
  patchPropertyController,
  searchPropertiesController,
  setAvailabilityController,
  togglePropertyBookingAvailabilityController,
} from '../controllers/properties.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const mongoObjectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid Mongo ObjectId');

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().min(10),
    city: z.string().min(2),
    area: z.string().min(2),
    fullAddress: z.string().min(2),
    coordinates: z.tuple([z.number(), z.number()]),
    amenities: z.array(z.enum(AMENITIES)).default([]),
    photos: z.array(z.url()).min(2, 'At least two property photos are required'),
    propertyType: z.enum(PROPERTY_TYPES).optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const patchSchema = z.object({
  body: z.record(z.string(), z.unknown()),
  params: z.object({ id: mongoObjectIdSchema }),
  query: z.object({}).optional(),
});

const propertyIdParamsSchema = z.object({
  params: z.object({ id: mongoObjectIdSchema }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

const searchSchema = z.object({
  query: z.object({
    checkIn: z.string(),
    checkOut: z.string(),
    location: z.string().optional(),
    guests: z.string().optional(),
    priceMin: z.string().optional(),
    priceMax: z.string().optional(),
    type: z.enum(PROPERTY_TYPES).optional(),
  }),
  body: z.object({}).optional(),
  params: z.object({}).optional(),
});

const availabilitySchema = z.object({
  body: z.object({
    unitId: mongoObjectIdSchema,
    date: z.string(),
    status: z.enum(['open', 'blocked']),
  }),
  params: z.object({ id: mongoObjectIdSchema }),
  query: z.object({}).optional(),
});

const togglePropertyBookingAvailabilitySchema = z.object({
  body: z.object({
    bookingEnabled: z.boolean(),
  }),
  params: z.object({ id: mongoObjectIdSchema }),
  query: z.object({}).optional(),
});

const emptySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const propertiesRouter = Router();

/**
 * @openapi
 * /properties/search:
 *   get:
 *     summary: Search available properties by date and filters
 */
propertiesRouter.get('/search', validate(searchSchema), searchPropertiesController);
propertiesRouter.get('/', listPropertiesController);
propertiesRouter.get('/host/me', requireAuth, requireRole(['host']), getHostPrimaryPropertyController);
propertiesRouter.get('/host/availability', requireAuth, requireRole(['host']), validate(emptySchema), listHostPropertiesAvailabilityController);
propertiesRouter.get('/:id', validate(propertyIdParamsSchema), getPropertyController);
propertiesRouter.post('/', requireAuth, requireRole(['host']), validate(createSchema), createPropertyController);
propertiesRouter.patch('/:id', requireAuth, requireRole(['host']), validate(patchSchema), patchPropertyController);
propertiesRouter.patch('/:id/booking-availability', requireAuth, requireRole(['host']), validate(togglePropertyBookingAvailabilitySchema), togglePropertyBookingAvailabilityController);
propertiesRouter.post('/:id/availability', requireAuth, requireRole(['host']), validate(availabilitySchema), setAvailabilityController);
