import type { CalendarEvent } from '../core/types';
import { isForeignEvent, isReadOnlyEvent, sharedCalendarName } from '../core/sharedCalendars';
import { useConnectionStore } from './connectionStore';

/** Who an event belongs to, resolved against the connected accounts. */
export interface EventOwnership {
  /** Lives only on a calendar someone else shared with the user. */
  foreign: boolean;
  /** That calendar grants no write access — edits and deletes would 403. */
  readOnly: boolean;
  /** Name of the shared calendar it lives on, for labels and confirmations. */
  calendarName?: string;
}

const OWN: EventOwnership = { foreign: false, readOnly: false };

/**
 * Derived rather than stored on the event: ownership follows the *calendar*, so
 * re-reading it from the connection store is always current. A stored flag would
 * go stale the moment a share's permissions changed or the account was
 * reconnected, and stale ownership is what lets an app write to a calendar it
 * should not touch.
 */
export function eventOwnership(event: CalendarEvent): EventOwnership {
  // Received through a cloud share: the event says so itself, because it never
  // came from a calendar this user has connected.
  if (event.sharedBy) {
    return {
      foreign: true,
      readOnly: event.shareAccess !== 'edit',
      calendarName: `${event.sharedBy}’s calendar`,
    };
  }
  const conn = useConnectionStore.getState();
  const shared = conn.sharedCalendarUrls();
  if (shared.size === 0) return OWN; // nothing shared with this user — fast path
  const foreign = isForeignEvent(event, shared);
  if (!foreign) return OWN;
  const names = conn.calendarNames();
  const sharedNames = new Map([...names].filter(([url]) => shared.has(url)));
  return {
    foreign: true,
    readOnly: isReadOnlyEvent(event, conn.readOnlyCalendarUrls()),
    calendarName: sharedCalendarName(event, sharedNames),
  };
}
