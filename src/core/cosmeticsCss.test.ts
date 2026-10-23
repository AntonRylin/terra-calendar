import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gradientValue, PRESET_GRADIENTS } from '../features/category-editor/presets';

// Read as files, not `?raw` imports — vitest stubs CSS imports to empty modules.
function readCss(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/**
 * Seamless-loop contract for the flowing cosmetic skins.
 *
 * Every gradient animated with `cos-flow` scrolls a tiled background image, so
 * it only loops without a visible jump when:
 *  - the gradient is 90deg (a slanted gradient never tiles horizontally — the
 *    tile seam shows as a hard diagonal edge sweeping across the chip), and
 *  - the first stop equals the last stop (the tile's right edge meets the next
 *    tile's left edge on the same colour), and
 *  - `background-size` is `300% 100%` (cos-flow scrolls to 300%, i.e. exactly
 *    two tile widths, so the cycle's last frame equals its first).
 */
const CSS_FILES = [
  { name: 'cosmetics.css', css: readCss('../ui/cosmetics.css') },
  { name: 'specialDay.css', css: readCss('../features/special-day/specialDay.css') },
];

interface Rule {
  selector: string;
  body: string;
}

/** Flat rule list; nested @keyframes bodies come out as harmless pseudo-rules. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(re)) {
    rules.push({ selector: m[1].trim(), body: m[2].trim() });
  }
  return rules;
}

/** Every `linear-gradient(...)` argument list in the body, parens balanced. */
function extractLinearGradients(body: string): string[] {
  const out: string[] = [];
  let idx = 0;
  for (;;) {
    const start = body.indexOf('linear-gradient(', idx);
    if (start === -1) break;
    let depth = 0;
    let i = start + 'linear-gradient'.length;
    for (; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')' && --depth === 0) break;
    }
    out.push(body.slice(start + 'linear-gradient('.length, i));
    idx = i;
  }
  return out;
}

/** Split on top-level commas only (color-mix()/var() args contain commas). */
function splitStops(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of args) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

/** Strip a stop's position ("#fff 20%" → "#fff") so wrap comparison is by colour. */
function stopColor(stop: string): string {
  return stop.replace(/\s+[\d.]+(%|px)$/, '');
}

function expectSeamlessGradient(args: string, context: string) {
  const stops = splitStops(args);
  expect(stops[0], `${context}: cos-flow gradients must be 90deg`).toBe('90deg');
  const colors = stops.slice(1);
  expect(colors.length, `${context}: gradient needs at least two stops`).toBeGreaterThanOrEqual(2);
  expect(
    stopColor(colors[colors.length - 1]),
    `${context}: first stop must repeat as last stop or the tile seam jumps`,
  ).toBe(stopColor(colors[0]));
}

for (const file of CSS_FILES) {
  describe(`${file.name} flowing gradients loop seamlessly`, () => {
    const flowing = parseRules(file.css).filter((r) => /animation:[^;]*\bcos-flow\b/.test(r.body));

    it('has flowing skins to check', () => {
      expect(flowing.length).toBeGreaterThan(0);
    });

    it('pairs cos-flow with the 300% tile it scrolls by', () => {
      for (const r of flowing) {
        expect(r.body, r.selector).toMatch(/background-size:\s*300% 100%/);
      }
    });

    it('uses only horizontally-tileable gradients (90deg, wrapped stops)', () => {
      for (const r of flowing) {
        const gradients = extractLinearGradients(r.body);
        expect(gradients.length, `${r.selector}: cos-flow without a gradient`).toBeGreaterThan(0);
        for (const g of gradients) expectSeamlessGradient(g, r.selector);
      }
    });
  });
}

describe('category gradients loop seamlessly', () => {
  // getMatchedEventStyle scrolls these with the same tiled-background technique
  // (.event-match-gradient), so they obey the same contract.
  it('gradientValue emits a 90deg wrapped gradient', () => {
    expectSeamlessGradient(
      extractLinearGradients(gradientValue('#111111', '#222222'))[0],
      'gradientValue',
    );
  });

  it('every preset gradient is 90deg and wrapped', () => {
    for (const p of PRESET_GRADIENTS) {
      expectSeamlessGradient(extractLinearGradients(p.value)[0], p.name);
    }
  });
});

/**
 * Every host that can carry an animated cosmetic must have a reduced-motion
 * escape hatch. Day tiles shipped without one for a while: cosmetics.css
 * covered chips, spans, swatches and week-view blocks, but the month grid's
 * tiles kept animating — dozens at a time on a styled recurring day.
 */
describe('animated cosmetics honour prefers-reduced-motion', () => {
  const ALL_CSS = CSS_FILES.map((f) => f.css).join('\n');

  /** The bodies of every `@media (prefers-reduced-motion: reduce)` block. */
  function reducedMotionBlocks(css: string): string {
    const out: string[] = [];
    const marker = 'prefers-reduced-motion';
    let idx = 0;
    for (;;) {
      const at = css.indexOf(marker, idx);
      if (at === -1) break;
      const open = css.indexOf('{', at);
      let depth = 0;
      let i = open;
      for (; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) break;
      }
      out.push(css.slice(open, i));
      idx = i;
    }
    return out.join('\n');
  }

  const reduced = reducedMotionBlocks(ALL_CSS);

  it.each([
    ['.day-tile', 'month grid'],
    ['.event-chip', 'month grid chips'],
    ['.span-seg', 'multi-day spans'],
    ['.cosmetic-swatch', 'style picker'],
    ['.wv-block', 'week view'],
  ])('turns animation off for %s (%s)', (selector) => {
    expect(reduced, `${selector} has no reduced-motion rule`).toContain(selector);
  });

  it('covers the matched-category drift, which has no cosmetic- class', () => {
    expect(reduced).toContain('.event-match-gradient');
  });

  it('disables the special-day particle overlays entirely', () => {
    // They exist only to move; left static they are just specks on the tile.
    expect(reduced).toMatch(/\.special-day-particles\s*\{\s*display:\s*none/);
  });
});
