import { Types } from 'mongoose';
import { PropertyModel } from '../models/property.model';
import { UnitModel, type UnitDocument } from '../models/unit.model';

interface CreateUnitInput {
  propertyId: Types.ObjectId;
  name: string;
  maxGuests: number;
  pricePerNight: number;
  photos: string[];
  isAvailable?: boolean;
}

export async function findPropertyOwnedByHost(propertyId: string, hostId: string): Promise<boolean> {
  const property = await PropertyModel.findOne({
    _id: new Types.ObjectId(propertyId),
    hostId: new Types.ObjectId(hostId),
  }).select({ _id: 1 }).lean();

  return Boolean(property);
}

export async function createUnit(data: CreateUnitInput): Promise<UnitDocument> {
  const created = await UnitModel.create(data);
  return created.toObject() as unknown as UnitDocument;
}

export async function findUnitById(unitId: string): Promise<UnitDocument | null> {
  return UnitModel.findById(new Types.ObjectId(unitId)).lean<UnitDocument | null>();
}

export async function listUnitsByProperty(propertyId: string): Promise<UnitDocument[]> {
  return UnitModel.find({ propertyId: new Types.ObjectId(propertyId) }).lean<UnitDocument[]>();
}

export async function updateUnitById(unitId: string, updates: Partial<UnitDocument>): Promise<UnitDocument | null> {
  return UnitModel.findByIdAndUpdate(
    new Types.ObjectId(unitId),
    updates,
    { returnDocument: 'after' },
  ).lean<UnitDocument | null>();
}

export async function deleteUnitById(unitId: string): Promise<boolean> {
  const deleted = await UnitModel.findByIdAndDelete(new Types.ObjectId(unitId)).lean<UnitDocument | null>();
  return Boolean(deleted);
}

export async function deleteUnitsByProperty(propertyId: string): Promise<number> {
  const result = await UnitModel.deleteMany({ propertyId: new Types.ObjectId(propertyId) });
  return result.deletedCount ?? 0;
}
