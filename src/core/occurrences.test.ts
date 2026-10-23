import type { CalendarEvent } from './types';
import { expandOccurrences, nextOccurrence } from './occurrences';

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

describe('expandOccurrences — one-time events', () => {
  it('returns the date when inside the range (inclusive bounds)', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(expandOccurrences(e, '2026-06-12', '2026-06-12')).toEqual(['2026-06-12']);
  });
  it('returns [] when outside the range', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(expandOccurrences(e, '2026-07-01', '2026-07-31')).toEqual([]);
  });
});

describe('expandOccurrences — weekly', () => {
  it('expands every week', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29',
    ]);
  });
  it('expands every 2 weeks', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 2 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-01', '2026-06-15', '2026-06-29',
    ]);
  });
  it('never yields occurrences before the anchor date', () => {
    const e = makeEvent({ date: '2026-06-15', recurrence: { unit: 'week', interval: 1 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-16')).toEqual(['2026-06-15']);
  });
});

describe('expandOccurrences — monthly', () => {
  it('expands every month on the anchor day', () => {
    const e = makeEvent({ date: '2026-01-15', recurrence: { unit: 'month', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15',
    ]);
  });
  it('clamps day 31 to the last day of shorter months', () => {
    const e = makeEvent({ date: '2026-01-31', recurrence: { unit: 'month', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });
  it('handles every 3 months across a year boundary', () => {
    const e = makeEvent({ date: '2026-11-10', recurrence: { unit: 'month', interval: 3 } });
    expect(expandOccurrences(e, '2026-11-01', '2027-05-31')).toEqual([
      '2026-11-10', '2027-02-10', '2027-05-10',
    ]);
  });
});

describe('expandOccurrences — yearly', () => {
  it('expands every year', () => {
    const e = makeEvent({ date: '2026-03-05', recurrence: { unit: 'year', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2028-12-31')).toEqual([
      '2026-03-05', '2027-03-05', '2028-03-05',
    ]);
  });
  it('clamps Feb 29 anchors to Feb 28 in non-leap years', () => {
    const e = makeEvent({ date: '2028-02-29', recurrence: { unit: 'year', interval: 1 } });
    expect(expandOccurrences(e, '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28',
    ]);
  });
  it('handles every 2 years', () => {
    const e = makeEvent({ date: '2026-07-01', recurrence: { unit: 'year', interval: 2 } });
    expect(expandOccurrences(e, '2026-01-01', '2031-12-31')).toEqual([
      '2026-07-01', '2028-07-01', '2030-07-01',
    ]);
  });
});

describe('expandOccurrences — multi-day spans', () => {
  it('returns every day of the span when fully inside the range', () => {
    const e = makeEvent({ date: '2026-06-10', endDate: '2026-06-13' });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13',
    ]);
  });
  it('clips the span to the range bounds', () => {
    const e = makeEvent({ date: '2026-06-10', endDate: '2026-06-20' });
    expect(expandOccurrences(e, '2026-06-12', '2026-06-14')).toEqual([
      '2026-06-12', '2026-06-13', '2026-06-14',
    ]);
  });
  it('still returns a single day for endDate <= date', () => {
    const e = makeEvent({ date: '2026-06-12', endDate: '2026-06-12' });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual(['2026-06-12']);
  });
  it('omits exdates within the span', () => {
    const e = makeEvent({ date: '2026-06-10', endDate: '2026-06-13', exdates: ['2026-06-12'] });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-10', '2026-06-11', '2026-06-13',
    ]);
  });
});

describe('expandOccurrences — degenerate ranges', () => {
  it('returns [] when rangeEnd < rangeStart', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(expandOccurrences(e, '2026-06-30', '2026-06-01')).toEqual([]);
  });
});

describe('expandOccurrences — range filtering', () => {
  it('drops occurrences before a mid-stream rangeStart', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } });
    expect(expandOccurrences(e, '2026-06-10', '2026-06-30')).toEqual([
      '2026-06-15', '2026-06-22', '2026-06-29',
    ]);
  });
  it('returns [] for a recurring event whose anchor is after rangeEnd', () => {
    const e = makeEvent({ date: '2026-08-01', recurrence: { unit: 'week', interval: 1 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([]);
  });
  it('treats a non-positive interval as 1 and still terminates', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 0 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-15')).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15',
    ]);
  });
});

describe('nextOccurrence — monthly with clamping', () => {
  it('finds the next monthly occurrence landing on a clamped day', () => {
    const e = makeEvent({ date: '2026-01-31', recurrence: { unit: 'month', interval: 1 } });
    expect(nextOccurrence(e, '2026-02-01')).toBe('2026-02-28');
  });
});

