import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  addMinutesToTime,
  defaultEndTime,
  durationMinutes,
  formatDuration,
  parseLooseTime,
} from './timeOfDay';

describe('timeToMinutes / minutesToTime', () => {
  it('round-trips times', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(0)).toBe('00:00');
  });

  it('clamps out-of-range minutes to the same day', () => {
    expect(minutesToTime(-10)).toBe('00:00');
    expect(minutesToTime(24 * 60)).toBe('23:59');
    expect(minutesToTime(3000)).toBe('23:59');
  });
});

describe('addMinutesToTime / defaultEndTime', () => {
  it('shifts within the day', () => {
    expect(addMinutesToTime('09:00', 90)).toBe('10:30');
    expect(addMinutesToTime('09:00', -30)).toBe('08:30');
  });

  it('defaults to one hour later', () => {
    expect(defaultEndTime('14:00')).toBe('15:00');
    expect(defaultEndTime('08:45')).toBe('09:45');
  });

  it('clamps near midnight instead of wrapping', () => {
    expect(defaultEndTime('23:30')).toBe('23:59');
  });
});

describe('durationMinutes', () => {
  it('measures start to end', () => {
    expect(durationMinutes('09:00', '10:30')).toBe(90);
    expect(durationMinutes('09:00', '09:05')).toBe(5);
  });

  it('falls back to 1 hour when end is absent or invalid', () => {
    expect(durationMinutes('09:00', undefined)).toBe(60);
    expect(durationMinutes('09:00', '09:00')).toBe(60);
    expect(durationMinutes('09:00', '08:00')).toBe(60);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours compactly', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(0)).toBe('');
  });
});

describe('parseLooseTime', () => {
  it('reads colon / dot / packed forms', () => {
    expect(parseLooseTime('14:30')).toBe('14:30');
    expect(parseLooseTime('14.30')).toBe('14:30');
    expect(parseLooseTime('1430')).toBe('14:30');
    expect(parseLooseTime('930')).toBe('09:30');
    expect(parseLooseTime('9:5')).toBe('09:05');
  });

  it('reads a bare hour', () => {
    expect(parseLooseTime('9')).toBe('09:00');
    expect(parseLooseTime('09')).toBe('09:00');
    expect(parseLooseTime('0')).toBe('00:00');
    expect(parseLooseTime('23')).toBe('23:00');
  });

  it('reads 12-hour input with a meridiem', () => {
    expect(parseLooseTime('9pm')).toBe('21:00');
    expect(parseLooseTime('9 pm')).toBe('21:00');
    expect(parseLooseTime('9p')).toBe('21:00');
    expect(parseLooseTime('2:30pm')).toBe('14:30');
    expect(parseLooseTime('230p')).toBe('14:30');
    expect(parseLooseTime('12am')).toBe('00:00');
    expect(parseLooseTime('12pm')).toBe('12:00');
    expect(parseLooseTime('9am')).toBe('09:00');
  });

  it('rejects impossible or unreadable input', () => {
    expect(parseLooseTime('')).toBeNull();
    expect(parseLooseTime('25')).toBeNull();
    expect(parseLooseTime('12:60')).toBeNull();
    expect(parseLooseTime('13pm')).toBeNull(); // 13 isn't a 12-hour hour
    expect(parseLooseTime('abc')).toBeNull();
    expect(parseLooseTime('99999')).toBeNull();
  });
});
