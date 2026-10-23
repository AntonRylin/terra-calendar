import {
  addDays,
  dayOfYear,
  daysInMonth,
  daysInYear,
  formatDMY,
  friendlyDate,
  isLeapYear,
  parseISODate,
  parseLooseDate,
  toISODate,
} from './dates';

describe('toISODate / parseISODate', () => {
  it('round-trips a local date', () => {
    expect(toISODate(new Date(2026, 5, 12))).toBe('2026-06-12');
    const d = parseISODate('2026-06-12');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(12);
  });
});

describe('addDays', () => {
  it('adds within a month', () => expect(addDays('2026-06-12', 3)).toBe('2026-06-15'));
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('daysInMonth', () => {
  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
  });
});

describe('leap years', () => {
  it('handles the 4/100/400 rules', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
  it('daysInYear follows leapness', () => {
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
  });
});

describe('dayOfYear', () => {
  it('counts from 1', () => {
    expect(dayOfYear('2026-01-01')).toBe(1);
    expect(dayOfYear('2026-12-31')).toBe(365);
    expect(dayOfYear('2028-12-31')).toBe(366);
  });
});

describe('parseLooseDate', () => {
  const ref = { year: 2026, month: 8 }; // "August 2026" in view

  it('reads dotted / slashed / dashed / spaced day-first dates', () => {
    expect(parseLooseDate('30.12.2027', ref)).toBe('2027-12-30');
    expect(parseLooseDate('30/12/2027', ref)).toBe('2027-12-30');
    expect(parseLooseDate('30-12-2027', ref)).toBe('2027-12-30');
    expect(parseLooseDate('5 6 27', ref)).toBe('2027-06-05');
  });

  it('reads packed digit runs (DDMMYYYY / DDMMYY / DDMM)', () => {
    expect(parseLooseDate('12052025', ref)).toBe('2025-05-12');
    expect(parseLooseDate('120525', ref)).toBe('2025-05-12');
    expect(parseLooseDate('1205', ref)).toBe('2026-05-12'); // year from ref
  });

  it('expands two-digit years into the 2000s', () => {
    expect(parseLooseDate('01.01.30', ref)).toBe('2030-01-01');
  });

  it('fills missing fields from the in-view month/year', () => {
    expect(parseLooseDate('15', ref)).toBe('2026-08-15');
    expect(parseLooseDate('9', ref)).toBe('2026-08-09');
    expect(parseLooseDate('15.11', ref)).toBe('2026-11-15');
  });

  it('accepts ISO year-first input as-is', () => {
    expect(parseLooseDate('2027-12-30', ref)).toBe('2027-12-30');
  });

  it('recovers month-first input only when day-first is impossible', () => {
    expect(parseLooseDate('05/13/2025', ref)).toBe('2025-05-13');
    // Ambiguous (both readings valid) stays day-first.
    expect(parseLooseDate('04/05/2025', ref)).toBe('2025-05-04');
  });

  it('rejects impossible or unreadable input', () => {
    expect(parseLooseDate('', ref)).toBeNull();
    expect(parseLooseDate('32.13.2027', ref)).toBeNull();
    expect(parseLooseDate('31.02.2027', ref)).toBeNull(); // no Feb 31
    expect(parseLooseDate('abc', ref)).toBeNull();
    expect(parseLooseDate('12345', ref)).toBeNull(); // 5 packed digits
  });

  it('round-trips with formatDMY', () => {
    expect(formatDMY('2026-08-15')).toBe('15.08.2026');
    expect(parseLooseDate(formatDMY('2026-08-15'), ref)).toBe('2026-08-15');
  });
});

describe('friendlyDate', () => {
  const today = '2026-06-12';
  it('labels today and tomorrow', () => {
    expect(friendlyDate('2026-06-12', '14:30', today)).toBe('Today · 14:30');
    expect(friendlyDate('2026-06-13', undefined, today)).toBe('Tomorrow');
  });
  it('formats other dates as weekday + day + month', () => {
    expect(friendlyDate('2026-06-19', '09:00', today)).toBe('Fri 19 Jun · 09:00');
  });
});
