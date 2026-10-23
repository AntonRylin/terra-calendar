import type { CalendarEvent } from '../core/types';
import type { CategoryConfig } from './settingsStore';

/**
 * A CSS `background` value that stands for an event in phone lists (the day
 * sheet's colour bar, the drawer's dots): the event's own colour, else its
 * category's colour or gradient, else the accent.
 */
export function eventSwatch(
  event: Pick<CalendarEvent, 'color' | 'type'>,
  categories: Record<string, CategoryConfig>,
): string {
  if (event.color) return event.color;
  const config = event.type ? categories[event.type] : undefined;
  if (config?.value) return config.value;
  return 'var(--color-accent)';
}
