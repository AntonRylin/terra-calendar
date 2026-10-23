import { describe, it, expect } from 'vitest';
import { compileCustomStyle, decodeCssEscapes, sanitizeDeclarations } from './dayCss';

const scope = 'cd-x';

describe('compileCustomStyle — raw', () => {
  it('scopes declarations to the day class', () => {
    const css = compileCustomStyle({ kind: 'raw', source: 'background: red;' }, scope);
    expect(css).toContain('.cd-x{');
    expect(css).toContain('background: red');
  });

  it('extracts and namespaces @keyframes, rewriting the animation reference', () => {
    const src = 'background:blue; animation: g 5s ease infinite; @keyframes g { 50% { background-position: 100% 50% } }';
    const css = compileCustomStyle({ kind: 'raw', source: src }, scope);
    expect(css).toContain('@keyframes cd-x-g{');
    expect(css).toMatch(/animation:\s*cd-x-g 5s ease infinite/);
    expect(css).not.toMatch(/@keyframes g\b/);
  });

  it('strips position:fixed/sticky', () => {
    const css = compileCustomStyle({ kind: 'raw', source: 'position: fixed; background: red;' }, scope);
    expect(css).not.toContain('fixed');
    expect(css).toContain('background: red');
  });

  it('strips declarations containing url()', () => {
    const css = compileCustomStyle({ kind: 'raw', source: 'background: url(http://evil.test/x.png); color: blue;' }, scope);
    expect(css).not.toContain('url(');
    expect(css).toContain('color: blue');
  });

  it('strips @import, expression(), behavior, -moz-binding', () => {
    const css = compileCustomStyle({
      kind: 'raw',
      source: '@import url(x); width: expression(alert(1)); behavior: url(x); -moz-binding: url(x); background: green;',
    }, scope);
    expect(css).not.toMatch(/@import|expression\(|behavior:|-moz-binding/);
    expect(css).toContain('background: green');
  });

  it('caps very long input', () => {
    const long = 'color: red;'.repeat(2000);
    const css = compileCustomStyle({ kind: 'raw', source: long }, scope);
    expect(css.length).toBeLessThan(9000);
  });

  it('blocks url() hidden behind CSS escapes', () => {
    // \75 -> u, \28 -> (, \29 -> ) — all decode to url(...) which must be dropped.
    const vectors = [
      'background: \\75rl(https://evil.test/beacon)',
      'background: url\\28 https://evil.test/beacon\\29',
      'background: \\000075rl(https://evil.test/beacon)',
    ];
    for (const v of vectors) {
      const css = compileCustomStyle({ kind: 'raw', source: `${v}; color: blue;` }, scope);
      expect(css.toLowerCase()).not.toContain('evil.test');
      expect(css).toContain('color: blue');
    }
  });

  it('sanitizes url() smuggled inside a @keyframes step', () => {
    const src =
      'animation: g 5s infinite; @keyframes g { 0% { background: url(https://evil.test/x) } 100% { opacity: 1 } }';
    const css = compileCustomStyle({ kind: 'raw', source: src }, scope);
    expect(css.toLowerCase()).not.toContain('evil.test');
    expect(css).toContain('@keyframes cd-x-g{');
    expect(css).toContain('opacity: 1');
  });

  it('blocks other resource-loading functions (image-set, cross-fade)', () => {
    const css = compileCustomStyle({
      kind: 'raw',
      source: 'background: image-set(url(https://evil.test/a) 1x); border-image: cross-fade(url(https://evil.test/b), red); color: green;',
    }, scope);
    expect(css.toLowerCase()).not.toContain('evil.test');
    expect(css).toContain('color: green');
  });
});

describe('decodeCssEscapes', () => {
  it('decodes hex and literal escapes', () => {
    expect(decodeCssEscapes('\\75rl(')).toBe('url(');
    expect(decodeCssEscapes('url\\28 x\\29')).toBe('url(x)');
    expect(decodeCssEscapes('\\000075')).toBe('u');
  });
});

describe('sanitizeDeclarations', () => {
  it('keeps safe declarations verbatim', () => {
    expect(sanitizeDeclarations('color: red; background: blue')).toBe('color: red; background: blue');
  });
});

describe('compileCustomStyle — recipe', () => {
  it('builds a linear gradient with a shift animation + namespaced keyframes', () => {
    const css = compileCustomStyle({
      kind: 'recipe', gradient: 'linear', colors: ['#ee7752', '#23d5ab'], angle: 45,
      animation: 'shift', speedSec: 10,
    }, scope);
    expect(css).toContain('linear-gradient(45deg, #ee7752, #23d5ab)');
    expect(css).toContain('background-size: 200% 200%');
    expect(css).toMatch(/animation:\s*cd-x-move 10s/);
    expect(css).toContain('@keyframes cd-x-move{');
  });

  it('builds a conic gradient with rotate', () => {
    const css = compileCustomStyle({
      kind: 'recipe', gradient: 'conic', colors: ['#7b6cff', '#00e5ff'], angle: 0,
      animation: 'rotate', speedSec: 14,
    }, scope);
    expect(css).toContain('conic-gradient(from 0deg, #7b6cff, #00e5ff)');
    expect(css).toContain('@keyframes cd-x-spin{');
  });

  it('static recipe has no animation/keyframes', () => {
    const css = compileCustomStyle({
      kind: 'recipe', gradient: 'radial', colors: ['#a', '#b'], angle: 0, animation: 'none', speedSec: 8,
    }, scope);
    expect(css).not.toContain('@keyframes');
    expect(css).toContain('radial-gradient');
  });
});
