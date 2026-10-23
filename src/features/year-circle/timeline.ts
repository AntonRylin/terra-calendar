import { addDays } from '../../core/dates';
import { expandOccurrences } from '../../core/occurrences';
import { hiddenFromMinimapByCategory } from '../../core/categoryVisibility';
import { dayOnMinimap, isSpan, spanEndDate } from '../../core/spans';
import { minimapColor } from './circle';
import type { CalendarEvent } from '../../core/types';
import type { CategoryConfig, MinimapFilter } from '../../app/settingsStore';

export interface TimelineDot {
  eventId: string;
  date: string;
  title: string;
  /** Stack level for near-overlapping dots; 0 sits on the baseline, higher
   *  levels are drawn progressively above it so none is hidden. */
  level: number;
  color?: string;
}

export interface TimelineBand {
  eventId: string;
  title: string;
  /** Span start clamped to the visible [start, end] range. */
  start: string;
  /** Span end clamped to the visible [start, end] range. */
  end: string;
  color?: string;
}

/** Dots whose dates are within this many days of the previous one stack upward. */
const NEAR_DAYS = 2;

/**
 * Single-day (and recurring) event occurrences falling within [start, end].
 * Spans come from {@link collectTimelineBands} instead. Mirrors `computeYearDots`,
 * but positions are left to the component (by date) rather than baked into angles.
 */
export function collectTimelineDots(
  events: CalendarEvent[],
  start: string,
  end: string,
  filter: MinimapFilter = 'onetime',
  categories: Record<string, CategoryConfig> = {},
): TimelineDot[] {
  if (filter === 'none' || end < start) return [];
  const dots: TimelineDot[] = [];
  for (const event of events) {
    if (event.showOnMinimap === false) continue;
    if (hiddenFromMinimapByCategory(event, categories)) continue;
    if (isSpan(event)) continue;
    if (filter === 'onetime' && event.recurrence) continue;
    if (filter === 'recurring' && !event.recurrence) continue;
    for (const date of expandOccurrences(event, start, end)) {
      dots.push({ eventId: event.id, date, title: event.title, level: 0, color: minimapColor(event, categories) });
    }
  }
  dots.sort((a, b) => a.date.localeCompare(b.date));

  let prevDay: string | null = null;
  let level = 0;
  for (const dot of dots) {
    level = prevDay !== null && daysApart(prevDay, dot.date) <= NEAR_DAYS ? level + 1 : 0;
    prevDay = dot.date;
    dot.level = level;
  }
  return dots;
}

function daysApart(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}

/**
 * Multi-day spans as bars within [start, end]. A span is clamped to the range,
 * and days toggled off the minimap split it into sub-bands — mirroring
 * `computeYearBands`. Spans are non-recurring, so they show under 'all' and
 * 'onetime' only.
 */
export function collectTimelineBands(
  events: CalendarEvent[],
  start: string,
  end: string,
  filter: MinimapFilter = 'onetime',
  categories: Record<string, CategoryConfig> = {},
): TimelineBand[] {
  if (filter === 'none' || filter === 'recurring' || end < start) return [];
  const bands: TimelineBand[] = [];
  const push = (event: CalendarEvent, s: string, e: string) =>
    bands.push({ eventId: event.id, title: event.title, start: s, end: e, color: minimapColor(event, categories) });

  for (const event of events) {
    if (!isSpan(event)) continue;
    if (hiddenFromMinimapByCategory(event, categories)) continue;
    const lo = event.date > start ? event.date : start;
    const hi = spanEndDate(event) < end ? spanEndDate(event) : end;
    if (hi < lo) continue; // no overlap with the visible range

    let runStart: string | null = null;
    let prev: string | null = null;
    for (let d = lo; d <= hi; d = addDays(d, 1)) {
      if (dayOnMinimap(event, d)) {
        if (runStart === null) runStart = d;
        prev = d;
      } else if (runStart !== null) {
        push(event, runStart, prev!);
        runStart = null;
      }
    }
    if (runStart !== null) push(event, runStart, prev!);
  }
  return bands;
}