describe('daily recurrence', () => {
  it('repeats every three days across a year boundary, anchored at the original date', () => {
    const e = makeEvent({ date: '2025-12-28', recurrence: { unit: 'day', interval: 3 } });
    expect(expandOccurrences(e, '2025-12-29', '2026-01-06')).toEqual([
      '2025-12-31', '2026-01-03', '2026-01-06',
    ]);
  });

  it('includes leap day when repeating every day', () => {
    const e = makeEvent({ date: '2028-02-28', recurrence: { unit: 'day', interval: 1 } });
    expect(expandOccurrences(e, '2028-02-27', '2028-03-01')).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01',
    ]);
  });

  it('skips deleted occurrences in the calendar and upcoming date', () => {
    const e = makeEvent({ date: '2026-03-27', recurrence: { unit: 'day', interval: 2 }, exdates: ['2026-03-29'] });
    expect(expandOccurrences(e, '2026-03-28', '2026-04-02')).toEqual(['2026-03-31', '2026-04-02']);
    expect(nextOccurrence(e, '2026-03-28')).toBe('2026-03-31');
    expect(nextOccurrence(e, '2026-03-31')).toBe('2026-03-31');
  });

  it('preserves the interval when seeking from an old anchor', () => {
    const e = makeEvent({ date: '2000-01-01', recurrence: { unit: 'day', interval: 2 } });
    expect(expandOccurrences(e, '2026-01-01', '2026-01-05')).toEqual(['2026-01-02', '2026-01-04']);
    expect(nextOccurrence(e, '2026-01-01')).toBe('2026-01-02');
  });
});

describe('nextOccurrence', () => {
  it('returns the date itself for a future one-time event', () => {
    const e = makeEvent({ date: '2026-06-20' });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2026-06-20');
  });
  it('returns null for a past one-time event', () => {
    const e = makeEvent({ date: '2026-06-01' });
    expect(nextOccurrence(e, '2026-06-12')).toBeNull();
  });
  it('returns today when today is an occurrence', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2026-06-12');
  });
  it('finds the next weekly occurrence', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 2 } });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2026-06-15');
  });
  it('finds the next yearly occurrence', () => {
    const e = makeEvent({ date: '2026-03-05', recurrence: { unit: 'year', interval: 1 } });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2027-03-05');
  });
});

describe('expansion is independent of how old the anchor is', () => {
  // The loop seeks straight to the range instead of walking every occurrence
  // since the anchor, so an ancient anchor must still yield exactly the same
  // dates as a recent one on the same cadence.
  it('weekly: a 26-year-old anchor matches a recent anchor on the same weekday', () => {
    const recent = makeEvent({ date: '2026-01-05', recurrence: { unit: 'week', interval: 1 } });
    const ancient = makeEvent({ date: '2000-01-03', recurrence: { unit: 'week', interval: 1 } });
    const range = ['2026-06-01', '2026-08-31'] as const;
    const fromRecent = expandOccurrences(recent, ...range);
    expect(fromRecent.length).toBeGreaterThan(10);
    expect(expandOccurrences(ancient, ...range)).toEqual(fromRecent);
  });

  it('weekly with an interval: phase is preserved across the seek', () => {
    // Every 3 weeks from 2020-01-06; the seek must not shift which weeks land.
    const e = makeEvent({ date: '2020-01-06', recurrence: { unit: 'week', interval: 3 } });
    const got = expandOccurrences(e, '2026-06-01', '2026-07-31');
    for (const d of got) {
      const weeks = Math.round(
        (new Date(d).getTime() - new Date('2020-01-06').getTime()) / (7 * 86_400_000),
      );
      expect(weeks % 3).toBe(0);
    }
    expect(got.length).toBeGreaterThan(2);
  });

  it('monthly: end-of-month clamping survives a long seek', () => {
    const e = makeEvent({ date: '2015-01-31', recurrence: { unit: 'month', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('yearly: a leap-day anchor still clamps correctly after seeking', () => {
    const e = makeEvent({ date: '2000-02-29', recurrence: { unit: 'year', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2027-12-31')).toEqual(['2026-02-28', '2027-02-28']);
  });

  it('nextOccurrence: ancient anchor resolves to the same date as a recent one', () => {
    const recent = makeEvent({ date: '2026-01-05', recurrence: { unit: 'week', interval: 1 } });
    const ancient = makeEvent({ date: '2000-01-03', recurrence: { unit: 'week', interval: 1 } });
    expect(nextOccurrence(ancient, '2026-06-10')).toBe(nextOccurrence(recent, '2026-06-10'));
  });
});
