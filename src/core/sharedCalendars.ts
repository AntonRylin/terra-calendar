import type { CalendarEvent } from './types';

/**
 * An event whose every home is a calendar someone else shared with the user
 * (a family member's iCloud/Google calendar). It belongs to that owner: it is
 * shown and — where the share grants write access — edited in place, but it is
 * never copied into the user's own calendars, their other connected accounts,
 * or their cloud rows.
 *
 * `every` rather than `some` on purpose: an event that also lives on one of the
 * user's own calendars is genuinely theirs, and dropping it would delete their
 * copy.
 */
export function isForeignEvent(event: CalendarEvent, foreignCalendars: Set<string>): boolean {
  const urls = event.calendarUrls ?? [];
  return urls.length > 0 && urls.every((u) => foreignCalendars.has(u));
}

/** The event lives only on calendars that refuse writes — editing or deleting it
 *  would 403 against the owner's server, so the UI blocks it up front. */
export function isReadOnlyEvent(event: CalendarEvent, readOnlyCalendars: Set<string>): boolean {
  const urls = event.calendarUrls ?? [];
  return urls.length > 0 && urls.every((u) => readOnlyCalendars.has(u));
}

/** Display name of the shared calendar an event lives on, for UI labels. */
export function sharedCalendarName(
  event: CalendarEvent,
  names: Map<string, string>,
): string | undefined {
  for (const u of event.calendarUrls ?? []) {
    const name = names.get(u);
    if (name) return name;
  }
  return undefined;
}
