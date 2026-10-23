import type { CalendarEvent } from './types';

/** A task never goes to CalDAV. Older records used an empty date before the
 *  explicit isTask flag existed; keep recognizing those at every sync boundary. */
export function isTaskEvent(event: Pick<CalendarEvent, 'isTask'> & Partial<Pick<CalendarEvent, 'date'>>): boolean {
  return event.isTask === true || event.date === '';
}
