import type { CustomGradient } from '../../app/settingsStore';

/** One selectable look in the swatch gallery. */
export interface Design {
  /** Stable key: preset name, custom name, or premium cosmetic id. */
  id: string;
  name: string;
  kind: 'solid' | 'gradient';
  color1: string;
  color2?: string;
  /** The CategoryConfig `value` this design writes (color or gradient CSS). */
  value: string;
  /** Requires the cosmetics unlock to persist. References a cosmetic id. */
  premium?: boolean;
  /** Lives in the user's saved custom gradients (deletable). */
  custom?: boolean;
}

/** The animated 3-stop gradient the category system renders (A → B → A loops). */
export function gradientValue(c1: string, c2: string): string {
  return `linear-gradient(90deg, ${c1}, ${c2}, ${c1})`;
}

export const PRESET_SOLID_COLORS = [
  '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff3b30', '#ffd60a',
  '#ff375f', '#11998e', '#5e5ce6', '#a2845e', '#8e8e93',
];

export const PRESET_GRADIENTS: { name: string; color1: string; color2: string; value: string }[] = [
  { name: 'AI Rainbow', color1: '#6366f1', color2: '#ec4899', value: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #f59e0b, #6366f1)' },
  { name: 'Ocean Breeze', color1: '#00c6ff', color2: '#0072ff', value: gradientValue('#00c6ff', '#0072ff') },
  { name: 'Forest Vine', color1: '#11998e', color2: '#38ef7d', value: gradientValue('#11998e', '#38ef7d') },
  { name: 'Sunset Fire', color1: '#ff9900', color2: '#ff5e62', value: gradientValue('#ff9900', '#ff5e62') },
  { name: 'Grape Soda', color1: '#7f00ff', color2: '#e100ff', value: gradientValue('#7f00ff', '#e100ff') },
  { name: 'Rose Gold', color1: '#f4c4f3', color2: '#fc67fa', value: gradientValue('#f4c4f3', '#fc67fa') },
  { name: 'Deep Sea', color1: '#141e30', color2: '#2b5876', value: gradientValue('#141e30', '#2b5876') },
  { name: 'Peach Glow', color1: '#ffb347', color2: '#ffcc33', value: gradientValue('#ffb347', '#ffcc33') },
  { name: 'Northern Lights', color1: '#00c9ff', color2: '#92fe9d', value: gradientValue('#00c9ff', '#92fe9d') },
  { name: 'Cherry Blossom', color1: '#ff9a9e', color2: '#fecfef', value: gradientValue('#ff9a9e', '#fecfef') },
  { name: 'Midnight Violet', color1: '#4b1d8f', color2: '#a44bff', value: gradientValue('#4b1d8f', '#a44bff') },
];

/** Premium gallery entries: curated stops for existing premium gradient
 *  cosmetics. `id` MUST be a real cosmetic id — locking checks it. */
export const PREMIUM_DESIGNS: { id: string; name: string; color1: string; color2: string }[] = [
  { id: 'neon-rush', name: 'Neon Rush', color1: '#ff007f', color2: '#7f77dd' },
  { id: 'nebula', name: 'Nebula', color1: '#8a2be2', color2: '#312e81' },
  { id: 'cyberpunk', name: 'Cyberpunk', color1: '#ffd700', color2: '#ff2079' },
  { id: 'lava-flow', name: 'Lava Flow', color1: '#ff4500', color2: '#7c2d12' },
];

/** The full gallery for a mode, ordered: customs → presets → premium. */
export function buildGallery(mode: 'color' | 'gradient', customs: CustomGradient[]): Design[] {
  if (mode === 'color') {
    return PRESET_SOLID_COLORS.map((c) => ({ id: c, name: c, kind: 'solid' as const, color1: c, value: c }));
  }
  const customDesigns: Design[] = customs.map((g) => ({
    id: g.name, name: g.name, kind: 'gradient', color1: g.color1, color2: g.color2,
    value: gradientValue(g.color1, g.color2), custom: true,
  }));
  const presets: Design[] = PRESET_GRADIENTS.map((g) => ({
    id: g.name, name: g.name, kind: 'gradient', color1: g.color1, color2: g.color2, value: g.value,
  }));
  const premium: Design[] = PREMIUM_DESIGNS.map((g) => ({
    id: g.id, name: g.name, kind: 'gradient', color1: g.color1, color2: g.color2,
    value: gradientValue(g.color1, g.color2), premium: true,
  }));
  return [...customDesigns, ...presets, ...premium];
}

/** The collapsed 6×2 grid: first 11 non-premium designs (customs first). */
export function collapsedGallery(all: Design[]): Design[] {
  return all.filter((d) => !d.premium).slice(0, 11);
}
