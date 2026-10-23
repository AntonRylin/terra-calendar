import { describe, it, expect, afterEach } from 'vitest';
import { compileTemplateCss, templateToCosmetic, type CustomStyleTemplate, type GradientRecipe } from './customStyles';
import { setCustomCosmetics, cosmeticById, cosmeticsByFamily, allCosmetics } from './cosmetics';

const template = (over: Partial<GradientRecipe> = {}): CustomStyleTemplate => ({
  id: 'custom-abc123',
  name: 'Sunset Mix',
  recipe: {
    kind: 'recipe', gradient: 'linear', colors: ['#ff0000', '#00ff00'],
    angle: 45, animation: 'shift', speedSec: 10, ...over,
  },
});

afterEach(() => setCustomCosmetics([]));

describe('compileTemplateCss', () => {
  it('emits rules for every cosmetic host context plus the day tile', () => {
    const css = compileTemplateCss(template());
    for (const host of ['.event-chip', '.span-seg', '.cosmetic-swatch', '.wv-block', '.wv-allday-bar', '.wv-ghost-solid']) {
      expect(css).toContain(`${host}.cosmetic-custom-abc123`);
    }
    expect(css).toContain('.day-tile.cosmetic-custom-abc123');
    expect(css).toContain('linear-gradient(45deg, #ff0000, #00ff00)');
    expect(css).toContain('@keyframes ccs-custom-abc123');
  });

  it('never animates transforms — pulse maps to brightness, shift/rotate to background-position', () => {
    expect(compileTemplateCss(template({ animation: 'pulse' }))).toContain('brightness');
    expect(compileTemplateCss(template({ animation: 'rotate' }))).toContain('background-position');
    expect(compileTemplateCss(template())).not.toContain('transform');
  });

  it('drops non-hex colours and requires at least two valid stops', () => {
    const css = compileTemplateCss(template({ colors: ['#ff0000', 'url(javascript:x)', '#0000ff'] }));
    expect(css).not.toContain('url(');
    expect(css).toContain('#ff0000, #0000ff');
    expect(compileTemplateCss(template({ colors: ['#ff0000', 'red'] }))).toBe('');
  });
});

describe('compileTemplateCss — raw CSS templates', () => {
  const raw = (source: string): CustomStyleTemplate => ({
    id: 'custom-raw1',
    name: 'My CSS',
    recipe: { kind: 'raw', source },
  });

  it('emits sanitized rules for every host plus a forced day-tile variant', () => {
    const css = compileTemplateCss(raw(
      'background: linear-gradient(45deg,#ff0000,#0000ff); animation: g 5s linear infinite;\n@keyframes g { 50% { background-position: 100% 50% } }',
    ));
    expect(css).toContain('.event-chip.cosmetic-custom-raw1');
    expect(css).toContain('.day-tile.cosmetic-custom-raw1');
    // day-tile variant forces every declaration over the tile's base background
    expect(css).toMatch(/\.day-tile\.cosmetic-custom-raw1 \{[^}]*!important/);
    // keyframes are namespaced to the cosmetic class
    expect(css).toContain('@keyframes cosmetic-custom-raw1-g');
    expect(css).toContain('animation: g 5s linear infinite'.replace('g', 'cosmetic-custom-raw1-g'));
  });

  it('strips unsafe declarations and returns empty when nothing survives', () => {
    expect(compileTemplateCss(raw('background: url(https://evil.example/x.png);'))).toBe('');
    const css = compileTemplateCss(raw('background: #ff0000; position: fixed;'));
    expect(css).toContain('background: #ff0000');
    expect(css).not.toContain('position: fixed');
  });

  it('picks the first hex colour in the source as the swatch', () => {
    expect(templateToCosmetic(raw('color: red; background: #123456;')).swatch).toBe('#123456');
    expect(templateToCosmetic(raw('color: red;')).swatch).toBe('#888888');
  });
});

describe('custom cosmetics registry', () => {
  it('registered templates resolve by id and group under the custom family first', () => {
    const t = template();
    setCustomCosmetics([templateToCosmetic(t)]);
    expect(cosmeticById('custom-abc123')?.name).toBe('Sunset Mix');
    expect(allCosmetics()[0].id).toBe('custom-abc123');
    const groups = cosmeticsByFamily();
    expect(groups[0].family.id).toBe('custom');
    expect(groups[0].cosmetics).toHaveLength(1);
  });

  it('unregistered ids degrade to undefined (plain look)', () => {
    expect(cosmeticById('custom-abc123')).toBeUndefined();
  });
});
