import type { CalendarEvent } from './types';
import { dayOnMinimap, dayTime, dayTitle, isSpan, spanEndDate, spanStatus } from './spans';

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'test-id',
    title: 'Test',
    date: '2026-06-12',
    recurrence: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isSpan', () => {
  it('is false for a single-day event with no endDate', () => {
    expect(isSpan(makeEvent({ date: '2026-06-12' }))).toBe(false);
  });
  it('is false when endDate equals date', () => {
    expect(isSpan(makeEvent({ date: '2026-06-12', endDate: '2026-06-12' }))).toBe(false);
  });
  it('is false when endDate is before date (treated as single day)', () => {
    expect(isSpan(makeEvent({ date: '2026-06-12', endDate: '2026-06-10' }))).toBe(false);
  });
  it('is true when endDate is after date', () => {
    expect(isSpan(makeEvent({ date: '2026-06-12', endDate: '2026-06-20' }))).toBe(true);
  });
});

describe('spanEndDate', () => {
  it('returns the date itself for a single-day event', () => {
    expect(spanEndDate(makeEvent({ date: '2026-06-12' }))).toBe('2026-06-12');
  });
  it('returns endDate when it is after date', () => {
    expect(spanEndDate(makeEvent({ date: '2026-06-12', endDate: '2026-06-20' }))).toBe('2026-06-20');
  });
  it('clamps a backwards endDate to date', () => {
    expect(spanEndDate(makeEvent({ date: '2026-06-12', endDate: '2026-06-01' }))).toBe('2026-06-12');
  });
});

describe('spanStatus', () => {
  const span = makeEvent({ date: '2026-06-10', endDate: '2026-06-20' });
  it('is "upcoming" before the start day', () => {
    expect(spanStatus(span, '2026-06-09')).toBe('upcoming');
  });
  it('is "ongoing" on the start day', () => {
    expect(spanStatus(span, '2026-06-10')).toBe('ongoing');
  });
  it('is "ongoing" in the middle', () => {
    expect(spanStatus(span, '2026-06-15')).toBe('ongoing');
  });
  it('is "ongoing" on the end day', () => {
    expect(spanStatus(span, '2026-06-20')).toBe('ongoing');
  });
  it('is "past" after the end day', () => {
    expect(spanStatus(span, '2026-06-21')).toBe('past');
  });
});

describe('per-day overrides', () => {
  const span = makeEvent({
    title: 'Trip',
    date: '2026-06-10',
    endDate: '2026-06-20',
    showOnMinimap: true,
    dayOverrides: {
      '2026-06-12': { title: 'Travel day', time: '14:30' },
      '2026-06-15': { showOnMinimap: false },
    },
  });

  it('dayTitle falls back to the span title when no override', () => {
    expect(dayTitle(span, '2026-06-11')).toBe('Trip');
  });
  it('dayTitle uses the per-day title when overridden', () => {
    expect(dayTitle(span, '2026-06-12')).toBe('Travel day');
  });
  it('dayTime is undefined for an all-day day', () => {
    expect(dayTime(span, '2026-06-11')).toBeUndefined();
  });
  it('dayTime returns the per-day time when set', () => {
    expect(dayTime(span, '2026-06-12')).toBe('14:30');
  });
  it('dayOnMinimap follows the span default when no override', () => {
    expect(dayOnMinimap(span, '2026-06-11')).toBe(true);
  });
  it('dayOnMinimap honours a per-day off override', () => {
    expect(dayOnMinimap(span, '2026-06-15')).toBe(false);
  });
  it('dayOnMinimap is false for every day when the whole span is off the map', () => {
    const off = makeEvent({ date: '2026-06-10', endDate: '2026-06-20', showOnMinimap: false });
    expect(dayOnMinimap(off, '2026-06-11')).toBe(false);
  });
  it('a per-day on override beats a whole-span off', () => {
    const mixed = makeEvent({
      date: '2026-06-10',
      endDate: '2026-06-20',
      showOnMinimap: false,
      dayOverrides: { '2026-06-12': { showOnMinimap: true } },
    });
    expect(dayOnMinimap(mixed, '2026-06-12')).toBe(true);
    expect(dayOnMinimap(mixed, '2026-06-11')).toBe(false);
  });
});
