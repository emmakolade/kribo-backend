import type { BookingStatus } from './booking';

export interface AdminBookingsQueryDto {
  status?: BookingStatus;
}

export interface ResolveDisputeBodyDto {
  resolutionNotes: string;
}
