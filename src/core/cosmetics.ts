import type { CalendarEvent } from './types';
import type { CategoryConfig } from '../app/settingsStore';
import { getContrastColor } from './colors';

/**
 * Prebuilt animated "skins" for events. A cosmetic is referenced by its stable
 * `id` (stored on events and category configs); the actual visuals live in
 * `src/ui/cosmetics.css` as `.cosmetic-<id>` classes. This module is the single
 * source of truth for which cosmetics exist and how to resolve the effective one
 * for an event — keep it pure (no React, no DOM).
 */
export type CosmeticKind =
  /** Self-contained multi-colour gradient; overrides the event's solid colour. */
  | 'gradient'
  /** Animated effect layered over the event's own solid colour. */
  | 'effect';

/**
 * Visual family, ordered by how much a cosmetic draws the eye. This is the axis
 * the picker groups by, so the library reads calm → loud instead of arbitrary.
 */
export type CosmeticFamily =
  /** User-saved gradients from the day-background builder (see customStyles.ts). */
  | 'custom'
  /** Keeps the event's own colour; just a moving highlight (shimmer/glow/sheen). */
  | 'effect'
  /** Flowing multi-colour gradient with no halo — the muted/pastel/natural set. */
  | 'calm'
  /** Colour blobs that wander and diffuse into each other like ink in water —
   *  no directional scroll. The showpiece "mesh gradient" set. */
  | 'liquid'
  /** Flowing gradient plus a pulsing glow/breathing halo. */
  | 'glow'
  /** Patterns, flicker, and hot neon — the loudest, most attention-grabbing skins. */
  | 'flashy';

export interface CosmeticFamilyMeta {
  id: CosmeticFamily;
  /** Section heading shown in the picker. */
  label: string;
  /** Short qualifier shown next to the heading. */
  hint: string;
}

/** Families in ascending visual intensity — the order sections appear in the picker. */
export const COSMETIC_FAMILIES: CosmeticFamilyMeta[] = [
  { id: 'custom', label: 'My styles', hint: 'saved from the gradient builder' },
  { id: 'effect', label: 'Overlay effects', hint: 'keeps your colour' },
  { id: 'calm', label: 'Calm gradients', hint: 'flowing, no glow' },
  { id: 'liquid', label: 'Liquid gradients', hint: 'diffusing, water-like' },
  { id: 'glow', label: 'Glowing', hint: 'pulsing halo' },
  { id: 'flashy', label: 'Animated & bold', hint: 'patterns & neon' },
];

export interface Cosmetic {
  id: string;
  name: string;
  kind: CosmeticKind;
  /** Which family this skin belongs to; drives ordering/grouping in the picker. */
  family: CosmeticFamily;
  /** Representative colour for places that can't animate (the minimap).
   *  Omitted for effects, which stay tied to the event's own colour. */
  swatch?: string;
}

