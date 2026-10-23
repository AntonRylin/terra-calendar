import { addDays } from '../../core/dates';
import { expandOccurrences } from '../../core/occurrences';
import { compareByTime } from '../../core/ordering';
import { displayOccurrence } from '../../core/timezone';
import type { CalendarEvent } from '../../core/types';

/** An event placed on a day, with the time already expressed in display tz. */
export interface DayEvent {
  event: CalendarEvent;
  time?: string;
}

/**
 * date (in display tz) -> events occurring that day, sorted all-day first then
 * by time. Each occurrence is converted from the event's own timezone to
 * `displayTz`, which can move it to an adjacent day — so the range is widened
 * by a day on each side before filtering back to [rangeStart, rangeEnd].
 */
export function groupOccurrences(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
  displayTz: string,
): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  const wideStart = addDays(rangeStart, -1);
  const wideEnd = addDays(rangeEnd, 1);
  for (const event of events) {
    for (const original of expandOccurrences(event, wideStart, wideEnd)) {
      const occ = displayOccurrence(event, original, displayTz);
      if (occ.date < rangeStart || occ.date > rangeEnd) continue;
      const list = map.get(occ.date) ?? [];
      list.push({ event, time: occ.time });
      map.set(occ.date, list);
    }
  }
  for (const list of map.values()) {
    list.sort(compareByTime);
  }
  return map;
}
