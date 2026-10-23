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

/** Whole calendar days from `fromISO` to `toISO` (negative if `toISO` is earlier);
 *  immune to DST because it rounds to whole days. */
export function dayDiff(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 1-based day of year; immune to DST because it counts calendar days. */
export function dayOfYear(iso: string): number {
  const d = parseISODate(iso);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.round((d.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

/** A two-digit year is read as 20xx (this is a calendar of near-future events);
 *  longer runs are taken literally. */
function expandYear(raw: string): number {
  const n = Number(raw);
  return raw.length <= 2 ? 2000 + n : n;
}

function isValidDMY(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) && year >= 1 && year <= 9999 &&
    Number.isInteger(month) && month >= 1 && month <= 12 &&
    Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month)
  );
}

/**
 * Parse a loosely-typed date into "YYYY-MM-DD", or null if it can't be read.
 *
 * Meant for a free-text date field, so it accepts the shapes people actually
 * type — day-first, the way most of the world writes dates:
 *   "30.12.2027" · "30/12/27" · "30-12-2027" · "5 6 27"
 *   "12052025" (DDMMYYYY) · "120525" (DDMMYY) · "1205" (DDMM) · "15" (just a day)
 * ISO "2027-12-30" is recognised as-is (year-first when the first field is 4
 * digits). Missing fields are filled from `ref` (the month/year currently in
 * view), so "15" means the 15th of the month you're looking at.
 *
 * Day-first wins, but when a day-first reading is impossible and swapping the
 * first two fields makes it valid, the swap is taken — so a US-style
 * "05/13/2025" still lands on May 13 instead of being rejected.
 */
export function parseLooseDate(
  raw: string,
  ref: { year: number; month: number },
): string | null {
  const s = raw.trim();
  if (!s) return null;

  let dStr: string;
  let mStr: string;
  let yStr: string | undefined;

  if (/\D/.test(s)) {
    // Separated form: split on any run of non-digits.
    const parts = s.split(/\D+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0].length === 4) {
      // Year-first (ISO-ish "2027-12-30").
      yStr = parts[0];
      mStr = parts[1] ?? '1';
      dStr = parts[2] ?? '1';
    } else {
      dStr = parts[0];
      mStr = parts[1] ?? String(ref.month);
      yStr = parts[2];
    }
  } else {
    // Packed digits, sliced by length (day, then month, then year).
    switch (s.length) {
      case 1:
      case 2:
        dStr = s;
        mStr = String(ref.month);
        break;
      case 4:
        dStr = s.slice(0, 2);
        mStr = s.slice(2, 4);
        break;
      case 6:
        dStr = s.slice(0, 2);
        mStr = s.slice(2, 4);
        yStr = s.slice(4, 6);
        break;
      case 8:
        dStr = s.slice(0, 2);
        mStr = s.slice(2, 4);
        yStr = s.slice(4, 8);
        break;
      default:
        return null; // 3, 5, 7, 9+ packed digits are too ambiguous to guess.
    }
  }

  let day = Number(dStr);
  let month = Number(mStr);
  const year = yStr !== undefined ? expandYear(yStr) : ref.year;

  if (!isValidDMY(year, month, day) && isValidDMY(year, day, month)) {
    [day, month] = [month, day];
  }
  if (!isValidDMY(year, month, day)) return null;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** "YYYY-MM-DD" → "DD.MM.YYYY" — the canonical text for the date field. */
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
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
