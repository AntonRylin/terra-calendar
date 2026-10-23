export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses "YYYY-MM-DD" to a Date at local midnight. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** 1-based day of year; immune to DST because it counts calendar days. */
export function dayOfYear(iso: string): number {
  const d = parseISODate(iso);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.round((d.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

export function friendlyDate(iso: string, time: string | undefined, today: string): string {
  let label: string;
  if (iso === today) {
    label = 'Today';
  } else if (iso === addDays(today, 1)) {
    label = 'Tomorrow';
  } else {
    const d = parseISODate(iso);
    label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return time ? `${label} · ${time}` : label;
}
