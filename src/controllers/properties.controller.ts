import type { Request, Response } from 'express';
import type { PropertyType } from '../constants/enums';
import type {
  CreatePropertyBodyDto,
  SearchPropertiesQueryDto,
  SetAvailabilityBodyDto,
  TogglePropertyBookingAvailabilityBodyDto,
} from '../types/properties';
import {
  createPropertyListing,
  editPropertyListing,
  getHostPrimaryPropertyApiView,
  getPropertyApiDetails,
  listHostPropertiesAvailability,
  listPropertyApiViews,
  searchAvailableProperties,
  setAvailability,
  togglePropertyBookingAvailability,
} from '../services/properties.service';
import { AppError } from '../utils/AppError';

function getRequiredIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError('Invalid id parameter', 400, 'INVALID_ID_PARAM');
  }

  return id;
}

export async function createPropertyController(req: Request, res: Response): Promise<void> {
  const body = req.body as CreatePropertyBodyDto;

  const created = await createPropertyListing({
    hostId: req.user!.userId,
    ...body,
  });

  res.status(201).json(created);
}

export async function patchPropertyController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  await editPropertyListing({
    propertyId: id,
    hostId: req.user!.userId,
    updates: req.body as Record<string, unknown>,
  });

  res.status(200).json({ ok: true });
}

export async function searchPropertiesController(req: Request, res: Response): Promise<void> {
  const query: SearchPropertiesQueryDto = {
    checkIn: String(req.query.checkIn),
    checkOut: String(req.query.checkOut),
    type: typeof req.query.type === 'string' ? (req.query.type as PropertyType) : undefined,
    priceMin: typeof req.query.priceMin === 'string' ? req.query.priceMin : undefined,
    priceMax: typeof req.query.priceMax === 'string' ? req.query.priceMax : undefined,
    guests: typeof req.query.guests === 'string' ? req.query.guests : undefined,
  };

  const result = await searchAvailableProperties({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    type: query.type,
    priceMin: query.priceMin ? Number(query.priceMin) : undefined,
    priceMax: query.priceMax ? Number(query.priceMax) : undefined,
    guests: query.guests ? Number(query.guests) : undefined,
  });

  res.status(200).json(result);
}

export async function listPropertiesController(req: Request, res: Response): Promise<void> {
  const location = typeof req.query.location === 'string' ? req.query.location : undefined;
  const guests = typeof req.query.guests === 'string' ? Number(req.query.guests) : undefined;
  const priceMin = typeof req.query.priceMin === 'string' ? Number(req.query.priceMin) : undefined;
  const priceMax = typeof req.query.priceMax === 'string' ? Number(req.query.priceMax) : undefined;
  const propertyType =
    typeof req.query.propertyType === 'string' && req.query.propertyType !== 'all'
      ? req.query.propertyType as PropertyType
      : undefined;
  const amenitiesQuery = req.query.amenities;
  const amenities = Array.isArray(amenitiesQuery)
    ? amenitiesQuery.filter((value): value is string => typeof value === 'string')
    : typeof amenitiesQuery === 'string'
      ? amenitiesQuery.split(',').map((value) => value.trim()).filter((value) => value.length > 0)
      : undefined;

  const result = await listPropertyApiViews({
    location,
    guests,
    priceMin,
    priceMax,
    propertyType,
    amenities,
  });

  res.status(200).json(result);
}

export async function getPropertyController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const result = await getPropertyApiDetails(id);
  res.status(200).json(result);
}

export async function getHostPrimaryPropertyController(req: Request, res: Response): Promise<void> {
  const property = await getHostPrimaryPropertyApiView(req.user!.userId);
  res.status(200).json({ property });
}

export async function listHostPropertiesAvailabilityController(req: Request, res: Response): Promise<void> {
  const properties = await listHostPropertiesAvailability({
    hostId: req.user!.userId,
  });

  res.status(200).json({ properties });
}

export async function togglePropertyBookingAvailabilityController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req);
  const body = req.body as TogglePropertyBookingAvailabilityBodyDto;

  const result = await togglePropertyBookingAvailability({
    propertyId: id,
    hostId: req.user!.userId,
    bookingEnabled: body.bookingEnabled,
  });

  res.status(200).json(result);
}

export async function setAvailabilityController(req: Request, res: Response): Promise<void> {
  const body = req.body as SetAvailabilityBodyDto;
  await setAvailability({
    unitId: body.unitId,
    date: body.date,
    status: body.status,
  });

  res.status(200).json({ ok: true });
}
