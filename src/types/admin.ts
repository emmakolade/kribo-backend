import type { BookingStatus } from './booking';

export interface AdminBookingsQueryDto {
  status?: BookingStatus;
}

export interface ResolveDisputeBodyDto {
  resolutionNotes: string;
}

export interface PaginationQueryDto {
  page?: number;
  limit?: number;
}

export interface AdminUsersQueryDto extends PaginationQueryDto {
  search?: string;
  role?: 'guest' | 'host' | 'admin';
  isSuspended?: boolean;
}

export interface AdminPropertiesQueryDto extends PaginationQueryDto {
  search?: string;
  city?: string;
  verified?: boolean;
  bookingEnabled?: boolean;
}

export interface AdminBookingsListQueryDto extends PaginationQueryDto {
  search?: string;
  status?: BookingStatus;
}

export interface AdminPayoutsQueryDto extends PaginationQueryDto {
  search?: string;
  status?: 'pending' | 'completed' | 'failed';
}

export interface AdminPaymentsQueryDto extends PaginationQueryDto {
  search?: string;
  status?: 'pending' | 'success' | 'failed' | 'abandoned' | 'refunded';
}

export interface AdminUnitsQueryDto extends PaginationQueryDto {
  search?: string;
  propertyId?: string;
  hostId?: string;
  isAvailable?: boolean;
}

export interface AdminDisputesQueryDto extends PaginationQueryDto {
  status?: 'open' | 'resolved';
}

export interface AdminAuditLogQueryDto extends PaginationQueryDto {
  action?: string;
}

export interface UpdateAdminUserDto {
  name?: string;
  role?: 'guest' | 'host' | 'admin';
  phoneNumber?: string;
  hostVerified?: boolean;
  emailVerified?: boolean;
}

export interface UpdateAdminPropertyDto {
  verified?: boolean;
  bookingEnabled?: boolean;
  instantBookEligible?: boolean;
  hostTrustTier?: 'starter' | 'trusted' | 'top';
}

export interface UpdateAdminUnitDto {
  name?: string;
  maxGuests?: number;
  pricePerNight?: number;
  photos?: string[];
  isAvailable?: boolean;
}

export interface AdminBookingStatusUpdateDto {
  status: BookingStatus;
}

export interface AdminOnboardingReviewsQueryDto extends PaginationQueryDto {
  search?: string;
  role?: 'guest' | 'host';
  status?: 'pending' | 'approved' | 'rejected';
}

export interface AdminOnboardingReviewDecisionDto {
  role: 'guest' | 'host';
  decision: 'approve' | 'reject';
  note?: string;
}

export interface AdminProfileChangeRequestsQueryDto extends PaginationQueryDto {
  search?: string;
  role?: 'guest' | 'host';
  section?: 'host_manager' | 'host_business_contact' | 'host_property' | 'guest_profile';
  status?: 'pending' | 'approved' | 'rejected';
}

export interface AdminProfileChangeRequestDecisionDto {
  decision: 'approve' | 'reject';
  note?: string;
}
