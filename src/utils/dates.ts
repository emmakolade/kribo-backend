export function dateRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start);

  while (cursor < end) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function toOrdinal(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${day}st`;
  }
  if (mod10 === 2 && mod100 !== 12) {
    return `${day}nd`;
  }
  if (mod10 === 3 && mod100 !== 13) {
    return `${day}rd`;
  }
  return `${day}th`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatBookingDisplayDate(input: Date): string {
  const weekday = WEEKDAYS[input.getUTCDay()];
  const day = toOrdinal(input.getUTCDate());
  const month = MONTHS[input.getUTCMonth()];
  const year = input.getUTCFullYear();

  return `${weekday}, ${day} ${month} ${year}`;
}
