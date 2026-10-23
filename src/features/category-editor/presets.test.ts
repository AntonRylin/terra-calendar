import { PRESET_GRADIENTS, PRESET_SOLID_COLORS, PREMIUM_DESIGNS, buildGallery, collapsedGallery, gradientValue } from './presets';

describe('presets', () => {
  it('has 11 preset gradients and 11 solid colors', () => {
    expect(PRESET_GRADIENTS).toHaveLength(11);
    expect(PRESET_SOLID_COLORS).toHaveLength(11);
  });

  it('buildGallery puts customs first, then presets, then premium', () => {
    const g = buildGallery('gradient', [{ name: 'Custom 1', color1: '#000000', color2: '#ffffff' }]);
    expect(g[0]).toMatchObject({ name: 'Custom 1', custom: true });
    expect(g.filter((d) => d.premium).length).toBe(PREMIUM_DESIGNS.length);
    expect(g.findIndex((d) => d.premium)).toBeGreaterThan(g.findIndex((d) => !d.custom && !d.premium));
  });

  it('collapsedGallery returns 11 non-premium designs, customs first', () => {
    const g = buildGallery('gradient', [{ name: 'Custom 1', color1: '#000000', color2: '#ffffff' }]);
    const c = collapsedGallery(g);
    expect(c).toHaveLength(11);
    expect(c.every((d) => !d.premium)).toBe(true);
    expect(c[0].custom).toBe(true);
  });

  it('solid mode maps colors to solid designs', () => {
    const g = buildGallery('color', []);
    expect(g).toHaveLength(11);
    expect(g[0]).toMatchObject({ kind: 'solid', value: PRESET_SOLID_COLORS[0] });
  });

  it('gradientValue builds the animated 3-stop value', () => {
    expect(gradientValue('#aa0000', '#00bb00')).toBe('linear-gradient(90deg, #aa0000, #00bb00, #aa0000)');
  });
});
