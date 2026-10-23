import type { EventReminder } from '../../core/types';

export type ReminderUnit = EventReminder['unit'];

/** Quick-add presets offered by the reminders "+ Add" menu (event editor and
 *  category editor share the same list). */
export const REMINDER_PRESETS: { value: number; unit: ReminderUnit; label: string }[] = [
  { value: 0, unit: 'minutes', label: 'At time of event' },
  { value: 5, unit: 'minutes', label: '5 minutes before' },
  { value: 15, unit: 'minutes', label: '15 minutes before' },
  { value: 30, unit: 'minutes', label: '30 minutes before' },
  { value: 1, unit: 'hours', label: '1 hour before' },
  { value: 2, unit: 'hours', label: '2 hours before' },
  { value: 1, unit: 'days', label: '1 day before' },
  { value: 2, unit: 'days', label: '2 days before' },
];

export const PRESET_KEYS = new Set(REMINDER_PRESETS.map((p) => `${p.value}-${p.unit}`));

/** Human label for a reminder pill — full words, matching the add-menu. */
export function reminderLabel(value: number, unit: ReminderUnit): string {
  if (value === 0) return 'At time of event';
  const noun = unit === 'minutes' ? 'minute' : unit === 'hours' ? 'hour' : 'day';
  return `${value} ${noun}${value === 1 ? '' : 's'} before`;
}
