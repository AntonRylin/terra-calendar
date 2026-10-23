import type { CalendarEvent, Recurrence } from './types.js';
import { addDays, daysInMonth, pad2 } from './dates.js';

function occurrenceAt(anchor: string, unit: Recurrence['unit'], monthsOrWeeksOrYears: number): string {
  if (unit === 'week') {
    return addDays(anchor, 7 * monthsOrWeeksOrYears);
  }
  const [y, m, d] = anchor.split('-').map(Number);
  if (unit === 'month') {
    const totalMonths = m - 1 + monthsOrWeeksOrYears;
    const year = y + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return `${year}-${pad2(month)}-${pad2(Math.min(d, daysInMonth(year, month)))}`;
  }
  const year = y + monthsOrWeeksOrYears;
  return `${year}-${pad2(m)}-${pad2(Math.min(d, daysInMonth(year, m)))}`;
}

export function expandOccurrences(
  event: CalendarEvent,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  if (rangeEnd < rangeStart) return [];
  const exdates = new Set(event.exdates || []);
  if (!event.recurrence) {
    return event.date >= rangeStart && event.date <= rangeEnd && !exdates.has(event.date) ? [event.date] : [];
  }
  const { unit, interval } = event.recurrence;
  const step = Math.max(1, Math.floor(interval) || 1);
  const result: string[] = [];
  for (let k = 0; ; k++) {
    const occ = occurrenceAt(event.date, unit, step * k);
    if (occ > rangeEnd) break;
    if (occ >= rangeStart && !exdates.has(occ)) result.push(occ);
  }
  return result;
}

export function nextOccurrence(event: CalendarEvent, from: string): string | null {
  const exdates = new Set(event.exdates || []);
  if (!event.recurrence) {
    return event.date >= from && !exdates.has(event.date) ? event.date : null;
  }
  const { unit, interval } = event.recurrence;
  const step = Math.max(1, Math.floor(interval) || 1);
  for (let k = 0; ; k++) {
    const occ = occurrenceAt(event.date, unit, step * k);
    if (occ >= from && !exdates.has(occ)) return occ;
  }
}
