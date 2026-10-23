import { describe, it, expect } from 'vitest';
import { getContrastColor } from './colors';

describe('getContrastColor', () => {
  it('returns dark text on light backgrounds', () => {
    expect(getContrastColor('#ffffff')).toBe('#1d1d1f');
    expect(getContrastColor('#ffff00')).toBe('#1d1d1f'); // bright yellow
  });

  it('returns light text on dark backgrounds', () => {
    expect(getContrastColor('#000000')).toBe('#ffffff');
    expect(getContrastColor('#0000ff')).toBe('#ffffff'); // pure blue is dark by YIQ
  });

  it('picks white at the luminance threshold boundary', () => {
    // YIQ exactly 128 -> dark text; just below -> white.
    expect(getContrastColor('#777777')).toBe('#ffffff');
    expect(getContrastColor('#808080')).toBe('#1d1d1f');
  });

  it('returns undefined for missing or non-hex input', () => {
    expect(getContrastColor(undefined)).toBeUndefined();
    expect(getContrastColor('')).toBeUndefined();
    expect(getContrastColor('rebeccapurple')).toBeUndefined();
    expect(getContrastColor('rgb(0,0,0)')).toBeUndefined();
  });

  it('returns undefined for malformed hex it cannot parse', () => {
    // Shorthand 3-digit hex is not supported by the current slice-based parser.
    expect(getContrastColor('#fff')).toBeUndefined();
    expect(getContrastColor('#gggggg')).toBeUndefined();
  });
});
