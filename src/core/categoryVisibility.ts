import type { CalendarEvent } from './types';
import type { CategoryConfig } from '../app/settingsStore';

/**
 * Category-level visibility: a category can hide all of its events from the
 * minimap and/or the Upcoming panel (set in the category editor). These checks
 * complement the per-event `showOnMinimap` / `showInUpcoming` toggles — when a
 * category is hidden, the per-event flag cannot bring an event back.
 */

/** True when the event's category hides its events from the minimap. */
export function hiddenFromMinimapByCategory(
  event: Pick<CalendarEvent, 'type'>,
  categories: Record<string, CategoryConfig>,
): boolean {
  return Boolean(event.type && categories[event.type]?.hideFromMinimap);
}

/** True when the event's category hides its events from the Upcoming panel. */
export function hiddenFromUpcomingByCategory(
  event: Pick<CalendarEvent, 'type'>,
  categories: Record<string, CategoryConfig>,
): boolean {
  return Boolean(event.type && categories[event.type]?.hideFromUpcoming);
}
