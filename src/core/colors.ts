/** Calculates a readable text color (black or white) given a hex color string. */
export function getContrastColor(hexColor: string | undefined): string | undefined {
  if (!hexColor || !hexColor.startsWith('#')) return undefined;
  const hex = hexColor.trim();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#1d1d1f' : '#ffffff';
}
