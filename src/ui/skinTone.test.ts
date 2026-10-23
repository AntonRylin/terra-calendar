import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COSMETICS } from '../core/cosmetics';

// Read as files, not `?raw` imports — vitest stubs CSS imports to empty modules.
function readCss(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const SKIN_TONE = readCss('./skinTone.css');
const SKIN_SOURCES = [
  { name: 'cosmetics.css', css: readCss('./cosmetics.css') },
  { name: 'specialDay.css', css: readCss('../features/special-day/specialDay.css') },
];

/** Selector lists (rule heads) in a stylesheet, comments stripped. */
function selectors(css: string): string[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) =>
    m[1].trim(),
  );
}

/**
 * Every element class that carries a cosmetic skin, discovered from the skin
 * stylesheets themselves (`.event-chip.cosmetic-aurora` → `event-chip`). A new
 * host added there must also be toned, or it keeps glaring in dark mode.
 *
 * The second class is checked against the cosmetic registry, so layout classes
 * that merely start with `cosmetic-` (`.sd-styles.cosmetic-options`, the
 * picker's grid) aren't mistaken for skinned surfaces.
 */
const COSMETIC_IDS = new Set(COSMETICS.map((c) => c.id));

function skinHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const { css } of SKIN_SOURCES) {
    for (const sel of selectors(css)) {
      for (const part of sel.split(',')) {
        const m = part.trim().match(/^\.([a-z][a-z0-9-]*)\.cosmetic-([a-z0-9-]+)/);
        if (m && COSMETIC_IDS.has(m[2])) hosts.add(m[1]);
      }
    }
  }
  return hosts;
}

/** The selector lists of skinTone.css rules that apply the dim. */
const toningSelectors = selectors(SKIN_TONE).filter((s) => s.includes("data-dim-skins='on'"));
const allToning = toningSelectors.join(', ');

describe('skinTone.css tones every decorative fill', () => {
  it('found the skin hosts to check', () => {
    expect(skinHosts().size).toBeGreaterThan(3);
  });

  it('covers every host that can carry a cosmetic skin', () => {
    for (const host of skinHosts()) {
      expect(allToning, `.${host} carries skins but is never toned`).toContain(`.${host}`);
    }
  });

  it('covers the backgrounds set outside the cosmetic- classes', () => {
    // Matched category gradients are inline styles, and image / custom-CSS day
    // backgrounds render into a .day-fill child — neither has a cosmetic- class.
    expect(allToning).toContain('.event-match-gradient');
    expect(allToning).toContain('.day-fill');
  });
});

describe('skinTone.css stays out of the way when it should', () => {
  it('applies only in the dark theme', () => {
    for (const sel of toningSelectors) {
      expect(sel, 'toning must be scoped to the dark theme').toContain("[data-theme='dark']");
    }
  });

  it('applies only while the setting is on', () => {
    // Both halves matter: the opt-out in Settings → Appearance is the escape
    // hatch for anyone who wants their skins at full strength.
    const gated = selectors(SKIN_TONE).filter((s) => s.includes("[data-theme='dark']"));
    for (const sel of gated) {
      // The :root token block declares the variables and is not itself a rule
      // that changes any surface.
      if (sel.trim() === ":root[data-theme='dark']") continue;
      expect(sel, 'toning must honour data-dim-skins').toContain("[data-dim-skins='on']");
    }
  });
});

describe('skinTone.css wins over the per-skin colours it replaces', () => {
  // Pale skins set their day number / label to a dark colour with !important,
  // picked against the undimmed fill. Those pairings invert once the fill is
  // dimmed, so the replacements must be !important too (specificity then
  // decides, and the toning selectors are longer).
  const textRules = [...SKIN_TONE.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /(^|\s|;)color:/.test(body))
    .filter(([, sel]) => sel.includes("data-dim-skins='on'"));

  it('has the text rules it needs', () => {
    expect(textRules.length).toBeGreaterThan(0);
  });

  it('forces both colour and text-shadow', () => {
    for (const [, sel, body] of textRules) {
      expect(body, `${sel}: colour must beat the per-skin !important`).toMatch(
        /color:[^;]*!important/,
      );
      expect(body, `${sel}: shadow must beat the per-skin !important`).toMatch(
        /text-shadow:[^;]*!important/,
      );
    }
  });

  it('forces the multiply colour past the `background` shorthands', () => {
    // AI Spin/Prism and raw custom styles set the `background` shorthand with
    // !important, which drags `background-color: transparent !important` along.
    for (const [, sel, body] of [
      ...SKIN_TONE.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ].filter(([, , b]) => b.includes('background-blend-mode'))) {
      expect(body, `${sel}: background-color must be !important`).toMatch(
        /background-color:[^;]*!important/,
      );
    }
  });
});

describe('matched category gradients keep their time prefix readable', () => {
  it('makes .event-time inherit instead of falling back to the accent', () => {
    // `.event-time` defaults to var(--event-color, accent); a gradient category
    // has no single colour, so the prefix landed accent-blue on the fill.
    expect(SKIN_TONE).toMatch(/\.event-match-gradient \.event-time\s*\{[^}]*color:\s*inherit/);
  });
});
