import { Types } from 'mongoose';
import type { Amenity, PropertyType } from '../constants/enums';
import {
  createProperty,
  findLatestPropertyByHostId,
  findPropertyById,
  listAvailabilityByUnitAndDateRange,
  listPropertiesByHostId,
  listUnitsByProperty,
  setPropertyBookingAvailability,
  searchPropertiesByTypeAndPrice,
  updateProperty,
  upsertAvailability,
} from '../repositories/properties.repository';
import { findUserById } from '../repositories/users.repository';
import { UserModel } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { dateRange } from '../utils/dates';

const PROPERTY_EDITABLE_FIELDS = [
  'name',
  'description',
  'city',
  'area',
  'fullAddress',
  'amenities',
  'photos',
  'propertyType',
] as const;

type PropertyEditableField = (typeof PROPERTY_EDITABLE_FIELDS)[number];

function sanitizePropertyUpdates(input: Record<string, unknown>): Partial<Record<PropertyEditableField, unknown>> {
  const sanitized: Partial<Record<PropertyEditableField, unknown>> = {};
  for (const key of PROPERTY_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      sanitized[key] = input[key];
    }
  }

  return sanitized;
}

function toComparable(value: unknown): string {
  return JSON.stringify(value);
}

interface PropertyApiView {
  id: string;
  name: string;
  city: string;
  area: string;
  propertyType: PropertyType;
  bookingEnabled: boolean;
  hasAvailableRooms: boolean;
  roomType: string;
  maxGuests: number;
  nightlyRate: number;
  roomOptions: Array<{
    name: string;
    maxGuests: number;
    nightlyRate: number;
    isAvailable?: boolean;
    images?: string[];
  }>;
  rating: number;
  reviewCount: number;
  verified: boolean;
  images: string[];
  amenities: string[];
  description: string;
  cancellationPolicy: string;
}

function mapPropertyToApiView(input: {
  property: {
    _id: Types.ObjectId;
    name: string;
    city: string;
    area: string;
    propertyType: PropertyType;
    bookingEnabled?: boolean;
    verified: boolean;
    photos: string[];
    amenities: string[];
    description: string;
  };
  units: Array<{
    name: string;
    maxGuests: number;
    pricePerNight: number;
    isAvailable?: boolean;
    photos?: string[];
  }>;
}): PropertyApiView {
  const units = input.units;
  const cheapestUnit = units.reduce<typeof units[number] | undefined>((currentCheapest, unit) => {
    if (!currentCheapest) {
      return unit;
    }
    return unit.pricePerNight < currentCheapest.pricePerNight ? unit : currentCheapest;
  }, undefined);
  const hasAvailableRooms = units.some((unit) => unit.isAvailable !== false);

  return {
    id: String(input.property._id),
    name: input.property.name,
    city: input.property.city,
    area: input.property.area,
    propertyType: input.property.propertyType,
    bookingEnabled: input.property.bookingEnabled ?? true,
    hasAvailableRooms,
    roomType: cheapestUnit?.name ?? 'Standard Room',
    maxGuests: cheapestUnit?.maxGuests ?? 1,
    nightlyRate: cheapestUnit?.pricePerNight ?? 0,
    roomOptions: units.map((unit) => ({
      name: unit.name,
      maxGuests: unit.maxGuests,
      nightlyRate: unit.pricePerNight,
      isAvailable: unit.isAvailable,
      images: unit.photos,
    })),
    rating: 0,
    reviewCount: 0,
    verified: input.property.verified,
    images: input.property.photos,
    amenities: input.property.amenities,
    description: input.property.description,
    cancellationPolicy: '',    
  };
}

