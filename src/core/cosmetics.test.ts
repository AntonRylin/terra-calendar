import { describe, it, expect } from 'vitest';
import {
  cosmeticById,
  cosmeticClass,
  resolveCosmetic,
  resolveEventLook,
  getMatchedEventStyle,
  cosmeticsByFamily,
  featuredCosmetics,
  COSMETICS,
  COSMETIC_FAMILIES,
  isPremiumCosmetic,
  ALL_COSMETICS_FREE,
} from './cosmetics';
import type { CategoryConfig } from '../app/settingsStore';

describe('cosmetics registry', () => {
  it('looks up known ids and ignores unknown/absent ones', () => {
    expect(cosmeticById('aurora')?.name).toBe('Aurora');
    expect(cosmeticById('nope')).toBeUndefined();
    expect(cosmeticById(undefined)).toBeUndefined();
  });

  it('maps ids to css classes, undefined for invalid', () => {
    expect(cosmeticClass('aurora')).toBe('cosmetic-aurora');
    expect(cosmeticClass('nope')).toBeUndefined();
    expect(cosmeticClass(undefined)).toBeUndefined();
  });

  it('gives gradient cosmetics a swatch and effects none', () => {
    const aurora = COSMETICS.find((c) => c.id === 'aurora')!;
    const shimmer = COSMETICS.find((c) => c.id === 'shimmer')!;
    expect(aurora.kind).toBe('gradient');
    expect(aurora.swatch).toBeTruthy();
    expect(shimmer.kind).toBe('effect');
    expect(shimmer.swatch).toBeUndefined();
  });
});

describe('cosmetic families', () => {
  it('assigns every cosmetic to a known family', () => {
    const ids = new Set(COSMETIC_FAMILIES.map((f) => f.id));
    for (const c of COSMETICS) {
      expect(ids.has(c.family)).toBe(true);
    }
  });

  it('groups in family order, covers every cosmetic exactly once, drops empty families', () => {
    const groups = cosmeticsByFamily();
    const order = groups.map((g) => g.family.id);
    // Order follows COSMETIC_FAMILIES (intensity order).
    expect(order).toEqual(COSMETIC_FAMILIES.map((f) => f.id).filter((id) =>
      COSMETICS.some((c) => c.family === id),
    ));
    const flat = groups.flatMap((g) => g.cosmetics);
    expect(flat).toHaveLength(COSMETICS.length);
    expect(new Set(flat.map((c) => c.id)).size).toBe(COSMETICS.length);
    expect(groups.every((g) => g.cosmetics.length > 0)).toBe(true);
  });

  it('features one representative per non-empty family in order', () => {
    const featured = featuredCosmetics();
    const expectedFamilies = cosmeticsByFamily().map((g) => g.family.id);
    expect(featured.map((c) => c.family)).toEqual(expectedFamilies);
  });

  it('includes the four AI gradients across the spectrum', () => {
    expect(cosmeticById('ai-aura')?.family).toBe('calm');
    expect(cosmeticById('ai-glow')?.family).toBe('glow');
    expect(cosmeticById('ai-spin')?.family).toBe('flashy');
    expect(cosmeticById('ai-prism')?.family).toBe('flashy');
  });
});

describe('resolveCosmetic', () => {
  const cats: Record<string, CategoryConfig> = {
    Harvard: { type: 'color', value: '#34c759', cosmetic: 'ocean' },
    Plain: { type: 'color', value: '#34c759' },
  };

  it('uses the event cosmetic when set', () => {
    expect(resolveCosmetic({ cosmetic: 'aurora', type: 'Harvard' }, cats)).toBe('aurora');
  });

  it('falls back to the category default', () => {
    expect(resolveCosmetic({ cosmetic: undefined, type: 'Harvard' }, cats)).toBe('ocean');
  });

  it('returns undefined with no event or category cosmetic', () => {
    expect(resolveCosmetic({ cosmetic: undefined, type: 'Plain' }, cats)).toBeUndefined();
    expect(resolveCosmetic({ cosmetic: undefined, type: undefined }, cats)).toBeUndefined();
    expect(resolveCosmetic({ cosmetic: undefined, type: 'Missing' }, cats)).toBeUndefined();
  });

  it('ignores a stale/unknown id', () => {
    expect(resolveCosmetic({ cosmetic: 'deleted-skin', type: undefined }, cats)).toBeUndefined();
  });
});

