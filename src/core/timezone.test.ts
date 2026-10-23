import type { CalendarEvent } from './types';
import {
  convertWallClock,
  displayOccurrence,
  instantToWallClock,
  tzOffsetMinutes,
  wallClockToInstant,
} from './timezone';

describe('tzOffsetMinutes', () => {
  it('is zero for UTC', () => {
    expect(tzOffsetMinutes('UTC', new Date('2026-06-15T12:00:00Z'))).toBe(0);
  });
  it('reflects DST (New York is UTC-4 in June)', () => {
    expect(tzOffsetMinutes('America/New_York', new Date('2026-06-15T12:00:00Z'))).toBe(-240);
  });
  it('reflects standard time (New York is UTC-5 in January)', () => {
    expect(tzOffsetMinutes('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
  });
});

describe('wallClockToInstant / instantToWallClock round-trip', () => {
  it('round-trips through UTC', () => {
    const inst = wallClockToInstant('2026-06-15', '14:00', 'Europe/Berlin');
    // Berlin is UTC+2 in June -> 12:00 UTC
    expect(inst.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    expect(instantToWallClock(inst, 'Europe/Berlin')).toEqual({ date: '2026-06-15', time: '14:00' });
  });
});

describe('convertWallClock', () => {
  it('returns the input unchanged for the same zone', () => {
    expect(convertWallClock('2026-06-15', '14:00', 'UTC', 'UTC')).toEqual({
      date: '2026-06-15',
      time: '14:00',
    });
  });

  it('converts within the same day (NY 14:00 -> Berlin 20:00)', () => {
    expect(convertWallClock('2026-06-15', '14:00', 'America/New_York', 'Europe/Berlin')).toEqual({
      date: '2026-06-15',
      time: '20:00',
    });
  });

  it('crosses midnight forward (NY 23:00 -> Tokyo next day 12:00)', () => {
    expect(convertWallClock('2026-06-15', '23:00', 'America/New_York', 'Asia/Tokyo')).toEqual({
      date: '2026-06-16',
      time: '12:00',
    });
  });

  it('crosses midnight backward (Tokyo 01:00 -> NY previous day 12:00)', () => {
    expect(convertWallClock('2026-06-15', '01:00', 'Asia/Tokyo', 'America/New_York')).toEqual({
      date: '2026-06-14',
      time: '12:00',
    });
  });
});

const base = {
  id: 'x',
  title: 'T',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  recurrence: null,
};

describe('displayOccurrence', () => {
  it('does not convert all-day events', () => {
    const e: CalendarEvent = { ...base, date: '2026-06-15', tz: 'America/New_York' };
    expect(displayOccurrence(e, '2026-06-15', 'Asia/Tokyo')).toEqual({ date: '2026-06-15', time: undefined });
  });

  it('does not convert events with no recorded timezone', () => {
    const e: CalendarEvent = { ...base, date: '2026-06-15', time: '14:00' };
    expect(displayOccurrence(e, '2026-06-15', 'Asia/Tokyo')).toEqual({ date: '2026-06-15', time: '14:00' });
  });

  it('converts a timed event to the display timezone', () => {
    const e: CalendarEvent = { ...base, date: '2026-06-15', time: '23:00', tz: 'America/New_York' };
    expect(displayOccurrence(e, '2026-06-15', 'Asia/Tokyo')).toEqual({ date: '2026-06-16', time: '12:00' });
  });
});
