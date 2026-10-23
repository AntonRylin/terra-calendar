import { buildWeek, buildWeeks, mondayOf, weekMonth } from './weeks';

describe('mondayOf', () => {
  it('returns the Monday on or before a date', () => {
    expect(mondayOf('2026-06-12')).toBe('2026-06-08'); // Friday -> Mon Jun 8
    expect(mondayOf('2026-06-08')).toBe('2026-06-08'); // Monday -> itself
    expect(mondayOf('2026-06-14')).toBe('2026-06-08'); // Sunday -> Mon Jun 8
  });
});

describe('buildWeek', () => {
  it('produces 7 days Monday-first with correct day numbers', () => {
    const week = buildWeek('2026-06-08', '2026-06-12');
    expect(week.days).toHaveLength(7);
    expect(week.days[0].date).toBe('2026-06-08');
    expect(week.days[0].day).toBe(8);
    expect(week.days[6].date).toBe('2026-06-14');
  });

  it('marks today', () => {
    const week = buildWeek('2026-06-08', '2026-06-12');
    expect(week.days[4].isToday).toBe(true); // Fri Jun 12
    expect(week.days.filter((d) => d.isToday)).toHaveLength(1);
  });

  it('flags the first of the month across a boundary', () => {
    const week = buildWeek('2026-06-29', '2026-06-12');
    expect(week.days[2].date).toBe('2026-07-01');
    expect(week.days[2].isFirstOfMonth).toBe(true);
    expect(week.days.filter((d) => d.isFirstOfMonth)).toHaveLength(1);
    // month tint parity changes mid-week
    expect(week.days[0].monthIndex).toBe(2026 * 12 + 5); // June
    expect(week.days[2].monthIndex).toBe(2026 * 12 + 6); // July
  });
});

describe('buildWeeks', () => {
  it('returns consecutive week rows', () => {
    const rows = buildWeeks('2026-06-08', 3, '2026-06-12');
    expect(rows.map((r) => r.monday)).toEqual(['2026-06-08', '2026-06-15', '2026-06-22']);
  });
});

describe('weekMonth', () => {
  it('attributes a straddling week to its Thursday month', () => {
    // Week of Mon Jun 29 has Thursday Jul 2 -> belongs to July.
    expect(weekMonth(buildWeek('2026-06-29', '2026-06-12'))).toEqual({ year: 2026, month: 7 });
    // A fully-June week stays June.
    expect(weekMonth(buildWeek('2026-06-08', '2026-06-12'))).toEqual({ year: 2026, month: 6 });
  });
});