export const COSMETICS: Cosmetic[] = [
  { id: 'aurora', name: 'Aurora', kind: 'gradient', family: 'calm', swatch: '#1d9e75' },
  { id: 'sunset', name: 'Sunset', kind: 'gradient', family: 'calm', swatch: '#d85a30' },
  { id: 'ocean', name: 'Ocean', kind: 'gradient', family: 'calm', swatch: '#185fa5' },
  { id: 'rainbow', name: 'Rainbow', kind: 'gradient', family: 'calm', swatch: '#7f77dd' },
  { id: 'gold', name: 'Gold', kind: 'gradient', family: 'calm', swatch: '#caa033' },
  { id: 'candy', name: 'Candy', kind: 'gradient', family: 'calm', swatch: '#d4537e' },
  { id: 'magma', name: 'Magma', kind: 'gradient', family: 'calm', swatch: '#e24b4a' },
  { id: 'mint', name: 'Mint', kind: 'gradient', family: 'calm', swatch: '#5dcaa5' },
  { id: 'shimmer', name: 'Shimmer', kind: 'effect', family: 'effect' },
  { id: 'glow', name: 'Glow', kind: 'effect', family: 'effect' },
  { id: 'sheen', name: 'Sheen', kind: 'effect', family: 'effect' },
  // Stardust keeps the event colour and layers interactive dust on top: the
  // particle engine (src/ui/cosmeticParticles.ts) scatters it away from the
  // cursor and springs it back home.
  { id: 'stardust', name: 'Stardust', kind: 'effect', family: 'effect' },
  { id: 'neon-rush', name: 'Neon Rush', kind: 'gradient', family: 'flashy', swatch: '#ff007f' },
  { id: 'bubblegum', name: 'Bubblegum', kind: 'gradient', family: 'calm', swatch: '#ff75a0' },
  { id: 'retro-sunset', name: 'Retro Sunset', kind: 'gradient', family: 'calm', swatch: '#e76f51' },
  { id: 'forest-moss', name: 'Forest Moss', kind: 'gradient', family: 'calm', swatch: '#2a9d8f' },
  { id: 'nebula', name: 'Nebula', kind: 'gradient', family: 'flashy', swatch: '#8a2be2' },
  { id: 'lava-flow', name: 'Lava Flow', kind: 'gradient', family: 'flashy', swatch: '#ff4500' },
  { id: 'holo-prism', name: 'Holo Prism', kind: 'gradient', family: 'calm', swatch: '#e0c3fc' },
  { id: 'cyberpunk', name: 'Cyberpunk', kind: 'gradient', family: 'flashy', swatch: '#ffd700' },
  { id: 'glacier', name: 'Glacier', kind: 'gradient', family: 'calm', swatch: '#a8dadc' },
  { id: 'stripes', name: 'Stripes', kind: 'gradient', family: 'flashy', swatch: '#457b9d' },
  { id: 'golden-hour', name: 'Golden Hour', kind: 'gradient', family: 'calm', swatch: '#ff9f1c' },
  { id: 'cyber-green', name: 'Cyber Green', kind: 'gradient', family: 'flashy', swatch: '#00ff66' },
  { id: 'cotton-candy', name: 'Cotton Candy', kind: 'gradient', family: 'calm', swatch: '#ffb3c6' },
  { id: 'electric-indigo', name: 'Electric Indigo', kind: 'gradient', family: 'flashy', swatch: '#4d00ff' },
  { id: 'ruby-gem', name: 'Ruby Gem', kind: 'gradient', family: 'calm', swatch: '#d90429' },
  { id: 'acid-lime', name: 'Acid Lime', kind: 'gradient', family: 'flashy', swatch: '#adff2f' },
  { id: 'bronze-metal', name: 'Bronze Metal', kind: 'gradient', family: 'calm', swatch: '#cd7f32' },
  { id: 'deep-abyss', name: 'Deep Abyss', kind: 'gradient', family: 'calm', swatch: '#03001e' },
  { id: 'candy-cane', name: 'Candy Cane', kind: 'gradient', family: 'flashy', swatch: '#e63946' },
  { id: 'peach-cream', name: 'Peach Cream', kind: 'gradient', family: 'calm', swatch: '#ffcad4' },
  { id: 'cosmic-dust', name: 'Cosmic Dust', kind: 'gradient', family: 'calm', swatch: '#614385' },
  { id: 'frozen-fire', name: 'Frozen Fire', kind: 'gradient', family: 'calm', swatch: '#50c878' },
  { id: 'emerald-glow', name: 'Emerald Glow', kind: 'gradient', family: 'calm', swatch: '#11998e' },
  { id: 'sweet-lavender', name: 'Sweet Lavender', kind: 'gradient', family: 'calm', swatch: '#a18cd1' },
  { id: 'solar-flare', name: 'Solar Flare', kind: 'gradient', family: 'flashy', swatch: '#f12711' },
  { id: 'deep-space', name: 'Deep Space', kind: 'gradient', family: 'calm', swatch: '#0f2027' },
  { id: 'mermaid-shell', name: 'Mermaid Shell', kind: 'gradient', family: 'calm', swatch: '#a1c4fd' },
  { id: 'cherry-blossom', name: 'Cherry Blossom', kind: 'gradient', family: 'calm', swatch: '#ff9a9e' },
  { id: 'electric-crimson', name: 'Electric Crimson', kind: 'gradient', family: 'flashy', swatch: '#ff007f' },
  { id: 'matcha-latte', name: 'Matcha Latte', kind: 'gradient', family: 'calm', swatch: '#8fbc8f' },
  { id: 'neon-pulse', name: 'Neon Pulse', kind: 'gradient', family: 'glow', swatch: '#00f0ff' },
  { id: 'magical-amethyst', name: 'Magical Amethyst', kind: 'gradient', family: 'calm', swatch: '#9966cc' },
  { id: 'cyber-inferno', name: 'Cyber Inferno', kind: 'gradient', family: 'glow', swatch: '#ff3300' },
  { id: 'aurora-borealis', name: 'Aurora Borealis', kind: 'gradient', family: 'calm', swatch: '#00ffcc' },
  { id: 'frozen-tundra', name: 'Frozen Tundra', kind: 'gradient', family: 'calm', swatch: '#cce6ff' },
  { id: 'vintage-velvet', name: 'Vintage Velvet', kind: 'gradient', family: 'calm', swatch: '#800020' },
  { id: 'acid-techno', name: 'Acid Techno', kind: 'gradient', family: 'flashy', swatch: '#ccff00' },
  { id: 'starlight-glow', name: 'Starlight Glow', kind: 'gradient', family: 'glow', swatch: '#e6f2ff' },
  { id: 'supernova-spark', name: 'Supernova Spark', kind: 'gradient', family: 'flashy', swatch: '#ff00cc' },
  { id: 'luminous-teal', name: 'Luminous Teal', kind: 'gradient', family: 'glow', swatch: '#00e5ff' },
  { id: 'electric-violet', name: 'Electric Violet', kind: 'gradient', family: 'glow', swatch: '#6600ff' },
  { id: 'sunset-gold', name: 'Sunset Gold', kind: 'gradient', family: 'calm', swatch: '#ff9900' },
  { id: 'midnight-neon', name: 'Midnight Neon', kind: 'gradient', family: 'flashy', swatch: '#001133' },
  { id: 'glitch-matrix', name: 'Glitch Matrix', kind: 'gradient', family: 'flashy', swatch: '#00ff00' },
  { id: 'holographic-pearl', name: 'Holographic Pearl', kind: 'gradient', family: 'calm', swatch: '#eaeaea' },
  { id: 'tempting-tangerine', name: 'Tempting Tangerine', kind: 'gradient', family: 'calm', swatch: '#ff5500' },
  { id: 'neon-lime', name: 'Neon Lime', kind: 'gradient', family: 'glow', swatch: '#39ff14' },
  { id: 'plasma-wave', name: 'Plasma Wave', kind: 'gradient', family: 'flashy', swatch: '#ff0055' },
  { id: 'boreal-forest', name: 'Boreal Forest', kind: 'gradient', family: 'calm', swatch: '#228b22' },
  { id: 'cotton-candy-swirl', name: 'Cotton Candy Swirl', kind: 'gradient', family: 'calm', swatch: '#ffc0cb' },
  // Liquid set — blobs of colour that wander and diffuse into each other
  // (registered-property animation; see the cos-liquid keyframes in cosmetics.css).
  { id: 'ai-mesh', name: 'AI Mesh', kind: 'gradient', family: 'liquid', swatch: '#7b6cff' },
  { id: 'liquid-dream', name: 'Liquid Dream', kind: 'gradient', family: 'liquid', swatch: '#a5b8ff' },
  { id: 'ink-bloom', name: 'Ink Bloom', kind: 'gradient', family: 'liquid', swatch: '#1d3a6e' },
  { id: 'lava-lamp', name: 'Lava Lamp', kind: 'gradient', family: 'liquid', swatch: '#ff4e8a' },
  { id: 'deep-current', name: 'Deep Current', kind: 'gradient', family: 'liquid', swatch: '#0a5b78' },
  { id: 'opal-drift', name: 'Opal Drift', kind: 'gradient', family: 'liquid', swatch: '#dcd2f5' },
  // AI set — an "AI gradient" rendered four ways across the intensity spectrum.
  { id: 'ai-aura', name: 'AI Aura', kind: 'gradient', family: 'calm', swatch: '#c3b6ff' },
  { id: 'ai-glow', name: 'AI Glow', kind: 'gradient', family: 'glow', swatch: '#7b6cff' },
  { id: 'ai-spin', name: 'AI Spin', kind: 'gradient', family: 'flashy', swatch: '#6e8bff' },
  { id: 'ai-prism', name: 'AI Prism', kind: 'gradient', family: 'flashy', swatch: '#8a7bff' },
];

