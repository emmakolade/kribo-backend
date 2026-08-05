import { Types } from 'mongoose';
import type { Amenity, PropertyType } from '../constants/enums';
import { PropertyModel, type PropertyDocument } from '../models/property.model';
import { UnitModel, type UnitDocument } from '../models/unit.model';
import { AvailabilityModel, type AvailabilityDocument } from '../models/availability.model';

interface CreatePropertyInput {
  hostId: Types.ObjectId;
  name: string;
  description: string;
  city: string;
  area: string;
  fullAddress: string;
  location: { type: 'Point'; coordinates: [number, number] };
  amenities: Amenity[];
  photos: string[];
  propertyType: PropertyType;
}

interface CreateUnitInput {
  propertyId: Types.ObjectId;
  name: string;
  maxGuests: number;
  pricePerNight: number;
}

export async function createProperty(data: CreatePropertyInput): Promise<PropertyDocument> {
  const created = await PropertyModel.create(data);
  return created.toObject() as unknown as PropertyDocument;
}

export async function updateProperty(
  propertyId: string,
  hostId: string,
  updates: Partial<PropertyDocument>,
): Promise<PropertyDocument | null> {
  return PropertyModel.findOneAndUpdate(
    { _id: new Types.ObjectId(propertyId), hostId: new Types.ObjectId(hostId) },
    updates,
    { returnDocument: 'after' },
  ).lean<PropertyDocument | null>();
}

export async function findPropertyById(propertyId: string): Promise<PropertyDocument | null> {
  return PropertyModel.findById(new Types.ObjectId(propertyId)).lean<PropertyDocument | null>();
}

export async function findLatestPropertyByHostId(hostId: string): Promise<PropertyDocument | null> {
  return PropertyModel.findOne({ hostId: new Types.ObjectId(hostId) })
    .sort({ createdAt: -1 })
    .lean<PropertyDocument | null>();
}

export async function listPropertiesByHostId(hostId: string): Promise<PropertyDocument[]> {
  return PropertyModel.find({ hostId: new Types.ObjectId(hostId) })
    .sort({ createdAt: -1 })
    .lean<PropertyDocument[]>();
}

export async function setPropertyBookingAvailability(input: {
  propertyId: string;
  hostId: string;
  bookingEnabled: boolean;
}): Promise<PropertyDocument | null> {
  return PropertyModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(input.propertyId),
      hostId: new Types.ObjectId(input.hostId),
    },
    {
      bookingEnabled: input.bookingEnabled,
    },
    { returnDocument: 'after' },
  ).lean<PropertyDocument | null>();
}

export async function createUnit(data: Partial<UnitDocument>): Promise<UnitDocument> {
  const created = await UnitModel.create(data as CreateUnitInput);
  return created.toObject() as unknown as UnitDocument;
}

export async function listUnitsByProperty(propertyId: string): Promise<UnitDocument[]> {
  return UnitModel.find({ propertyId: new Types.ObjectId(propertyId) }).lean<UnitDocument[]>();
}

export async function upsertAvailability(
  unitId: string,
  date: Date,
  status: 'open' | 'blocked',
): Promise<AvailabilityDocument> {
  const updated = await AvailabilityModel.findOneAndUpdate(
    { unitId: new Types.ObjectId(unitId), date },
    { status },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean<AvailabilityDocument | null>();

  if (!updated) {
    throw new Error('Failed to update availability');
  }

  return updated;
}

export async function listAvailabilityByUnitAndDateRange(
  unitId: string,
  start: Date,
  end: Date,
): Promise<AvailabilityDocument[]> {
  return AvailabilityModel.find({
    unitId: new Types.ObjectId(unitId),
    date: { $gte: start, $lt: end },
  }).lean<AvailabilityDocument[]>();
}

export async function searchPropertiesByTypeAndPrice(
  propertyType?: PropertyType,
  priceMin?: number,
  priceMax?: number,
): Promise<Array<PropertyDocument & { units: UnitDocument[] }>> {
  const filter: Record<string, unknown> = {};

  if (propertyType) {
    filter.propertyType = propertyType;
  }

  const properties = await PropertyModel.find(filter).lean<PropertyDocument[]>();
  const withUnits = await Promise.all(
    properties.map(async (property) => {
      const units = await UnitModel.find({
        propertyId: new Types.ObjectId(String(property._id)),
        ...(typeof priceMin === 'number' || typeof priceMax === 'number'
          ? {
              pricePerNight: {
                ...(typeof priceMin === 'number' ? { $gte: priceMin } : {}),
                ...(typeof priceMax === 'number' ? { $lte: priceMax } : {}),
              },
            }
          : {}),
      }).lean<UnitDocument[]>();
      return { ...property, units };
    }),
  );

  return withUnits;
}
