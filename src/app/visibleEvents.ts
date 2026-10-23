import { useMemo } from 'react';
import type { CalendarEvent } from '../core/types';
import { useCalendarStore } from './store';
import { useSharedEventsStore } from './sharedEventsStore';

/**
 * Everything the calendar should draw: the user's own events plus the ones other
 * people share with them.
 *
 * The merge happens HERE, at the render layer, and nowhere else. The two sets
 * stay separate in their stores because only the user's own events may reach
 * the sync engine — a shared event that got into `UnifiedRepository` would be
 * written to the local file and pushed into the user's iCloud/Google accounts,
 * and delete-wins would let a viewer delete the owner's copy for everyone.
 *
 * Views that mutate events (the editors, the selection bar) should read
 * `useCalendarStore` directly instead, so they can only ever act on the user's
 * own set.
 */
/** One event by id, from the user's own set or from a share they receive. */
export function useVisibleEvent(id: string | undefined): CalendarEvent | undefined {
  const own = useCalendarStore((s) => (id ? s.events.find((e) => e.id === id) : undefined));
  const shared = useSharedEventsStore((s) =>
    id ? s.events.find((e) => e.id === id) : undefined,
  );
  return own ?? shared;
}

export function useVisibleEvents(): CalendarEvent[] {
  const own = useCalendarStore((s) => s.events);
  const shared = useSharedEventsStore((s) => s.events);
  return useMemo(() => {
    if (shared.length === 0) return own;
    // An id present in both is the user's own copy — keep theirs, not the
    // shared projection (which may be redacted to "Busy").
    const ownIds = new Set(own.map((e) => e.id));
    return [...own, ...shared.filter((e) => !ownIds.has(e.id))];
  }, [own, shared]);
}
