import { addDays, dayDiff } from '../../core/dates';
import { expandOccurrences } from '../../core/occurrences';
import { timeSortKey } from '../../core/ordering';
import { hiddenFromUpcomingByCategory } from '../../core/categoryVisibility';
import { isSpan, spanEndDate, spanStatus } from '../../core/spans';
import { displayOccurrence } from '../../core/timezone';
import type { CalendarEvent } from '../../core/types';
import { isTaskEvent } from '../../core/tasks';
import type { CategoryConfig } from '../../app/settingsStore';

export interface UpcomingItem {
  event: CalendarEvent;
  /** Occurrence date shown in the list, in the display timezone. */
  date: string;
  /** Occurrence time in the display timezone (absent = all-day). */
  time?: string;
}

export interface OngoingItem {
  event: CalendarEvent;
  /** Span start date. */
  start: string;
  /** Span end date (inclusive). */
  end: string;
}

/**
 * Multi-day spans currently in progress (start <= today <= end). Sorted by end
 * date, soonest-ending first. These are shown in a dedicated "Ongoing" section
 * and are deliberately excluded from `buildUpcoming`.
 */
export function buildOngoing(
  events: CalendarEvent[],
  today: string,
  categories: Record<string, CategoryConfig> = {},
): OngoingItem[] {
  return events
    .filter((e) => e.showInUpcoming !== false && !hiddenFromUpcomingByCategory(e, categories))
    .filter((e) => isSpan(e) && spanStatus(e, today) === 'ongoing')
    .map((e) => ({ event: e, start: e.date, end: spanEndDate(e) }))
    .sort((a, b) => a.end.localeCompare(b.end));
}

/** Hover hint for an ongoing card: how long the span has been running and how
 *  much of it is left, relative to `today`. Both ends are inclusive, so a span
 *  starting or ending today reads as "today" rather than "0 days". */
export function describeOngoingSpan(start: string, end: string, today: string): string {
  const elapsed = dayDiff(start, today);
  const remaining = dayDiff(today, end);
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const startedPart = elapsed <= 0 ? 'started today' : `started ${days(elapsed)} ago`;
  const endsPart = remaining <= 0 ? 'ends today' : `ends in ${days(remaining)}`;
  return `Multi-day event ${startedPart} and ${endsPart}`;
}

/** Dateless tasks, most-recently-edited first (there is no date to sort on).
 *  Shown in the Upcoming panel's dedicated "Tasks" section. */
