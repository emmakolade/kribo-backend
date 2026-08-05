import { Types } from 'mongoose';
import type { UnitDocument } from '../models/unit.model';
import {
  createUnit,
  deleteUnitById,
  deleteUnitsByProperty,
  findPropertyOwnedByHost,
  findUnitById,
  listUnitsByProperty,
  updateUnitById,
} from '../repositories/units.repository';
import { AppError } from '../utils/AppError';

function stripImmutableUnitFields(updates: Record<string, unknown>): Record<string, unknown> {
  const next = { ...updates };
  delete next._id;
  delete next.propertyId;
  delete next.createdAt;
  delete next.updatedAt;
  return next;
}

export async function createUnitListing(input: {
  hostId: string;
  propertyId: string;
  name: string;
  maxGuests: number;
  pricePerNight: number;
  photos: string[];
  isAvailable?: boolean;
}): Promise<{ unitId: string }> {
  const isOwner = await findPropertyOwnedByHost(input.propertyId, input.hostId);
  if (!isOwner) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  const unit = await createUnit({
    propertyId: new Types.ObjectId(input.propertyId),
    name: input.name,
    maxGuests: input.maxGuests,
    pricePerNight: input.pricePerNight,
    photos: input.photos,
    isAvailable: input.isAvailable,
  });

  return { unitId: String(unit._id) };
}

export async function getUnitDetails(input: {
  hostId: string;
  unitId: string;
}): Promise<UnitDocument> {
  const unit = await findUnitById(input.unitId);
  if (!unit) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const isOwner = await findPropertyOwnedByHost(String(unit.propertyId), input.hostId);
  if (!isOwner) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  return unit;
}

export async function getUnitsByProperty(input: {
  hostId: string;
  propertyId: string;
}): Promise<UnitDocument[]> {
  const isOwner = await findPropertyOwnedByHost(input.propertyId, input.hostId);
  if (!isOwner) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  return listUnitsByProperty(input.propertyId);
}

export async function updateUnitListing(input: {
  hostId: string;
  unitId: string;
  updates: Record<string, unknown>;
}): Promise<void> {
  const unit = await findUnitById(input.unitId);
  if (!unit) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const isOwner = await findPropertyOwnedByHost(String(unit.propertyId), input.hostId);
  if (!isOwner) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const sanitizedUpdates = stripImmutableUnitFields(input.updates);
  const updated = await updateUnitById(input.unitId, sanitizedUpdates as Partial<UnitDocument>);
  if (!updated) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }
}

export async function toggleUnitAvailability(input: {
  hostId: string;
  unitId: string;
  isAvailable: boolean;
}): Promise<{ unitId: string; isAvailable: boolean }> {
  const unit = await findUnitById(input.unitId);
  if (!unit) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const isOwner = await findPropertyOwnedByHost(String(unit.propertyId), input.hostId);
  if (!isOwner) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const updated = await updateUnitById(input.unitId, { isAvailable: input.isAvailable });
  if (!updated) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  return {
    unitId: String(updated._id),
    isAvailable: Boolean(updated.isAvailable),
  };
}

export async function removeUnit(input: {
  hostId: string;
  unitId: string;
}): Promise<void> {
  const unit = await findUnitById(input.unitId);
  if (!unit) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const isOwner = await findPropertyOwnedByHost(String(unit.propertyId), input.hostId);
  if (!isOwner) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  const deleted = await deleteUnitById(input.unitId);
  if (!deleted) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }
}

export async function removeAllUnitsByProperty(input: {
  hostId: string;
  propertyId: string;
}): Promise<{ deletedCount: number }> {
  const isOwner = await findPropertyOwnedByHost(input.propertyId, input.hostId);
  if (!isOwner) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  const deletedCount = await deleteUnitsByProperty(input.propertyId);
  return { deletedCount };
}