export async function createPropertyListing(input: {
  hostId: string;
  name?: string;
  description: string;
  city: string;
  area: string;
  fullAddress: string;
  coordinates: [number, number];
  amenities: Amenity[];
  photos: string[];
  propertyType?: PropertyType;
}): Promise<{ propertyId: string }> {
  const host = await findUserById(input.hostId);
  if (!host) {
    throw new AppError('Host not found', 404, 'HOST_NOT_FOUND');
  }

  const onboardingPropertyName = host.hostOnboarding?.propertyName?.trim();
  const requestPropertyName = input.name?.trim();
  const resolvedPropertyName = onboardingPropertyName || requestPropertyName;
  const onboardingPropertyType = host.hostOnboarding?.propertyType;
  const resolvedPropertyType = onboardingPropertyType || input.propertyType;

  if (!resolvedPropertyName) {
    throw new AppError('Property name is required', 400, 'PROPERTY_NAME_REQUIRED');
  }

  if (!resolvedPropertyType) {
    throw new AppError('Property type is required', 400, 'PROPERTY_TYPE_REQUIRED');
  }

  const property = await createProperty({
    hostId: new Types.ObjectId(input.hostId),
    name: resolvedPropertyName,
    description: input.description,
    city: input.city,
    area: input.area,
    fullAddress: input.fullAddress,
    location: {
      type: 'Point',
      coordinates: input.coordinates,
    },
    amenities: input.amenities,
    photos: input.photos,
    propertyType: resolvedPropertyType,
  });

  return { propertyId: String(property._id) };
}

export async function editPropertyListing(input: {
  propertyId: string;
  hostId: string;
  updates: Record<string, unknown>;
}): Promise<{ status: 'pending_admin_review' | 'no_changes' }> {
  const property = await findPropertyById(input.propertyId);
  if (!property || String(property.hostId) !== input.hostId) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  const user = await findUserById(input.hostId);
  if (!user) {
    throw new AppError('Host not found', 404, 'HOST_NOT_FOUND');
  }

  const sanitizedUpdates = sanitizePropertyUpdates(input.updates);
  const changedOldValue: Record<string, unknown> = {};
  const changedNewValue: Record<string, unknown> = {};

  for (const key of PROPERTY_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(sanitizedUpdates, key)) {
      continue;
    }

    const nextValue = sanitizedUpdates[key];
    const currentValue = property[key as keyof typeof property] as unknown;

    if (toComparable(nextValue) !== toComparable(currentValue)) {
      changedOldValue[key] = currentValue;
      changedNewValue[key] = nextValue;
    }
  }

  if (Object.keys(changedNewValue).length === 0) {
    return { status: 'no_changes' };
  }

  const hasPendingRequestForProperty = Array.isArray(user.profileChangeRequests)
    ? user.profileChangeRequests.some((row: Record<string, unknown>) => {
        const newValue = (row?.newValue ?? {}) as Record<string, unknown>;
        return row?.section === 'host_property'
          && row?.status === 'pending'
          && String(newValue.propertyId ?? '') === input.propertyId;
      })
    : false;

  if (hasPendingRequestForProperty) {
    throw new AppError(
      'You already have a pending property update awaiting admin approval.',
      409,
      'PROFILE_CHANGE_ALREADY_PENDING',
    );
  }

  await UserModel.findByIdAndUpdate(
    new Types.ObjectId(input.hostId),
    {
      $push: {
        profileChangeRequests: {
          section: 'host_property',
          status: 'pending',
          requestedByUserId: new Types.ObjectId(input.hostId),
          requestedAt: new Date(),
          oldValue: {
            propertyId: input.propertyId,
            updates: changedOldValue,
          },
          newValue: {
            propertyId: input.propertyId,
            updates: changedNewValue,
          },
        },
      },
    },
    { returnDocument: 'after' },
  ).lean();

  return { status: 'pending_admin_review' };
}

export async function getPropertyDetails(propertyId: string): Promise<unknown> {
  const property = await findPropertyById(propertyId);
  if (!property) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  const units = await listUnitsByProperty(propertyId);
  return { ...property, units };
}

export async function getPropertyApiDetails(propertyId: string): Promise<PropertyApiView> {
  const property = await findPropertyById(propertyId);
  if (!property) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  const units = await listUnitsByProperty(propertyId);
  return mapPropertyToApiView({ property, units });
}

