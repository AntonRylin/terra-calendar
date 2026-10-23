import type { CalendarEvent, EventReminder } from '../core/types';
import { expandOccurrences } from '../core/occurrences';
import { addDays } from '../core/dates';
import { wallClockToInstant, instantToWallClock } from '../core/timezone';

/** A reminder that is due to fire, with its dedup key and notification copy. */
export interface DueReminder {
  /** Stable id: one notification per (event, occurrence, reminder). */
  id: string;
  title: string;
  body: string;
}

const UNIT_MS: Record<EventReminder['unit'], number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

/** Don't fire reminders whose trigger time is more than this far in the past,
 *  so reopening the app doesn't spam alerts for long-missed events. */
export const CATCH_UP_MS = 15 * 60 * 1000;

/**
 * Pure scheduler core: given the current events and instant, return the
 * reminders that should fire now. Extracted from the React hook so the timing
 * rules (per-unit offsets, all-day handling, the catch-up window, dedup) are
 * unit-testable without timers, the notification plugin, or a DOM.
 */
export function computeDueReminders(
  events: CalendarEvent[],
  now: Date,
  fired: ReadonlySet<string>,
  sysTz: string,
  opts: { skipIds?: ReadonlySet<string> } = {},
): DueReminder[] {
  const skipIds = opts.skipIds ?? new Set<string>();
  const today = instantToWallClock(now, sysTz).date;
  const rangeStart = addDays(today, -2);
  const rangeEnd = addDays(today, 7);
  const nowMs = now.getTime();

  const due: DueReminder[] = [];

  for (const ev of events) {
    if (skipIds.has(ev.id)) continue;
    if (!ev.reminders || ev.reminders.length === 0) continue;

    for (const date of expandOccurrences(ev, rangeStart, rangeEnd)) {
      const tz = ev.time ? ev.tz || sysTz : sysTz;
      const startMs = wallClockToInstant(date, ev.time || '00:00', tz).getTime();

      for (const r of ev.reminders) {
        const id = `${ev.id}-${date}-${r.value}-${r.unit}`;
        if (fired.has(id)) continue;

        const triggerMs = startMs - r.value * UNIT_MS[r.unit];
        if (nowMs < triggerMs || nowMs - triggerMs > CATCH_UP_MS) continue;

        const lead =
          r.value === 0 ? 'Event is starting now!' : `Event starts in ${r.value} ${r.unit}.`;
        const body = ev.time ? `${lead} (${ev.time})` : lead;
        due.push({ id, title: ev.title || 'Event Reminder', body });
      }
    }
  }

  return due;
}
