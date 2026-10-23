import { pad2 } from './dates';

/** Default duration of a timed event when no end time is stored. */
export const DEFAULT_DURATION_MIN = 60;

/** Minutes since midnight for an "HH:mm" wall-clock time. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** "HH:mm" for minutes since midnight, clamped to the same day (0..23:59). */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/** `time` shifted by `minutes`, clamped to the same day. */
export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/** End time a new timed event gets by default: start + 1 hour (same day). */
export function defaultEndTime(time: string): string {
  return addMinutesToTime(time, DEFAULT_DURATION_MIN);
}

/**
 * Duration in minutes between a start and (optional) end time. Falls back to
 * the 1-hour default when the end is absent or not after the start.
 */
export function durationMinutes(time: string, endTime: string | undefined): number {
  if (!endTime) return DEFAULT_DURATION_MIN;
  const d = timeToMinutes(endTime) - timeToMinutes(time);
  return d > 0 ? d : DEFAULT_DURATION_MIN;
}

/** Compact human duration: "45 min", "1 h", "1 h 30 min", "2 h". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Parse a loosely-typed time into "HH:mm" (24-hour), or null if unreadable.
 *
 * Accepts what people actually type:
 *   "1430" · "14:30" · "14.30"  → 14:30
 *   "930" · "9:30"              → 09:30
 *   "9" · "09"                  → 09:00
 *   "9:5"                       → 09:05
 * …and 12-hour input with a meridiem suffix (space/dot optional):
 *   "9pm" · "9 pm" · "9p"       → 21:00
 *   "2:30pm" · "230p"           → 14:30
 *   "12am" → 00:00 · "12pm" → 12:00
 */
export function parseLooseTime(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;

  let meridiem: 'am' | 'pm' | null = null;
  if (/[ap]\.?m?\.?$/.test(s)) {
    meridiem = s.includes('p') ? 'pm' : 'am';
    s = s.replace(/[ap]\.?m?\.?$/, '').trim();
  }
  if (!s) return null;

  let h: number;
  let m: number;
  if (/[:.]/.test(s)) {
    const [hStr, mStr = '0'] = s.split(/[:.]/);
    h = Number(hStr);
    m = Number(mStr);
  } else if (/^\d+$/.test(s)) {
    if (s.length <= 2) {
      h = Number(s);
      m = 0;
    } else if (s.length === 3) {
      h = Number(s.slice(0, 1));
      m = Number(s.slice(1));
    } else if (s.length === 4) {
      h = Number(s.slice(0, 2));
      m = Number(s.slice(2));
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;

  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'am') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  }

  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}
