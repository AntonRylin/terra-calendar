import { describe, it, expect } from 'vitest';
import { computeDueReminders } from './reminderLogic';
import type { CalendarEvent } from '../core/types';

function event(partial: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    title: 'Dentist',
    date: '2026-06-12',
    time: '14:30',
    recurrence: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

const TZ = 'UTC';
const NO_FIRED = new Set<string>();

describe('computeDueReminders', () => {
  it('fires a timed reminder once the trigger time is reached', () => {
    // Event at 14:30Z, 30-minute reminder -> triggers at 14:00Z.
    const ev = event({ reminders: [{ value: 30, unit: 'minutes' }] });
    const now = new Date('2026-06-12T14:00:00Z');
    const due = computeDueReminders([ev], now, NO_FIRED, TZ);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('e1-2026-06-12-30-minutes');
    expect(due[0].title).toBe('Dentist');
    expect(due[0].body).toBe('Event starts in 30 minutes. (14:30)');
  });

  it('does not fire before the trigger time', () => {
    const ev = event({ reminders: [{ value: 30, unit: 'minutes' }] });
    const now = new Date('2026-06-12T13:55:00Z'); // 5 min before trigger
    expect(computeDueReminders([ev], now, NO_FIRED, TZ)).toHaveLength(0);
  });

  it('fires exactly at the 15-minute catch-up boundary but not past it', () => {
    const ev = event({ reminders: [{ value: 30, unit: 'minutes' }] }); // trigger 14:00Z
    const atBoundary = new Date('2026-06-12T14:15:00Z'); // 15 min late
    const pastBoundary = new Date('2026-06-12T14:15:01Z'); // 15 min + 1s late
    expect(computeDueReminders([ev], atBoundary, NO_FIRED, TZ)).toHaveLength(1);
    expect(computeDueReminders([ev], pastBoundary, NO_FIRED, TZ)).toHaveLength(0);
  });

  it('uses "starting now" copy for a zero-offset reminder', () => {
    const ev = event({ reminders: [{ value: 0, unit: 'minutes' }] }); // trigger == start 14:30Z
    const now = new Date('2026-06-12T14:30:00Z');
    const due = computeDueReminders([ev], now, NO_FIRED, TZ);
    expect(due[0].body).toBe('Event is starting now! (14:30)');
  });

  it('treats all-day events as starting at midnight local time', () => {
    // No time -> starts 00:00Z; 1-day reminder -> triggers prior midnight.
    const ev = event({ time: undefined, reminders: [{ value: 1, unit: 'days' }] });
    const now = new Date('2026-06-11T00:00:00Z');
    const due = computeDueReminders([ev], now, NO_FIRED, TZ);
    expect(due).toHaveLength(1);
    expect(due[0].body).toBe('Event starts in 1 days.'); // no time suffix
  });

  it('skips reminders already in the fired set', () => {
    const ev = event({ reminders: [{ value: 30, unit: 'minutes' }] });
    const now = new Date('2026-06-12T14:00:00Z');
    const fired = new Set(['e1-2026-06-12-30-minutes']);
    expect(computeDueReminders([ev], now, fired, TZ)).toHaveLength(0);
  });

  it('skips events whose drafts are being edited', () => {
    const ev = event({ reminders: [{ value: 30, unit: 'minutes' }] });
    const now = new Date('2026-06-12T14:00:00Z');
    const due = computeDueReminders([ev], now, NO_FIRED, TZ, { skipIds: new Set(['e1']) });
    expect(due).toHaveLength(0);
  });

  it('ignores events with no reminders', () => {
    const ev = event({ reminders: [] });
    const now = new Date('2026-06-12T14:00:00Z');
    expect(computeDueReminders([ev], now, NO_FIRED, TZ)).toHaveLength(0);
  });

  it('honors hour units', () => {
    const ev = event({ reminders: [{ value: 2, unit: 'hours' }] }); // trigger 12:30Z
    const now = new Date('2026-06-12T12:30:00Z');
    const due = computeDueReminders([ev], now, NO_FIRED, TZ);
    expect(due[0].body).toBe('Event starts in 2 hours. (14:30)');
  });
});