const byId = new Map(COSMETICS.map((c) => [c.id, c]));

/**
 * User-saved cosmetics (gradient templates from the day-background builder).
 * Injected by customStylesStore so this module stays pure — no store imports.
 * They resolve, group, and feature exactly like built-ins.
 */
let customCosmetics: Cosmetic[] = [];
let customById = new Map<string, Cosmetic>();

export function setCustomCosmetics(list: Cosmetic[]): void {
  customCosmetics = list;
  customById = new Map(list.map((c) => [c.id, c]));
}

/** Every selectable cosmetic: user-saved templates first, then the built-ins. */
export function allCosmetics(): Cosmetic[] {
  return customCosmetics.length ? [...customCosmetics, ...COSMETICS] : COSMETICS;
}

export interface CosmeticGroup {
  family: CosmeticFamilyMeta;
  cosmetics: Cosmetic[];
}

/** Cosmetics grouped by family in intensity order, preserving registry order
 *  within each group and dropping families that have no members. */
export function cosmeticsByFamily(): CosmeticGroup[] {
  const all = allCosmetics();
  return COSMETIC_FAMILIES.map((family) => ({
    family,
    cosmetics: all.filter((c) => c.family === family.id),
  })).filter((g) => g.cosmetics.length > 0);
}

/** The first `perFamily` cosmetics of each (non-empty) family, in intensity order,
 *  so the collapsed picker row previews the whole spectrum rather than just the
 *  first few. `perFamily` defaults to one representative per family. */
