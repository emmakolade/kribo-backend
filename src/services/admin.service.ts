import { Types } from 'mongoose';
import { AdminAuditLogModel } from '../models/adminAuditLog.model';
import { BookingModel } from '../models/booking.model';
import { DisputeModel } from '../models/dispute.model';
import { PaymentModel, PaymentStatus } from '../models/payment.model';
import { PayoutModel } from '../models/payout.model';
import { PropertyModel } from '../models/property.model';
import { UnitModel } from '../models/unit.model';
import { UserModel } from '../models/user.model';
import { updateBookingStatus } from '../repositories/bookings.repository';
import { listDisputes, resolveDispute as resolveDisputeRepo } from '../repositories/admin.repository';
import { completePayoutByBookingId } from '../repositories/payouts.repository';
import { listUnverifiedHosts } from '../repositories/users.repository';
import type {
  AdminAuditLogQueryDto,
  AdminBookingsListQueryDto,
  AdminDisputesQueryDto,
  AdminProfileChangeRequestsQueryDto,
  AdminOnboardingReviewsQueryDto,
  AdminPaymentsQueryDto,
  AdminPayoutsQueryDto,
  AdminPropertiesQueryDto,
  AdminUnitsQueryDto,
  AdminProfileChangeRequestDecisionDto,
  AdminUsersQueryDto,
  UpdateAdminPropertyDto,
  UpdateAdminUnitDto,
  UpdateAdminUserDto,
} from '../types/admin';
import { BookingStatus } from '../types/booking';
import { AppError } from '../utils/AppError';
import { processHostDecision } from './bookings.service';
import { emailService } from './email.service';

function toPagination(input: { page?: number; limit?: number }): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 20)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildSearchRegex(search?: string): RegExp | null {
  const normalized = search?.trim();
  if (!normalized) {
    return null;
  }
  return new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function mapProfileChangeRequests(user: Record<string, any>): Array<Record<string, unknown>> {
  const rows = Array.isArray(user.profileChangeRequests) ? user.profileChangeRequests : [];
  return rows.map((row) => ({
    requestId: String(row?._id),
    section: row?.section ?? '',
    status: row?.status ?? 'pending',
    requestedAt: row?.requestedAt ?? null,
    reviewedAt: row?.reviewedAt ?? null,
    note: row?.note ?? '',
    oldValue: row?.oldValue ?? {},
    newValue: row?.newValue ?? {},
  }));
}

async function audit(input: {
  adminId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await AdminAuditLogModel.create({
    adminId: new Types.ObjectId(input.adminId),
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
  });
}

export async function getAdminOverview(): Promise<unknown> {
  const [
    totalUsers,
    totalHosts,
    totalGuests,
    totalAdmins,
    totalProperties,
    totalBookings,
    openDisputes,
    pendingPayouts,
    pendingPayments,
  ] = await Promise.all([
    UserModel.countDocuments({}),
    UserModel.countDocuments({ role: 'host' }),
    UserModel.countDocuments({ role: 'guest' }),
    UserModel.countDocuments({ role: 'admin' }),
    PropertyModel.countDocuments({}),
    BookingModel.countDocuments({}),
    DisputeModel.countDocuments({ status: 'open' }),
    PayoutModel.countDocuments({ status: 'pending' }),
    PaymentModel.countDocuments({ status: PaymentStatus.PENDING }),
  ]);

  return {
    users: { totalUsers, totalHosts, totalGuests, totalAdmins },
    operations: { totalProperties, totalBookings, openDisputes, pendingPayouts, pendingPayments },
  };
}

export async function listAdminUsers(input: AdminUsersQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.role) {
    filter.role = input.role;
  }

  if (typeof input.isSuspended === 'boolean') {
    filter.isSuspended = input.isSuspended;
  }

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phoneNumber: searchRegex },
    ];
  }

  const [rows, total] = await Promise.all([
    UserModel.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function updateAdminUser(input: {
  adminId: string;
  userId: string;
  updates: UpdateAdminUserDto;
}): Promise<unknown> {
  const updated = await UserModel.findByIdAndUpdate(
    new Types.ObjectId(input.userId),
    { $set: input.updates },
    { returnDocument: 'after' },
  ).select('-passwordHash').lean();

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: 'admin.user.updated',
    resourceType: 'user',
    resourceId: input.userId,
    metadata: { updates: input.updates },
  });

  return updated;
}

