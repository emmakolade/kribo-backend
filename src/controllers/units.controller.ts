import type { Request, Response } from 'express';
import type { CreateUnitBodyDto, ToggleUnitAvailabilityBodyDto, UpdateUnitBodyDto } from '../types/units';
import {
  createUnitListing,
  getUnitDetails,
  getUnitsByProperty,
  removeAllUnitsByProperty,
  removeUnit,
  toggleUnitAvailability,
  updateUnitListing,
} from '../services/units.service';
import { AppError } from '../utils/AppError';

function getRequiredIdParam(req: Request, key: string): string {
  const id = req.params[key];
  if (typeof id !== 'string' || id.length === 0) {
    throw new AppError(`Invalid ${key} parameter`, 400, 'INVALID_ID_PARAM');
  }

  return id;
}

export async function createUnitController(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUnitBodyDto;
  const created = await createUnitListing({
    hostId: req.user!.userId,
    ...body,
  });

  res.status(201).json(created);
}

export async function getUnitController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req, 'id');
  const unit = await getUnitDetails({
    hostId: req.user!.userId,
    unitId: id,
  });

  res.status(200).json(unit);
}

export async function getUnitsController(req: Request, res: Response): Promise<void> {
  const propertyId = getRequiredIdParam(req, 'propertyId');
  const units = await getUnitsByProperty({
    hostId: req.user!.userId,
    propertyId,
  });

  res.status(200).json(units);
}

export async function patchUnitController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req, 'id');
  const body = req.body as UpdateUnitBodyDto;

  await updateUnitListing({
    hostId: req.user!.userId,
    unitId: id,
    updates: body as Record<string, unknown>,
  });

  res.status(200).json({ ok: true });
}

export async function toggleUnitAvailabilityController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req, 'id');
  const body = req.body as ToggleUnitAvailabilityBodyDto;

  const result = await toggleUnitAvailability({
    hostId: req.user!.userId,
    unitId: id,
    isAvailable: body.isAvailable,
  });

  res.status(200).json(result);
}

export async function deleteUnitController(req: Request, res: Response): Promise<void> {
  const id = getRequiredIdParam(req, 'id');
  await removeUnit({
    hostId: req.user!.userId,
    unitId: id,
  });

  res.status(200).json({ ok: true });
}

export async function deleteAllUnitsController(req: Request, res: Response): Promise<void> {
  const propertyId = getRequiredIdParam(req, 'propertyId');
  const result = await removeAllUnitsByProperty({
    hostId: req.user!.userId,
    propertyId,
  });

  res.status(200).json(result);
}
