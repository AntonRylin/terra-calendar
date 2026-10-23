import { addDays, dayOfYear, daysInYear } from '../../core/dates';
import { expandOccurrences } from '../../core/occurrences';
import { cosmeticById, resolveCosmetic } from '../../core/cosmetics';
import { hiddenFromMinimapByCategory } from '../../core/categoryVisibility';
import { dayOnMinimap, isSpan, spanEndDate } from '../../core/spans';
import type { CalendarEvent } from '../../core/types';
import type { CategoryConfig, MinimapFilter } from '../../app/settingsStore';

/** The minimap colour for an event: a cosmetic's representative swatch (gradient
 *  skins) or, failing that, the event's own solid colour (effects + plain). */
export function minimapColor(
  event: CalendarEvent,
  categories: Record<string, CategoryConfig>,
): string | undefined {
  return cosmeticById(resolveCosmetic(event, categories))?.swatch || event.color;
}

export interface CircleDot {
  eventId: string;
  date: string;
  title: string;
  /** Radians. 0 = Jan 1 at the top, increasing clockwise. */
  angle: number;
  /** Dots within 3 days of the previous dot step inward so none is hidden. */
  radius: number;
  color?: string;
}

const NEAR_DAYS = 3;
const RADIAL_STEP = 10;
/** Dots never step closer to the center than this fraction of the base radius. */
const MIN_RADIUS_FACTOR = 0.4;

export function computeYearDots(
  events: CalendarEvent[],
  year: number,
  baseRadius: number,
  filter: MinimapFilter = 'onetime',
  categories: Record<string, CategoryConfig> = {},
): CircleDot[] {
  if (filter === 'none') return [];
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const dots: CircleDot[] = [];
  for (const event of events) {
    if (event.showOnMinimap === false) continue;
    if (hiddenFromMinimapByCategory(event, categories)) continue;
    // Spans are drawn as arcs by computeYearBands, not as per-day dots.
    if (isSpan(event)) continue;
    if (filter === 'onetime' && event.recurrence) continue;
    if (filter === 'recurring' && !event.recurrence) continue;
    for (const date of expandOccurrences(event, start, end)) {
      dots.push({ eventId: event.id, date, title: event.title, angle: 0, radius: baseRadius, color: minimapColor(event, categories) });
    }
  }
  dots.sort((a, b) => a.date.localeCompare(b.date));

  const total = daysInYear(year);
  let prevDay = Number.NEGATIVE_INFINITY;
  let level = 0;
  for (const dot of dots) {
    const doy = dayOfYear(dot.date);
    level = doy - prevDay <= NEAR_DAYS ? level + 1 : 0;
    prevDay = doy;
    dot.angle = (2 * Math.PI * (doy - 1)) / total;
    dot.radius = Math.max(baseRadius - level * RADIAL_STEP, baseRadius * MIN_RADIUS_FACTOR);
  }
  return dots;
}

export interface CircleBand {
  eventId: string;
  title: string;
  /** Clamped span start date within this year ("YYYY-MM-DD"). */
  start: string;
  /** Clamped span end date within this year ("YYYY-MM-DD"). */
  end: string;
  /** Radians. 0 = Jan 1 at the top, increasing clockwise. */
  startAngle: number;
  /** Radians, always >= startAngle. */
  endAngle: number;
  color?: string;
}

/**
 * Multi-day spans drawn as arcs along the ring for `year`. A span that runs
 * past either end of the year is clamped to the year's bounds; spans that don't
 * intersect the year are dropped. Days toggled off the minimap (per-day or via
 * the whole-span default) split the arc into sub-bands. Spans are non-recurring,
 * so they show under the 'all' and 'onetime' filters only.
 */
export function computeYearBands(
  events: CalendarEvent[],
  year: number,
  filter: MinimapFilter = 'onetime',
  categories: Record<string, CategoryConfig> = {},
): CircleBand[] {
  if (filter === 'none' || filter === 'recurring') return [];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const total = daysInYear(year);
  const bands: CircleBand[] = [];
  const push = (event: CalendarEvent, start: string, end: string) =>
    bands.push({
      eventId: event.id,
      title: event.title,
      start,
      end,
      startAngle: (2 * Math.PI * (dayOfYear(start) - 1)) / total,
      endAngle: (2 * Math.PI * dayOfYear(end)) / total,
      color: minimapColor(event, categories),
    });

  for (const event of events) {
    if (!isSpan(event)) continue;
    if (hiddenFromMinimapByCategory(event, categories)) continue;
    const lo = event.date > yearStart ? event.date : yearStart;
    const hi = spanEndDate(event) < yearEnd ? spanEndDate(event) : yearEnd;
    if (hi < lo) continue; // no overlap with this year

    // Walk the days, emitting a sub-band for each unbroken run of visible days.
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
