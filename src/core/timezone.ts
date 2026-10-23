import type { CalendarEvent } from './types';

/** The system's IANA timezone (e.g. "Europe/Berlin"). */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * One formatter per timezone, reused. Constructing an `Intl.DateTimeFormat` is
 * far more expensive than formatting with one (measured ~99µs vs ~14µs a call),
 * and the month grid converts every timed occurrence in the rendered range —
 * thousands of calls per recompute. The options are fixed, so a per-tz cache is
 * exact: the same formatter always yields the same parts for the same instant.
 */
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = offsetFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(tz, fmt);
  }
  return fmt;
}

/** Offset in minutes (east-positive) of `tz` at the given absolute instant. */
export function tzOffsetMinutes(tz: string, instant: Date): number {
  const parts = offsetFormatter(tz).formatToParts(instant);
  // Single pass over the parts rather than six scans with `find`.
  let year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0;
  for (const p of parts) {
    switch (p.type) {
      case 'year': year = Number(p.value); break;
      case 'month': month = Number(p.value); break;
      case 'day': day = Number(p.value); break;
      case 'hour': hour = Number(p.value); break;
      case 'minute': minute = Number(p.value); break;
      case 'second': second = Number(p.value); break;
    }
  }
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.round((asUTC - instant.getTime()) / 60000);
}

/** The absolute instant at which wall-clock `date`+`time` occurs in `tz`. */
export function wallClockToInstant(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  // The offset depends on the instant (DST); refine twice so we land on the
  // correct side of any transition.
  let offset = tzOffsetMinutes(tz, new Date(utcGuess));
  let instant = utcGuess - offset * 60000;
  offset = tzOffsetMinutes(tz, new Date(instant));
  instant = utcGuess - offset * 60000;
  return new Date(instant);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Wall-clock (date, time) of an absolute instant expressed in `tz`. */
export function instantToWallClock(instant: Date, tz: string): { date: string; time: string } {
  const shifted = new Date(instant.getTime() + tzOffsetMinutes(tz, instant) * 60000);
  // After shifting by the offset, the UTC fields equal the tz-local fields.
  return {
    date: `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`,
    time: `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`,
  };
}

/** Convert a wall-clock from one timezone to another (may shift the date). */
export function convertWallClock(
  date: string,
  time: string,
  fromTz: string,
  toTz: string,
): { date: string; time: string } {
  if (fromTz === toTz) return { date, time };
  return instantToWallClock(wallClockToInstant(date, time, fromTz), toTz);
}

/**
 * Where an event occurrence (originally on `originalDate` in the event's own
 * timezone) lands when viewed in `displayTz`. All-day events and events with
 * no recorded timezone are not converted.
 */
export function displayOccurrence(
  event: CalendarEvent,
  originalDate: string,
  displayTz: string,
): { date: string; time?: string } {
  if (!event.time || !event.tz || event.tz === displayTz) {
    return { date: originalDate, time: event.time };
  }
  return convertWallClock(originalDate, event.time, event.tz, displayTz);
}
