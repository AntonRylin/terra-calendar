import type { SpecialDay, DayCustomStyle, DayImageRef } from '../app/specialDaysStore';

export type DayBackground =
  | { kind: 'none' }
  | { kind: 'cosmetic'; id: string }
  | { kind: 'image'; ref: DayImageRef }
  | { kind: 'css'; style: DayCustomStyle; scopeClass: string };

/** Stable per-record CSS class used to scope custom CSS to one day's fill. */
export function dayScopeClass(id: string): string {
  return `cd-${id}`;
}

/**
 * The single active background for a day. Precedence (defensive — the editor
 * keeps these mutually exclusive): image > customStyle > cosmetic > none.
 */
export function resolveDayBackground(
  sd: Pick<SpecialDay, 'id' | 'cosmetic' | 'image' | 'customStyle'>,
): DayBackground {
  if (sd.image) return { kind: 'image', ref: sd.image };
  if (sd.customStyle) return { kind: 'css', style: sd.customStyle, scopeClass: dayScopeClass(sd.id) };
  if (sd.cosmetic) return { kind: 'cosmetic', id: sd.cosmetic };
  return { kind: 'none' };
}
