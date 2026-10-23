import { compareByTime, timeSortKey } from './ordering';

describe('timeSortKey', () => {
  it('returns the time string when present', () => {
    expect(timeSortKey('09:00')).toBe('09:00');
  });
  it('returns "" for all-day events (no time)', () => {
    expect(timeSortKey(undefined)).toBe('');
  });
  it('sorts before any timed value, so all-day comes first', () => {
    expect(timeSortKey(undefined) < timeSortKey('00:00')).toBe(true);
  });
});

describe('compareByTime', () => {
  it('orders all-day before timed', () => {
    expect(compareByTime({}, { time: '08:00' })).toBeLessThan(0);
    expect(compareByTime({ time: '08:00' }, {})).toBeGreaterThan(0);
  });
  it('orders timed events chronologically', () => {
    expect(compareByTime({ time: '08:00' }, { time: '18:00' })).toBeLessThan(0);
    expect(compareByTime({ time: '18:00' }, { time: '08:00' })).toBeGreaterThan(0);
  });
  it('treats equal times as equal', () => {
    expect(compareByTime({ time: '08:00' }, { time: '08:00' })).toBe(0);
    expect(compareByTime({}, {})).toBe(0);
  });
  it('sorts a list all-day first then by time', () => {
    const events = [
      { time: '18:00' },
      { time: undefined },
      { time: '08:00' },
    ];
    expect([...events].sort(compareByTime)).toEqual([
      { time: undefined },
      { time: '08:00' },
      { time: '18:00' },
    ]);
  });
});
