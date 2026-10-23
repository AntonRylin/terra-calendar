import type { CalendarEvent, Recurrence } from './types';
import { addDays, dayDiff, daysInMonth, pad2 } from './dates';
import { isTaskEvent } from './tasks';

/**
 * The k-th occurrence (k >= 0) of a recurrence anchored at `anchor`.
 * Monotonically increasing in k. Days 29-31 clamp to shorter months;
 * Feb 29 anchors clamp to Feb 28 in non-leap years.
 */
function occurrenceAt(anchor: string, unit: Recurrence['unit'], offset: number): string {
  if (unit === 'day' || unit === 'week') {
    return addDays(anchor, (unit === 'week' ? 7 : 1) * offset);
  }
  const [y, m, d] = anchor.split('-').map(Number);
  if (unit === 'month') {
    const totalMonths = m - 1 + offset;
    const year = y + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return `${year}-${pad2(month)}-${pad2(Math.min(d, daysInMonth(year, month)))}`;
  }
  const year = y + offset;
  return `${year}-${pad2(m)}-${pad2(Math.min(d, daysInMonth(year, m)))}`;
}

/**
 * Index of the last occurrence at or before `target`, as a lower bound: never
 * overshoots, may undershoot by one. Lets the loops below jump straight to the
 * range instead of walking every occurrence since the anchor — a weekly event
 * anchored years back otherwise costs time proportional to its age rather than
 * to the range being asked about.
 *
 * Because `occurrenceAt` is monotonic in k, starting from a k that is at or
 * before the target is always safe: the existing `occ >= rangeStart` filter
 * discards anything that still lands early.
 */
function seekIndex(anchor: string, unit: Recurrence['unit'], step: number, target: string): number {
  if (target <= anchor) return 0;
  let k: number;
  if (unit === 'day' || unit === 'week') {
    k = Math.floor(dayDiff(anchor, target) / ((unit === 'week' ? 7 : 1) * step));
  } else {
    const [ay, am] = anchor.split('-').map(Number);
    const [ty, tm] = target.split('-').map(Number);
    // Day-of-month clamping (31st in a short month) can pull an occurrence
    // earlier, so this is a bound rather than an exact index — hence the
    // one-step back-off below.
    const units = unit === 'month' ? (ty - ay) * 12 + (tm - am) : ty - ay;
    k = Math.floor(units / step);
  }
  return Math.max(0, k - 1);
}

/**
 * Concrete dates the event occurs on within [rangeStart, rangeEnd], inclusive.
 * All panels consume occurrences — never raw recurrence rules.
 */
export function expandOccurrences(
  event: CalendarEvent,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  // Dateless tasks never occur on any day — this single guard keeps them out of
  // the month grid, minimap dots, and the upcoming list at once.
  if (isTaskEvent(event)) return [];
  if (rangeEnd < rangeStart) return [];
  const exdates = new Set(event.exdates || []);
  if (!event.recurrence) {
    // A span (endDate > date) occurs on every day in its range; a single-day
    // event has spanEnd === date, so this also covers the ordinary case.
    const spanEnd = event.endDate && event.endDate > event.date ? event.endDate : event.date;
    const from = event.date > rangeStart ? event.date : rangeStart;
    const to = spanEnd < rangeEnd ? spanEnd : rangeEnd;
    const result: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!exdates.has(d)) result.push(d);
    }
    return result;
  }
  const { unit, interval } = event.recurrence;
  const step = Math.max(1, Math.floor(interval) || 1);
  const result: string[] = [];
  for (let k = seekIndex(event.date, unit, step, rangeStart); ; k++) {
    const occ = occurrenceAt(event.date, unit, step * k);
    if (occ > rangeEnd) break;
    if (occ >= rangeStart && !exdates.has(occ)) result.push(occ);
  }
  return result;
}

/** First occurrence on or after `from`, or null (one-time events in the past). */
export function nextOccurrence(event: CalendarEvent, from: string): string | null {
  const exdates = new Set(event.exdates || []);
  if (!event.recurrence) {
    return event.date >= from && !exdates.has(event.date) ? event.date : null;
  }
  const { unit, interval } = event.recurrence;
  const step = Math.max(1, Math.floor(interval) || 1);
  for (let k = seekIndex(event.date, unit, step, from); ; k++) {
    const occ = occurrenceAt(event.date, unit, step * k);
    if (occ >= from && !exdates.has(occ)) return occ;
  }
}
