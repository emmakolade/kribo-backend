import type { Amenity, PropertyType } from '../constants/enums';

export interface CreatePropertyBodyDto {
  name?: string;
  description: string;
  city: string;
  area: string;
  fullAddress: string;
  coordinates: [number, number];
  amenities: Amenity[];
  photos: string[];
  propertyType?: PropertyType;
}

export interface SearchPropertiesQueryDto {
  checkIn: string;
  checkOut: string;
  type?: PropertyType;
  priceMin?: string;
  priceMax?: string;
  guests?: string;
}

export interface SetAvailabilityBodyDto {
  unitId: string;
  date: string;
  status: 'open' | 'blocked';
}
