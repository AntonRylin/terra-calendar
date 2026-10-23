import type { EventReminder } from './types';

/**
 * Union of an event's own reminders and its category's default reminders,
 * deduped by (value, unit). Order: the event's reminders first, then any
 * category defaults it was missing. Returns the original list unchanged when
 * the category adds nothing.
 */
export function mergeCategoryReminders(
  eventReminders: EventReminder[] | undefined,
  categoryReminders: EventReminder[] | undefined,
): EventReminder[] | undefined {
  if (!categoryReminders || categoryReminders.length === 0) return eventReminders;
  const have = new Set((eventReminders ?? []).map((r) => `${r.value}-${r.unit}`));
  const missing = categoryReminders.filter((r) => {
    const key = `${r.value}-${r.unit}`;
    if (have.has(key)) return false;
    have.add(key);
    return true;
  });
  if (missing.length === 0) return eventReminders;
  return [...(eventReminders ?? []), ...missing.map((r) => ({ value: r.value, unit: r.unit }))];
}