export async function suspendAdminUser(input: { adminId: string; userId: string }): Promise<void> {
  const updated = await UserModel.findByIdAndUpdate(
    new Types.ObjectId(input.userId),
    { $set: { isSuspended: true, suspendedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: 'admin.user.suspended',
    resourceType: 'user',
    resourceId: input.userId,
  });
}

export async function restoreAdminUser(input: { adminId: string; userId: string }): Promise<void> {
  const updated = await UserModel.findByIdAndUpdate(
    new Types.ObjectId(input.userId),
    { $set: { isSuspended: false, suspendedAt: null } },
    { returnDocument: 'after' },
  ).lean();

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: 'admin.user.restored',
    resourceType: 'user',
    resourceId: input.userId,
  });
}

export async function listAdminProperties(input: AdminPropertiesQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.city) {
    filter.city = input.city;
  }
  if (typeof input.verified === 'boolean') {
    filter.verified = input.verified;
  }
  if (typeof input.bookingEnabled === 'boolean') {
    filter.bookingEnabled = input.bookingEnabled;
  }

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.$or = [{ name: searchRegex }, { city: searchRegex }, { area: searchRegex }];
  }

  const [rows, total] = await Promise.all([
    PropertyModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PropertyModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function updateAdminProperty(input: {
  adminId: string;
  propertyId: string;
  updates: UpdateAdminPropertyDto;
}): Promise<unknown> {
  const updated = await PropertyModel.findByIdAndUpdate(
    new Types.ObjectId(input.propertyId),
    { $set: input.updates },
    { returnDocument: 'after' },
  ).lean();

  if (!updated) {
    throw new AppError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: 'admin.property.updated',
    resourceType: 'property',
    resourceId: input.propertyId,
    metadata: { updates: input.updates },
  });

  return updated;
}

export async function listAdminBookings(input: AdminBookingsListQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  const normalizedSearch = input.search?.trim();
  if (normalizedSearch && Types.ObjectId.isValid(normalizedSearch)) {
    const objectId = new Types.ObjectId(normalizedSearch);
    filter.$or = [{ _id: objectId }, { guestId: objectId }, { hostId: objectId }];
  }

  const [rows, total] = await Promise.all([
    BookingModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BookingModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function setAdminBookingStatus(input: {
  adminId: string;
  bookingId: string;
  status: BookingStatus;
}): Promise<unknown> {
  const updated = await updateBookingStatus(input.bookingId, input.status);
  if (!updated) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: 'admin.booking.status.updated',
    resourceType: 'booking',
    resourceId: input.bookingId,
    metadata: { status: input.status },
  });

  return updated;
}

export async function listAdminPayouts(input: AdminPayoutsQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.transferReference = searchRegex;
  }

  const [rows, total] = await Promise.all([
    PayoutModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PayoutModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function markAdminPayoutPaidOut(input: {
  adminId: string;
  bookingId: string;
}): Promise<void> {
  const completedRef = `admin_manual_${input.bookingId}_${Date.now()}`;
  const payout = await completePayoutByBookingId(input.bookingId, completedRef);
  if (!payout) {
    throw new AppError('Payout not found', 404, 'PAYOUT_NOT_FOUND');
  }

  await updateBookingStatus(input.bookingId, BookingStatus.PAID_OUT);

  await audit({
    adminId: input.adminId,
    action: 'admin.payout.mark_paid_out',
    resourceType: 'payout',
    resourceId: String(payout._id),
    metadata: { bookingId: input.bookingId, transferReference: completedRef },
  });
}

export async function listAdminPayments(input: AdminPaymentsQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.status) {
    filter.status = input.status;
  }

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.$or = [{ gatewayReference: searchRegex }, { internalReference: searchRegex }];
  }

  const [rows, total] = await Promise.all([
    PaymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PaymentModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function listAdminUnits(input: AdminUnitsQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.propertyId && Types.ObjectId.isValid(input.propertyId)) {
    filter.propertyId = new Types.ObjectId(input.propertyId);
  }

  if (typeof input.isAvailable === 'boolean') {
    filter.isAvailable = input.isAvailable;
  }

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.name = searchRegex;
  }

  if (input.hostId && Types.ObjectId.isValid(input.hostId)) {
    const hostPropertyRows = await PropertyModel.find({ hostId: new Types.ObjectId(input.hostId) })
      .select({ _id: 1 })
      .lean();
    filter.propertyId = {
      $in: hostPropertyRows.map((row) => row._id),
    };
  }

  const [rows, total] = await Promise.all([
    UnitModel.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    UnitModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function updateAdminUnit(input: {
  adminId: string;
  unitId: string;
  updates: UpdateAdminUnitDto;
}): Promise<unknown> {
  const updated = await UnitModel.findByIdAndUpdate(
    new Types.ObjectId(input.unitId),
    { $set: input.updates },
    { returnDocument: 'after' },
  ).lean();

  if (!updated) {
    throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: 'admin.unit.updated',
    resourceType: 'unit',
    resourceId: input.unitId,
    metadata: { updates: input.updates },
  });

  return updated;
}

export async function listAdminDisputes(input: AdminDisputesQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};
  if (input.status) {
    filter.status = input.status;
  }

  const [rows, total] = await Promise.all([
    DisputeModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    DisputeModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function listAdminAuditLogs(input: AdminAuditLogQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {};

  if (input.action) {
    filter.action = input.action;
  }

  const [rows, total] = await Promise.all([
    AdminAuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminAuditLogModel.countDocuments(filter),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows,
  };
}

export async function listBookingsByStatus(status: BookingStatus): Promise<unknown[]> {
  return BookingModel.find({ status }).lean();
}

export async function forceAccept(bookingId: string): Promise<{ status: BookingStatus }> {
  return processHostDecision({
    bookingId,
    decision: 'accept',
    webhookId: `admin_force_accept_${Date.now()}`,
  });
}

export async function forceDecline(bookingId: string): Promise<{ status: BookingStatus }> {
  return processHostDecision({
    bookingId,
    decision: 'decline',
    webhookId: `admin_force_decline_${Date.now()}`,
  });
}

export async function getDisputes(): Promise<unknown[]> {
  return listDisputes();
}

export async function resolveDispute(
  disputeId: string,
  resolutionNotes: string,
  resolvedBy: string,
): Promise<void> {
  await resolveDisputeRepo(disputeId, resolutionNotes, resolvedBy);
  await audit({
    adminId: resolvedBy,
    action: 'admin.dispute.resolved',
    resourceType: 'dispute',
    resourceId: disputeId,
    metadata: { resolutionNotes },
  });
}

export async function getUnverifiedHosts(): Promise<unknown[]> {
  return listUnverifiedHosts();
}

function resolveOnboardingStatus(user: Record<string, any>, role: 'guest' | 'host'): 'pending' | 'approved' | 'rejected' {
  const hasPendingChangeRequest = Array.isArray(user.profileChangeRequests)
    ? user.profileChangeRequests.some((row: Record<string, any>) => row?.status === 'pending')
    : false;
  if (hasPendingChangeRequest) {
    return 'pending';
  }

  if (role === 'guest') {
    return user.guestOnboarding?.verified ? 'approved' : 'pending';
  }

  const bankStatus = String(user.hostCompliance?.bankAccount?.verificationStatus ?? '').toLowerCase();
  if (bankStatus === 'rejected') {
    return 'rejected';
  }

  if (user.hostVerified === true && bankStatus === 'approved') {
    return 'approved';
  }

  return 'pending';
}

export async function listAdminOnboardingReviews(input: AdminOnboardingReviewsQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {
    role: input.role ?? { $in: ['guest', 'host'] },
  };

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  const rows = await UserModel.find(filter)
    .select({
      name: 1,
      email: 1,
      role: 1,
      hostVerified: 1,
      idDocumentUrl: 1,
      hostOnboarding: 1,
      hostCompliance: 1,
      guestOnboarding: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const normalizedRows = rows
    .filter((row) => row.role === 'guest' || row.role === 'host')
    .map((row) => {
      const role = row.role as 'guest' | 'host';
      const status = resolveOnboardingStatus(row as Record<string, any>, role);
      return {
        _id: String(row._id),
        name: row.name,
        email: row.email,
        role,
        status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        profileChangeRequests: mapProfileChangeRequests(row as Record<string, any>),
        host: role === 'host'
          ? {
              propertyName: row.hostOnboarding?.propertyName ?? '',
              propertyType: row.hostOnboarding?.propertyType ?? '',
              managerName: row.hostCompliance?.manager?.managerName ?? '',
              ninNumber: row.hostCompliance?.manager?.ninNumber ?? '',
              ninDocumentUrl: row.hostCompliance?.manager?.ninDocumentUrl ?? '',
              idDocumentUrl: row.idDocumentUrl ?? '',
              proofOfAddressUrl: row.hostCompliance?.manager?.proofOfAddressUrl ?? '',
              accountNumber: row.hostCompliance?.bankAccount?.accountNumber ?? '',
              bankCode: row.hostCompliance?.bankAccount?.bankCode ?? '',
              bankName: row.hostCompliance?.bankAccount?.bankName ?? '',
              accountName: row.hostCompliance?.bankAccount?.accountName ?? '',
              bankVerificationStatus: row.hostCompliance?.bankAccount?.verificationStatus ?? 'pending_manual_review',
              serviceAgreementAccepted: row.hostCompliance?.serviceAgreement?.accepted === true,
              isBusinessActive: row.hostCompliance?.isBusinessActive === true,
              hostVerified: row.hostVerified === true,
            }
          : null,
        guest: role === 'guest'
          ? {
              phoneNumber: row.guestOnboarding?.phoneNumber ?? '',
              whatsappNumber: row.guestOnboarding?.whatsappNumber ?? '',
              ninNumber: row.guestOnboarding?.ninNumber ?? '',
              ninDocumentUrl: row.guestOnboarding?.ninDocumentUrl ?? '',
              verified: row.guestOnboarding?.verified === true,
            }
          : null,
      };
    });

  const filteredByStatus = input.status
    ? normalizedRows.filter((row) => row.status === input.status)
    : normalizedRows;

  const total = filteredByStatus.length;
  const pagedRows = filteredByStatus.slice(skip, skip + limit);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows: pagedRows,
  };
}

export async function decideAdminOnboardingReview(input: {
  adminId: string;
  userId: string;
  role: 'guest' | 'host';
  decision: 'approve' | 'reject';
  note?: string;
}): Promise<unknown> {
  const user = await UserModel.findById(new Types.ObjectId(input.userId)).lean();
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (user.role !== input.role) {
    throw new AppError('Role mismatch for onboarding review', 400, 'ONBOARDING_ROLE_MISMATCH');
  }

  const isApproved = input.decision === 'approve';
  const updates: Record<string, unknown> = {};

  if (input.role === 'guest') {
    updates['guestOnboarding.verified'] = isApproved;
    if (isApproved && !user.guestOnboarding?.completedAt) {
      updates['guestOnboarding.completedAt'] = new Date();
    }
  }
  else {
    updates.hostVerified = isApproved;
    updates['hostCompliance.bankAccount.verificationStatus'] = isApproved ? 'approved' : 'rejected';
    updates['hostCompliance.isBusinessActive'] = isApproved;
    updates['hostCompliance.activatedAt'] = isApproved ? new Date() : null;
  }

  const updated = await UserModel.findByIdAndUpdate(
    new Types.ObjectId(input.userId),
    { $set: updates },
    { returnDocument: 'after' },
  )
    .select('-passwordHash')
    .lean();

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: isApproved ? 'admin.onboarding.approved' : 'admin.onboarding.rejected',
    resourceType: 'user',
    resourceId: input.userId,
    metadata: {
      role: input.role,
      decision: input.decision,
      note: input.note ?? null,
      updates,
    },
  });

  if (!isApproved && input.role === 'host') {
    try {
      await emailService.sendHostOnboardingRejectedEmail({
        to: updated.email,
        hostName: updated.name,
        reasonNote: input.note?.trim() || 'Your submitted onboarding details did not pass review. Please update and resubmit.',
      });
    }
    catch (error) {
      // Do not fail review decision if email delivery fails.
      console.error('Failed to send host onboarding rejection email', error);
    }
  }

  if (isApproved && input.role === 'host') {
    try {
      await emailService.sendHostOnboardingApprovedEmail({
        to: updated.email,
        hostName: updated.name,
      });
    }
    catch (error) {
      // Do not fail review decision if email delivery fails.
      console.error('Failed to send host onboarding approval email', error);
    }
  }

  return {
    _id: String(updated._id),
    role: updated.role,
    guestVerified: updated.guestOnboarding?.verified === true,
    hostVerified: updated.hostVerified === true,
    bankVerificationStatus: updated.hostCompliance?.bankAccount?.verificationStatus ?? null,
    isBusinessActive: updated.hostCompliance?.isBusinessActive === true,
  };
}

export async function listAdminProfileChangeRequests(input: AdminProfileChangeRequestsQueryDto): Promise<unknown> {
  const { page, limit, skip } = toPagination(input);
  const filter: Record<string, unknown> = {
    profileChangeRequests: { $exists: true, $ne: [] },
  };

  if (input.role) {
    filter.role = input.role;
  }

  const searchRegex = buildSearchRegex(input.search);
  if (searchRegex) {
    filter.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  const rows = await UserModel.find(filter)
    .select({
      name: 1,
      email: 1,
      role: 1,
      profileChangeRequests: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const flattenedRows = rows
    .filter((row) => row.role === 'guest' || row.role === 'host')
    .flatMap((row) => {
      const role = row.role as 'guest' | 'host';
      const requestRows = Array.isArray(row.profileChangeRequests) ? row.profileChangeRequests : [];

      return requestRows
        .filter((request: Record<string, any>) => {
          if (input.section && request?.section !== input.section) {
            return false;
          }

          if (input.status && request?.status !== input.status) {
            return false;
          }

          return true;
        })
        .map((request: Record<string, any>) => ({
          requestId: String(request?._id),
          userId: String(row._id),
          userName: row.name,
          userEmail: row.email,
          userRole: role,
          section: request?.section ?? '',
          status: request?.status ?? 'pending',
          requestedAt: request?.requestedAt ?? null,
          reviewedAt: request?.reviewedAt ?? null,
          note: request?.note ?? '',
          oldValue: request?.oldValue ?? {},
          newValue: request?.newValue ?? {},
        }));
    });

  const total = flattenedRows.length;
  const pagedRows = flattenedRows.slice(skip, skip + limit);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    rows: pagedRows,
  };
}

function buildApprovedProfileChangeUpdates(
  section: string,
  newValue: Record<string, any>,
): Record<string, unknown> {
  if (section === 'host_business_contact') {
    return {
      'hostCompliance.businessContact.businessPhoneNumber': newValue.businessPhoneNumber ?? '',
      'hostCompliance.businessContact.businessPhoneCountryIso': newValue.businessPhoneCountryIso ?? '',
      'hostCompliance.businessContact.businessPhoneCountryDialCode': newValue.businessPhoneCountryDialCode ?? '',
      'hostCompliance.businessContact.trustedWhatsappNumber': newValue.trustedWhatsappNumber ?? '',
      'hostCompliance.businessContact.trustedWhatsappCountryIso': newValue.trustedWhatsappCountryIso ?? '',
      'hostCompliance.businessContact.trustedWhatsappCountryDialCode': newValue.trustedWhatsappCountryDialCode ?? '',
      'hostCompliance.businessContact.officeAddress': newValue.officeAddress ?? '',
      'hostCompliance.businessContact.officeLga': newValue.officeLga ?? '',
      'hostCompliance.businessContact.officeState': newValue.officeState ?? '',
      'hostCompliance.businessContact.website': newValue.website ?? '',
      'hostCompliance.businessContact.completedAt': new Date(),
    };
  }

  if (section === 'host_manager') {
    return {
      'hostCompliance.manager.managerName': newValue.managerName ?? '',
      'hostCompliance.manager.dateOfBirth': newValue.dateOfBirth ? new Date(newValue.dateOfBirth) : null,
      'hostCompliance.manager.nationality': newValue.nationality ?? '',
      'hostCompliance.manager.ninNumber': newValue.ninNumber ?? '',
      'hostCompliance.manager.ninDocumentUrl': newValue.ninDocumentUrl ?? '',
      'hostCompliance.manager.managerHomeAddress': newValue.managerHomeAddress ?? '',
      'hostCompliance.manager.proofOfAddressUrl': newValue.proofOfAddressUrl ?? '',
      'hostCompliance.manager.completedAt': new Date(),
    };
  }

  if (section === 'guest_profile') {
    return {
      phoneNumber: newValue.phoneNumber ?? '',
      phoneCountryIso: newValue.phoneCountryIso ?? 'NG',
      phoneCountryDialCode: newValue.phoneCountryDialCode ?? '+234',
      'guestOnboarding.phoneNumber': newValue.phoneNumber ?? '',
      'guestOnboarding.phoneCountryIso': newValue.phoneCountryIso ?? 'NG',
      'guestOnboarding.phoneCountryDialCode': newValue.phoneCountryDialCode ?? '+234',
      'guestOnboarding.isWhatsappNumber': newValue.isWhatsappNumber === true,
      'guestOnboarding.whatsappNumber': newValue.whatsappNumber ?? '',
      'guestOnboarding.whatsappCountryIso': newValue.whatsappCountryIso ?? 'NG',
      'guestOnboarding.whatsappCountryDialCode': newValue.whatsappCountryDialCode ?? '+234',
      'guestOnboarding.ninNumber': newValue.ninNumber ?? '',
      'guestOnboarding.ninDocumentUrl': newValue.ninDocumentUrl ?? '',
      'guestOnboarding.completedAt': new Date(),
      'guestOnboarding.verified': true,
    };
  }

  throw new AppError('Unknown profile change section', 400, 'UNKNOWN_PROFILE_CHANGE_SECTION');
}

export async function decideAdminProfileChangeRequest(input: {
  adminId: string;
  requestId: string;
  decision: AdminProfileChangeRequestDecisionDto['decision'];
  note?: string;
}): Promise<unknown> {
  const requestObjectId = new Types.ObjectId(input.requestId);
  const user = await UserModel.findOne({ 'profileChangeRequests._id': requestObjectId }).lean();

  if (!user) {
    throw new AppError('Profile change request not found', 404, 'PROFILE_CHANGE_REQUEST_NOT_FOUND');
  }

  const requestRow = (user.profileChangeRequests ?? []).find(
    (row: Record<string, any>) => String(row?._id) === input.requestId,
  ) as Record<string, any> | undefined;

  if (!requestRow) {
    throw new AppError('Profile change request not found', 404, 'PROFILE_CHANGE_REQUEST_NOT_FOUND');
  }

  if (requestRow.status !== 'pending') {
    throw new AppError('Profile change request has already been reviewed', 409, 'PROFILE_CHANGE_REQUEST_ALREADY_REVIEWED');
  }

  const isApproved = input.decision === 'approve';
  const requestUpdates: Record<string, unknown> = {
    'profileChangeRequests.$[request].status': isApproved ? 'approved' : 'rejected',
    'profileChangeRequests.$[request].reviewedAt': new Date(),
    'profileChangeRequests.$[request].reviewedByAdminId': new Types.ObjectId(input.adminId),
    'profileChangeRequests.$[request].note': input.note?.trim() ?? '',
  };

  if (isApproved && requestRow.section === 'host_property') {
    const requestNewValue = (requestRow.newValue ?? {}) as Record<string, any>;
    const propertyId = String(requestNewValue.propertyId ?? '');
    if (!Types.ObjectId.isValid(propertyId)) {
      throw new AppError('Invalid property id in profile change request', 400, 'INVALID_PROPERTY_CHANGE_REQUEST');
    }

    const requestedUpdates = requestNewValue.updates as Record<string, unknown> | undefined;
    if (!requestedUpdates || typeof requestedUpdates !== 'object') {
      throw new AppError('Invalid property updates in profile change request', 400, 'INVALID_PROPERTY_CHANGE_REQUEST');
    }

    const allowedKeys = new Set(['name', 'description', 'city', 'area', 'fullAddress', 'amenities', 'photos', 'propertyType']);
    const sanitizedPropertyUpdates = Object.entries(requestedUpdates).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (allowedKeys.has(key)) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (Object.keys(sanitizedPropertyUpdates).length === 0) {
      throw new AppError('No editable property fields found in profile change request', 400, 'INVALID_PROPERTY_CHANGE_REQUEST');
    }

    const updatedProperty = await PropertyModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(propertyId),
        hostId: new Types.ObjectId(String(user._id)),
      },
      { $set: sanitizedPropertyUpdates },
      { returnDocument: 'after' },
    ).lean();

    if (!updatedProperty) {
      throw new AppError('Property not found for this host', 404, 'PROPERTY_NOT_FOUND');
    }
  }

  const combinedUpdates = isApproved
    ? {
      ...buildApprovedProfileChangeUpdates(
        String(requestRow.section),
        (requestRow.newValue ?? {}) as Record<string, any>,
      ),
      ...requestUpdates,
    }
    : requestUpdates;

  const updated = await UserModel.findByIdAndUpdate(
    new Types.ObjectId(String(user._id)),
    { $set: combinedUpdates },
    {
      returnDocument: 'after',
      arrayFilters: [{ 'request._id': requestObjectId }],
    },
  )
    .select('-passwordHash')
    .lean();

  if (!updated) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  await audit({
    adminId: input.adminId,
    action: isApproved ? 'admin.profile_change.approved' : 'admin.profile_change.rejected',
    resourceType: 'user',
    resourceId: String(user._id),
    metadata: {
      requestId: input.requestId,
      section: requestRow.section,
      decision: input.decision,
      note: input.note ?? null,
      oldValue: requestRow.oldValue ?? {},
      newValue: requestRow.newValue ?? {},
    },
  });

  return {
    userId: String(updated._id),
    requestId: input.requestId,
    section: requestRow.section,
    status: isApproved ? 'approved' : 'rejected',
    reviewedAt: new Date().toISOString(),
  };
}
