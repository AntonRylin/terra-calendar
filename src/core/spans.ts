import type { CalendarEvent } from './types';

/**
 * Multi-day spans (holidays and other typed ranges) are a single event whose
 * `endDate` extends past its `date`. They are all-day in Phase 1. Single-day
 * events (no `endDate`, or `endDate <= date`) behave exactly as before.
 */

/** True when the event covers more than one day. */
export function isSpan(event: CalendarEvent): boolean {
  return !!event.endDate && event.endDate > event.date;
}

/** Inclusive last day of the event; `date` itself for a single-day event. */
export function spanEndDate(event: CalendarEvent): string {
  return isSpan(event) ? event.endDate! : event.date;
}

/** Title shown for a given day of a span — a per-day override or the span title. */
export function dayTitle(event: CalendarEvent, date: string): string {
  return event.dayOverrides?.[date]?.title ?? event.title;
}

/** Per-day start time, if that day was given a specific time (else all-day). */
export function dayTime(event: CalendarEvent, date: string): string | undefined {
  return event.dayOverrides?.[date]?.time;
}

/** Whether a given day of the span shows on the minimap: a per-day override
 *  wins, otherwise the whole-span `showOnMinimap` default applies. */
export function dayOnMinimap(event: CalendarEvent, date: string): boolean {
  const override = event.dayOverrides?.[date]?.showOnMinimap;
  if (override !== undefined) return override;
  return event.showOnMinimap !== false;
}

export type SpanStatus = 'upcoming' | 'ongoing' | 'past';

/** Where `today` falls relative to the span, treating both bounds inclusive. */
export function spanStatus(event: CalendarEvent, today: string): SpanStatus {
  if (today < event.date) return 'upcoming';
  if (today > spanEndDate(event)) return 'past';
  return 'ongoing';
}
