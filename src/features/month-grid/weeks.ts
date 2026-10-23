import { addDays, parseISODate } from '../../core/dates';

export interface DayCell {
  /** "YYYY-MM-DD" */
  date: string;
  /** Day of month, 1-31. */
  day: number;
  isToday: boolean;
  /** True on the 1st — the row that carries a month label. */
  isFirstOfMonth: boolean;
  /** year*12 + (month-1); used for alternating month tint. */
  monthIndex: number;
}

export interface WeekRow {
  /** Monday of the week, "YYYY-MM-DD" — stable React key. */
  monday: string;
  /** Seven cells, Monday → Sunday. */
  days: DayCell[];
}

/** Monday on or before the given date. */
export function mondayOf(iso: string): string {
  const dow = (parseISODate(iso).getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -dow);
}

/** `count` days from `monday`. The week planner asks for more than seven so it
 *  can hang a spare day off each end of its scrolling strip. */
export function buildWeek(monday: string, today: string, count = 7): WeekRow {
  const days: DayCell[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(monday, i);
    const [y, m, d] = date.split('-').map(Number);
    days.push({
      date,
      day: d,
      isToday: date === today,
      isFirstOfMonth: d === 1,
      monthIndex: y * 12 + (m - 1),
    });
  }
  return { monday, days };
}

/** `count` consecutive week rows starting at `firstMonday`. */
export function buildWeeks(firstMonday: string, count: number, today: string): WeekRow[] {
  const rows: WeekRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(buildWeek(addDays(firstMonday, i * 7), today));
  }
  return rows;
}

/**
 * The month a week belongs to, by its Thursday (ISO convention) — used for the
 * header label so a week straddling a boundary is attributed to its majority
 * month.
 */
export function weekMonth(week: WeekRow): { year: number; month: number } {
  const [y, m] = week.days[3].date.split('-').map(Number);
  return { year: y, month: m };
}
