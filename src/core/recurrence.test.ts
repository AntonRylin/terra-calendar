import { describeRecurrence } from './recurrence';

describe('describeRecurrence', () => {
  it('returns "" for one-time events', () => {
    expect(describeRecurrence(null)).toBe('');
  });

  it('uses the singular at interval 1', () => {
    expect(describeRecurrence({ unit: 'day', interval: 1 })).toBe('every day');
    expect(describeRecurrence({ unit: 'week', interval: 1 })).toBe('every week');
    expect(describeRecurrence({ unit: 'year', interval: 1 })).toBe('every year');
  });

  it('uses "every N units" above interval 1', () => {
    expect(describeRecurrence({ unit: 'day', interval: 3 })).toBe('every 3 days');
    expect(describeRecurrence({ unit: 'week', interval: 2 })).toBe('every 2 weeks');
    expect(describeRecurrence({ unit: 'month', interval: 3 })).toBe('every 3 months');
    expect(describeRecurrence({ unit: 'year', interval: 5 })).toBe('every 5 years');
  });
});
