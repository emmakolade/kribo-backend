import { BookingStatus } from '../types/booking';
import { findBookingsByStatus } from '../repositories/bookings.repository';
import { listDisputes, resolveDispute as resolveDisputeRepo } from '../repositories/admin.repository';
import { listUnverifiedHosts } from '../repositories/users.repository';
import { processHostDecision } from './bookings.service';

export async function listBookingsByStatus(status: BookingStatus): Promise<unknown[]> {
  return findBookingsByStatus(status);
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
}

export async function getUnverifiedHosts(): Promise<unknown[]> {
  return listUnverifiedHosts();
}