export function featuredCosmetics(perFamily = 1): Cosmetic[] {
  return cosmeticsByFamily().flatMap(({ cosmetics }) => cosmetics.slice(0, perFamily));
}

/** Up to `count` cosmetics pulled round-robin across families (calm→loud within
 *  each rank), so a larger front picker stays varied instead of front-loading one
 *  family. Returns fewer only if the library has fewer than `count` entries. */
export function featuredCosmeticsByCount(count: number): Cosmetic[] {
  const groups = cosmeticsByFamily().map((g) => g.cosmetics);
  const out: Cosmetic[] = [];
  const maxLen = Math.max(0, ...groups.map((g) => g.length));
  for (let rank = 0; rank < maxLen && out.length < count; rank++) {
    for (const list of groups) {
      if (rank < list.length) {
        out.push(list[rank]);
        if (out.length === count) break;
      }
    }
  }
  return out;
}

/** The cosmetic for an id, or undefined for unknown/absent ids. */
export function cosmeticById(id?: string): Cosmetic | undefined {
  return id ? byId.get(id) ?? customById.get(id) : undefined;
}

/** The CSS class for a cosmetic, or undefined when there's no valid cosmetic. */
export function cosmeticClass(id?: string): string | undefined {
  return cosmeticById(id) ? `cosmetic-${id}` : undefined;
}

/**
 * The effective cosmetic id for an event: the event's own choice wins, then its
 * category's default. Unknown/stale ids resolve to undefined so a removed
 * cosmetic degrades to the plain look.
 */
export function resolveCosmetic(
  event: Pick<CalendarEvent, 'cosmetic' | 'type'>,
  categories: Record<string, CategoryConfig>,
): string | undefined {
  const id = event.cosmetic ?? (event.type ? categories[event.type]?.cosmetic : undefined);
  return cosmeticById(id) ? id : undefined;
}

export type EventLook =
  | { kind: 'cosmetic'; id: string }
  | { kind: 'match'; config: CategoryConfig }
  | { kind: 'none' };

/**
 * Effective look for an event: its own cosmetic wins, then the category's
 * cosmetic (an animated style IS the category's look, so it applies whether or
 * not `matchEvents` is on), then a matched category (`matchEvents` — events
 * mirror the category's exact solid/gradient). Matched categories return the
 * config so callers derive CSS from it.
 */
export function resolveEventLook(
  event: Pick<CalendarEvent, 'cosmetic' | 'type'>,
  categories: Record<string, CategoryConfig>,
): EventLook {
  if (event.cosmetic && cosmeticById(event.cosmetic)) return { kind: 'cosmetic', id: event.cosmetic };
  const config = event.type ? categories[event.type] : undefined;
  if (config?.cosmetic && cosmeticById(config.cosmetic)) return { kind: 'cosmetic', id: config.cosmetic };
  if (config?.matchEvents) return { kind: 'match', config };
  return { kind: 'none' };
}

/**
 * Inline style for a matched event chip. Gradients drift via the
 * `.event-match-gradient` class (callers add it when the config is a gradient).
 */
export function getMatchedEventStyle(config: CategoryConfig): Record<string, string> {
  if (config.type === 'gradient') {
    return { backgroundImage: config.value, backgroundSize: '300% 100%', color: '#fff' };
  }
  return { backgroundColor: config.value, color: getContrastColor(config.value) ?? '#fff' };
}

/**
 * TEMPORARY: every cosmetic is free right now. Flip this back to false to
 * restore the premium split below (tests key off this flag too).
 */
export const ALL_COSMETICS_FREE = true;

/**
 * Premium cosmetics require the $3.99 unlock. Free = Overlay effects + Calm
 * gradients; premium = Liquid + Glowing + Animated & bold + the AI set. Change
 * the split later by editing this one function (or adding a per-cosmetic override).
 */
export function isPremiumCosmetic(c: Pick<Cosmetic, 'family' | 'id'>): boolean {
  if (ALL_COSMETICS_FREE) return false;
  return c.family === 'liquid' || c.family === 'glow' || c.family === 'flashy' || c.id.startsWith('ai-');
}
