export interface CreateUnitBodyDto {
  propertyId: string;
  name: string;
  maxGuests: number;
  pricePerNight: number;
  photos: string[];
  isAvailable?: boolean;
}

export interface UpdateUnitBodyDto {
  name?: string;
  maxGuests?: number;
  pricePerNight?: number;
  photos?: string[];
  isAvailable?: boolean;
}

export interface ToggleUnitAvailabilityBodyDto {
  isAvailable: boolean;
}
