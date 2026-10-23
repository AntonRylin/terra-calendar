import type { CSSProperties } from 'react';

/** 24-hour, 12-hour without suffix, or 12-hour with AM/PM. */
export type ClockFormat = '24h' | '12h' | '12h-ampm';

/** Look of the live clock shown on today's day tile. Part of the persisted
 *  (and cloud-synced) settings blob — see settingsStore. */
export interface ClockStyle {
  format: ClockFormat;
  showSeconds: boolean;
  /** Font preset id from CLOCK_FONTS ('mono' = default). */
  font: string;
  /** '' = accent color (default), '#rrggbb' = solid, 'linear-gradient(…)' =
   *  gradient text (rendered with background-clip: text). */
  color: string;
}

export const DEFAULT_CLOCK_STYLE: ClockStyle = {
  format: '24h',
  showSeconds: true,
  font: 'mono',
  color: '',
};

export interface ClockFontPreset {
  id: string;
  name: string;
  family: string;
  weight: number;
  letterSpacing?: string;
}

/** System-font stacks only, so the clock looks the same without bundling fonts. */
export const CLOCK_FONTS: ClockFontPreset[] = [
  { id: 'mono', name: 'Mono', family: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace", weight: 600 },
  { id: 'sans', name: 'Sans', family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", weight: 600 },
  { id: 'serif', name: 'Serif', family: "Georgia, 'Times New Roman', serif", weight: 600 },
  { id: 'rounded', name: 'Rounded', family: "'Comic Sans MS', 'Marker Felt', 'Segoe UI', sans-serif", weight: 700 },
  { id: 'script', name: 'Script', family: "'Segoe Script', 'Snell Roundhand', 'Brush Script MT', cursive", weight: 600 },
  { id: 'black', name: 'Bold', family: "'Arial Black', 'Segoe UI', sans-serif", weight: 900, letterSpacing: '0.03em' },
];

export interface ClockColorPreset {
  id: string;
  name: string;
  /** '' = accent (default); otherwise a hex color or a linear-gradient. */
  value: string;
}

export const CLOCK_COLOR_PRESETS: ClockColorPreset[] = [
  { id: 'accent', name: 'Accent', value: '' },
  { id: 'pink', name: 'Pink', value: '#ff2d55' },
  { id: 'orange', name: 'Orange', value: '#ff9500' },
  { id: 'green', name: 'Green', value: '#34c759' },
  { id: 'purple', name: 'Purple', value: '#af52de' },
  { id: 'sunset', name: 'Sunset', value: 'linear-gradient(90deg, #ff9500, #ff2d55)' },
  { id: 'ocean', name: 'Ocean', value: 'linear-gradient(90deg, #0a84ff, #30d5c8)' },
  { id: 'aurora', name: 'Aurora', value: 'linear-gradient(90deg, #34c759, #5e5ce6)' },
  { id: 'candy', name: 'Candy', value: 'linear-gradient(90deg, #ff2d55, #af52de)' },
  { id: 'gold', name: 'Gold', value: 'linear-gradient(90deg, #f7b733, #fc4a1a)' },
  { id: 'twilight', name: 'Twilight', value: 'linear-gradient(90deg, #5e5ce6, #ff2d55)' },
];

export function isGradientColor(color: string): boolean {
  return color.startsWith('linear-gradient(');
}

/** A color value is either empty (accent), a hex color, or a linear-gradient
 *  free of anything that could escape a CSS declaration (imported settings are
 *  untrusted, so gradients are rejected if they smuggle url()/expressions). */
function isValidClockColor(color: string): boolean {
  if (color === '') return true;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return true;
  return (
    isGradientColor(color) &&
    color.endsWith(')') &&
    !color.includes(';') &&
    !/url\s*\(/i.test(color)
  );
}

/** Normalize a raw stored value into a current-shape ClockStyle, falling back
 *  to the default field-by-field (mirrors normalizeHabitTab's tolerance). */
export function normalizeClockStyle(raw: unknown): ClockStyle {
  const base = { ...DEFAULT_CLOCK_STYLE };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  if (r.format === '12h' || r.format === '12h-ampm' || r.format === '24h') base.format = r.format;
  if (typeof r.showSeconds === 'boolean') base.showSeconds = r.showSeconds;
  if (typeof r.font === 'string' && CLOCK_FONTS.some((f) => f.id === r.font)) base.font = r.font;
  if (typeof r.color === 'string' && isValidClockColor(r.color)) base.color = r.color;
  return base;
}

/** Render a Date as the clock's text for the given style. */
export function formatClockTime(date: Date, style: ClockStyle): string {
  let hours = date.getHours();
  const suffix = style.format === '12h-ampm' ? (hours >= 12 ? ' PM' : ' AM') : '';
  if (style.format !== '24h') {
    hours = hours % 12;
    if (hours === 0) hours = 12;
  }
  const hh = style.format === '24h' ? String(hours).padStart(2, '0') : String(hours);
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = style.showSeconds ? `:${String(date.getSeconds()).padStart(2, '0')}` : '';
  return `${hh}:${mm}${ss}${suffix}`;
}

/** Inline styles applying a ClockStyle to clock text. The default color is
 *  omitted so the .today-clock CSS accent color still applies. */
export function clockTextStyle(style: ClockStyle): CSSProperties {
  const font = CLOCK_FONTS.find((f) => f.id === style.font) ?? CLOCK_FONTS[0];
  const css: CSSProperties = { fontFamily: font.family, fontWeight: font.weight };
  if (font.letterSpacing) css.letterSpacing = font.letterSpacing;
  if (isGradientColor(style.color)) {
    css.backgroundImage = style.color;
    css.WebkitBackgroundClip = 'text';
    css.backgroundClip = 'text';
    css.WebkitTextFillColor = 'transparent';
    css.color = 'transparent';
  } else if (style.color) {
    css.color = style.color;
  }
  return css;
}