export function buildTasks(
  events: CalendarEvent[],
  categories: Record<string, CategoryConfig> = {},
): CalendarEvent[] {
  return events
    .filter((e) => e.showInUpcoming !== false && !hiddenFromUpcomingByCategory(e, categories))
    .filter((e) => isTaskEvent(e))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * One-time events: every future occurrence. Recurring events: only the next
 * one (so a weekly event doesn't flood the stack). Occurrences are converted
 * to `displayTz`; sorted soonest-first, all-day before timed within a day.
 * `today` must already be the display-tz "today".
 */
export function buildUpcoming(
  events: CalendarEvent[],
  today: string,
  displayTz: string,
  horizonDays = 365,
  categories: Record<string, CategoryConfig> = {},
): UpcomingItem[] {
  const end = addDays(today, horizonDays);
  // Widen by a day so timezone conversion near midnight can't drop an edge
  // occurrence before it's converted into range.
  const wideStart = addDays(today, -1);
  const wideEnd = addDays(end, 1);

  const items: UpcomingItem[] = [];
  for (const event of events) {
    if (event.showInUpcoming === false) continue;
    if (hiddenFromUpcomingByCategory(event, categories)) continue;
    // Spans appear once, at their start, and only while still upcoming.
    // Ongoing spans move to the Ongoing section; past spans drop off.
    if (isSpan(event)) {
      if (spanStatus(event, today) === 'upcoming' && event.date <= end) {
        items.push({ event, date: event.date });
      }
      continue;
    }
    const occurrences = expandOccurrences(event, wideStart, wideEnd)
      .map((original) => displayOccurrence(event, original, displayTz))
      .filter((o) => o.date >= today && o.date <= end)
      .sort((a, b) => `${a.date}T${timeSortKey(a.time)}`.localeCompare(`${b.date}T${timeSortKey(b.time)}`));

    if (occurrences.length === 0) continue;
    if (event.recurrence) {
      items.push({ event, date: occurrences[0].date, time: occurrences[0].time });
    } else {
      for (const o of occurrences) items.push({ event, date: o.date, time: o.time });
    }
  }

  const sortKey = (i: UpcomingItem) => `${i.date}T${timeSortKey(i.time)}`;
  return items.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export type UpcomingOrder = 'date-asc' | 'date-desc' | 'alpha';
export type RepeatFilter = 'all' | 'repeating' | 'one-time';
export type TimingFilter = 'all' | 'timed' | 'all-day';
/** Events vs tasks. A task is its own type — not an all-day event. */
export type TypeFilter = 'all' | 'events' | 'tasks';

export interface UpcomingView {
  query: string;
  order: UpcomingOrder;
  repeat: RepeatFilter;
  timing: TimingFilter;
  /** Show events, tasks, or both. */
  type: TypeFilter;
  /** Selected category filters; empty = all. The token 'none' matches uncategorized. */
  categories: string[];
}

export const DEFAULT_UPCOMING_VIEW: UpcomingView = {
  query: '',
  order: 'date-asc',
  repeat: 'all',
  timing: 'all',
  type: 'all',
  categories: [],
};

/** True when `event` passes the (possibly multi-select) category filter. Empty
 *  selection means "all"; otherwise the event must match at least one chosen
 *  category ('none' matches an uncategorized event). */
function matchesCategories(eventType: string | undefined, categories: string[]): boolean {
  if (categories.length === 0) return true;
  return categories.some((c) => (c === 'none' ? !eventType : eventType === c));
}

/** Apply search, filters, and ordering to a soonest-first upcoming list. */
export function viewUpcoming(items: UpcomingItem[], view: UpcomingView): UpcomingItem[] {
  if (view.type === 'tasks') return [];
  const q = view.query.trim().toLowerCase();
  const filtered = items.filter(({ event, time }) => {
    if (q && !`${event.title} ${event.description ?? ''}`.toLowerCase().includes(q)) return false;
    if (view.repeat === 'repeating' && !event.recurrence) return false;
    if (view.repeat === 'one-time' && event.recurrence) return false;
    if (view.timing === 'timed' && !time) return false;
    if (view.timing === 'all-day' && time) return false;
    if (!matchesCategories(event.type, view.categories)) return false;
    return true;
  });

  const dateKey = (i: UpcomingItem) => `${i.date}T${timeSortKey(i.time)}`;
  if (view.order === 'alpha') {
    return [...filtered].sort((a, b) => a.event.title.localeCompare(b.event.title));
  }
  if (view.order === 'date-desc') {
    return [...filtered].sort((a, b) => dateKey(b).localeCompare(dateKey(a)));
  }
  return filtered; // date-asc — already soonest-first
}

/** Apply search and category filtering to ongoing events. */
export function viewOngoing(items: OngoingItem[], view: UpcomingView): OngoingItem[] {
  if (view.type === 'tasks') return [];
  const q = view.query.trim().toLowerCase();
  return items.filter(({ event }) => {
    if (q && !`${event.title} ${event.description ?? ''}`.toLowerCase().includes(q)) return false;
    if (!matchesCategories(event.type, view.categories)) return false;
    return true;
  });
}

/** Apply the view's filters to tasks. The Type filter is the dedicated tasks-vs-
 *  events control. The Repeat/Timing filters slice events only — narrowing either
 *  hides tasks (a task is neither timed nor an all-day event), unless the user
 *  explicitly filtered to Tasks. Input order (most-recently-edited first) is kept. */
export function viewTasks(tasks: CalendarEvent[], view: UpcomingView): CalendarEvent[] {
  if (view.type === 'events') return [];
  if (view.type !== 'tasks' && (view.repeat !== 'all' || view.timing !== 'all')) return [];
  const q = view.query.trim().toLowerCase();
  return tasks.filter((event) => {
    if (q && !`${event.title} ${event.description ?? ''}`.toLowerCase().includes(q)) return false;
    if (!matchesCategories(event.type, view.categories)) return false;
    return true;
  });
}

export const DENSITY_MIN = 0.7;
export const DENSITY_MAX = 1.3;
export const DENSITY_STEP = 0.05;

export function clampDensity(v: number): number {
  if (Number.isNaN(v)) return 1.0;
  const clamped = Math.max(DENSITY_MIN, Math.min(DENSITY_MAX, v));
  const rounded = Math.round(clamped / DENSITY_STEP) * DENSITY_STEP;
  return parseFloat(rounded.toFixed(2));
}