export async function getHostPrimaryPropertyApiView(hostId: string): Promise<PropertyApiView | null> {
  const property = await findLatestPropertyByHostId(hostId);
  if (!property) {
    return null;
  }

  const units = await listUnitsByProperty(String(property._id));
  return mapPropertyToApiView({ property, units });
}

export async function togglePropertyBookingAvailability(input: {
  propertyId: string;
  hostId: string;
  bookingEnabled: boolean;
}): Promise<{ propertyId: string; bookingEnabled: boolean }> {
  const updated = await setPropertyBookingAvailability(input);
  if (!updated) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  return {
    propertyId: String(updated._id),
    bookingEnabled: Boolean(updated.bookingEnabled),
  };
}

export async function listHostPropertiesAvailability(input: {
  hostId: string;
}): Promise<Array<{ propertyId: string; propertyName: string; bookingEnabled: boolean }>> {
  const properties = await listPropertiesByHostId(input.hostId);
  return properties.map((property) => ({
    propertyId: String(property._id),
    propertyName: property.name,
    bookingEnabled: Boolean(property.bookingEnabled),
  }));
}

export async function setAvailability(input: {
  unitId: string;
  date: string;
  status: 'open' | 'blocked';
}): Promise<void> {
  await upsertAvailability(input.unitId, new Date(input.date), input.status);
}

export async function searchAvailableProperties(input: {
  checkIn: string;
  checkOut: string;
  type?: PropertyType;
  priceMin?: number;
  priceMax?: number;
  guests?: number;
}): Promise<unknown[]> {
  const checkIn = new Date(input.checkIn);
  const checkOut = new Date(input.checkOut);
  const dates = dateRange(checkIn, checkOut);

  const properties = await searchPropertiesByTypeAndPrice(input.type, input.priceMin, input.priceMax);

  const available = await Promise.all(
    properties.map(async (property) => {
      const filteredUnits = await Promise.all(
        property.units
          .filter((u) => {
            const guestFilterPass = typeof input.guests === 'number' ? u.maxGuests >= input.guests : true;
            const minPricePass = typeof input.priceMin === 'number' ? u.pricePerNight >= input.priceMin : true;
            const maxPricePass = typeof input.priceMax === 'number' ? u.pricePerNight <= input.priceMax : true;
            return guestFilterPass && minPricePass && maxPricePass;
          })
          .map(async (unit) => {
            if (unit.isAvailable === false) {
              return null;
            }

            const rows = await listAvailabilityByUnitAndDateRange(String(unit._id), checkIn, checkOut);
            const openCount = rows.filter((row) => row.status === 'open').length;
            return openCount === dates.length ? unit : null;
          }),
      );

      const units = filteredUnits.filter((u): u is NonNullable<typeof u> => u !== null);
      if (units.length === 0) {
        return null;
      }

      return {
        ...property,
        units,
      };
    }),
  );

  return available
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => Number(Boolean(b.bookingEnabled ?? true)) - Number(Boolean(a.bookingEnabled ?? true)));
}

export async function listPropertyApiViews(input: {
  location?: string;
  guests?: number;
  priceMin?: number;
  priceMax?: number;
  propertyType?: PropertyType;
  amenities?: string[];
}): Promise<PropertyApiView[]> {
  const matched = await searchPropertiesByTypeAndPrice(input.propertyType, input.priceMin, input.priceMax);

  return matched
    .filter((entry) => {
      const guests = input.guests;
      const locationPass = input.location
        ? `${entry.city} ${entry.area}`.toLowerCase().includes(input.location.toLowerCase())
        : true;

      const amenitiesPass = input.amenities && input.amenities.length > 0
        ? input.amenities.every((amenity) => entry.amenities.includes(amenity as never))
        : true;

      const guestPass = typeof guests === 'number'
        ? entry.units.some((unit) => unit.maxGuests >= guests)
        : true;

      return locationPass && amenitiesPass && guestPass;
    })
    .sort((a, b) => Number(Boolean(b.bookingEnabled ?? true)) - Number(Boolean(a.bookingEnabled ?? true)))
    .map((entry) => mapPropertyToApiView({ property: entry, units: entry.units }));
}
