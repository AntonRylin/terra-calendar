import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOCK_STYLE,
  clockTextStyle,
  formatClockTime,
  normalizeClockStyle,
  type ClockStyle,
} from './clockStyle';

function style(patch: Partial<ClockStyle>): ClockStyle {
  return { ...DEFAULT_CLOCK_STYLE, ...patch };
}

describe('formatClockTime', () => {
  const evening = new Date(2026, 6, 18, 21, 7, 3);
  const morning = new Date(2026, 6, 18, 9, 7, 3);
  const midnight = new Date(2026, 6, 18, 0, 5, 0);
  const noon = new Date(2026, 6, 18, 12, 5, 0);

  it('renders zero-padded 24h time with seconds by default', () => {
    expect(formatClockTime(evening, DEFAULT_CLOCK_STYLE)).toBe('21:07:03');
    expect(formatClockTime(morning, DEFAULT_CLOCK_STYLE)).toBe('09:07:03');
  });

  it('drops seconds when showSeconds is off', () => {
    expect(formatClockTime(evening, style({ showSeconds: false }))).toBe('21:07');
  });

  it('renders 12h time without padding or suffix', () => {
    expect(formatClockTime(evening, style({ format: '12h', showSeconds: false }))).toBe('9:07');
  });

  it('renders 12h AM/PM, mapping midnight and noon to 12', () => {
    expect(formatClockTime(evening, style({ format: '12h-ampm', showSeconds: false }))).toBe('9:07 PM');
    expect(formatClockTime(morning, style({ format: '12h-ampm', showSeconds: false }))).toBe('9:07 AM');
    expect(formatClockTime(midnight, style({ format: '12h-ampm', showSeconds: false }))).toBe('12:05 AM');
    expect(formatClockTime(noon, style({ format: '12h-ampm', showSeconds: false }))).toBe('12:05 PM');
  });
});

describe('normalizeClockStyle', () => {
  it('returns defaults for junk input', () => {
    expect(normalizeClockStyle(undefined)).toEqual(DEFAULT_CLOCK_STYLE);
    expect(normalizeClockStyle('nope')).toEqual(DEFAULT_CLOCK_STYLE);
    expect(normalizeClockStyle({ format: 'metric', font: 'papyrus', color: 'red', showSeconds: 'yes' })).toEqual(
      DEFAULT_CLOCK_STYLE,
    );
  });

  it('keeps valid values', () => {
    const s = style({ format: '12h-ampm', showSeconds: false, font: 'serif', color: '#ff2d55' });
    expect(normalizeClockStyle(s)).toEqual(s);
    const grad = style({ color: 'linear-gradient(90deg, #ff9500, #ff2d55)' });
    expect(normalizeClockStyle(grad)).toEqual(grad);
  });

  it('rejects colors that could escape a CSS declaration', () => {
    expect(normalizeClockStyle(style({ color: 'linear-gradient(90deg, red); position: fixed' })).color).toBe('');
    expect(normalizeClockStyle(style({ color: 'linear-gradient(url(https://x/y))' })).color).toBe('');
  });
});

describe('clockTextStyle', () => {
  it('leaves color alone by default so the accent CSS applies', () => {
    const css = clockTextStyle(DEFAULT_CLOCK_STYLE);
    expect(css.color).toBeUndefined();
    expect(css.fontFamily).toContain('ui-monospace');
  });

  it('applies solid colors directly', () => {
    expect(clockTextStyle(style({ color: '#ff2d55' })).color).toBe('#ff2d55');
  });

  it('renders gradients as clipped background text', () => {
    const grad = 'linear-gradient(90deg, #ff9500, #ff2d55)';
    const css = clockTextStyle(style({ color: grad }));
    expect(css.backgroundImage).toBe(grad);
    expect(css.backgroundClip).toBe('text');
    expect(css.WebkitTextFillColor).toBe('transparent');
  });

  it('falls back to the mono font for unknown ids', () => {
    expect(clockTextStyle(style({ font: 'ghost' })).fontFamily).toContain('ui-monospace');
  });
});
