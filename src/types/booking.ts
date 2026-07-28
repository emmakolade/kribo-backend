export enum BookingStatus {
  PENDING = 'pending',
  PAYMENT_HELD = 'payment_held',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined',
  CHECKED_IN = 'checked_in',
  COMPLETED = 'completed',
  PAID_OUT = 'paid_out',
  CANCELLED_BY_GUEST = 'cancelled_by_guest',
  CANCELLED_BY_HOST = 'cancelled_by_host',
  DISPUTED = 'disputed',
  ESCALATED = 'escalated',
}

const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.PAYMENT_HELD, BookingStatus.CANCELLED_BY_GUEST],
  [BookingStatus.PAYMENT_HELD]: [
    BookingStatus.CONFIRMED,
    BookingStatus.DECLINED,
    BookingStatus.ESCALATED,
    BookingStatus.CANCELLED_BY_GUEST,
  ],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.CHECKED_IN,
    BookingStatus.CANCELLED_BY_HOST,
    BookingStatus.DISPUTED,
  ],
  [BookingStatus.DECLINED]: [],
  [BookingStatus.CHECKED_IN]: [BookingStatus.COMPLETED, BookingStatus.DISPUTED],
  [BookingStatus.COMPLETED]: [BookingStatus.PAID_OUT, BookingStatus.DISPUTED],
  [BookingStatus.PAID_OUT]: [],
  [BookingStatus.CANCELLED_BY_GUEST]: [],
  [BookingStatus.CANCELLED_BY_HOST]: [],
  [BookingStatus.DISPUTED]: [BookingStatus.COMPLETED],
  [BookingStatus.ESCALATED]: [BookingStatus.CONFIRMED, BookingStatus.DECLINED],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return allowedTransitions[from].includes(to);
}