describe('isPremiumCosmetic', () => {
  // While the temporary free-for-all flag is on, the premium-split assertions
  // are skipped and the promo behaviour is asserted instead. Flipping
  // ALL_COSMETICS_FREE back to false re-activates the split tests unchanged.
  (ALL_COSMETICS_FREE ? it : it.skip)('treats every cosmetic as free during the free-for-all', () => {
    for (const c of COSMETICS) {
      expect(isPremiumCosmetic(c)).toBe(false);
    }
  });

  (ALL_COSMETICS_FREE ? it.skip : it)('treats effect and calm as free, liquid/glow/flashy/AI as premium', () => {
    expect(isPremiumCosmetic({ id: 'shimmer', family: 'effect' })).toBe(false);
    expect(isPremiumCosmetic({ id: 'stardust', family: 'effect' })).toBe(false);
    expect(isPremiumCosmetic({ id: 'aurora', family: 'calm' })).toBe(false);
    expect(isPremiumCosmetic({ id: 'lava-lamp', family: 'liquid' })).toBe(true);
    expect(isPremiumCosmetic({ id: 'neon-pulse', family: 'glow' })).toBe(true);
    expect(isPremiumCosmetic({ id: 'neon-rush', family: 'flashy' })).toBe(true);
  });

  (ALL_COSMETICS_FREE ? it.skip : it)('treats every AI cosmetic as premium regardless of family', () => {
    for (const id of ['ai-aura', 'ai-glow', 'ai-spin', 'ai-prism']) {
      const c = COSMETICS.find((x) => x.id === id)!;
      expect(isPremiumCosmetic(c)).toBe(true);
    }
  });
});

const matchedConfig: CategoryConfig = {
  type: 'gradient',
  value: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)',
  color1: '#00c6ff',
  color2: '#0072ff',
  matchEvents: true,
};
const cosmeticConfig: CategoryConfig = { type: 'color', value: '#0a84ff', color1: '#0a84ff', cosmetic: 'aurora' };

describe('resolveEventLook', () => {
  it('event own cosmetic beats everything', () => {
    expect(resolveEventLook({ cosmetic: 'aurora', type: 'Work' }, { Work: matchedConfig }))
      .toEqual({ kind: 'cosmetic', id: 'aurora' });
  });
  it('category cosmetic beats matchEvents (the animated style is the look)', () => {
    expect(resolveEventLook({ type: 'Work' }, { Work: { ...matchedConfig, cosmetic: 'aurora' } }))
      .toEqual({ kind: 'cosmetic', id: 'aurora' });
  });
  it('falls back to category cosmetic, then none', () => {
    expect(resolveEventLook({ type: 'Work' }, { Work: cosmeticConfig })).toEqual({ kind: 'cosmetic', id: 'aurora' });
    expect(resolveEventLook({ type: 'Work' }, {})).toEqual({ kind: 'none' });
  });
});

describe('getMatchedEventStyle', () => {
  it('gradient config yields an animated background image', () => {
    const s = getMatchedEventStyle(matchedConfig);
    expect(s.backgroundImage).toBe(matchedConfig.value);
    expect(s.backgroundSize).toBe('300% 100%');
  });
  it('solid config yields background color with contrast text', () => {
    const s = getMatchedEventStyle({ type: 'color', value: '#ffd60a', color1: '#ffd60a' });
    expect(s.backgroundColor).toBe('#ffd60a');
    expect(typeof s.color).toBe('string');
  });
});
