import type { DayCustomStyle } from '../app/specialDaysStore';
import { compileRawParts } from './dayCss';
import type { Cosmetic } from './cosmetics';

/** A gradient recipe saved from the day-background builder as a reusable style. */
export type GradientRecipe = Extract<DayCustomStyle, { kind: 'recipe' }>;

export interface CustomStyleTemplate {
  /** Stable cosmetic id, `custom-…` — stored on days/events like built-in ids. */
  id: string;
  name: string;
  /** The saved style: a builder gradient recipe or raw custom CSS. (Field name
   *  predates raw support and is kept for localStorage back-compat.) */
  recipe: DayCustomStyle;
}

export function newTemplateId(): string {
  return `custom-${crypto.randomUUID().slice(0, 8)}`;
}

/** The picker-facing cosmetic entry for a saved template. */
export function templateToCosmetic(t: CustomStyleTemplate): Cosmetic {
  return {
    id: t.id,
    name: t.name,
    kind: 'gradient',
    family: 'custom',
    swatch: templateSwatch(t.recipe),
  };
}

/** Representative colour: first recipe stop, or the first hex found in raw CSS. */
function templateSwatch(style: DayCustomStyle): string {
  const first =
    style.kind === 'recipe'
      ? sanitizeColors(style.colors)[0]
      : style.source.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/)?.[0];
  return first ?? '#888888';
}

/** Only plain hex colours survive — templates persist in localStorage, so treat
 *  them as untrusted when emitting CSS. */
function sanitizeColors(colors: string[]): string[] {
  return colors.filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(n) || lo));

/** Every host context a cosmetic class can land on (mirrors cosmetics.css). */
const HOSTS = ['.event-chip', '.span-seg', '.cosmetic-swatch', '.wv-block', '.wv-allday-bar', '.wv-ghost-solid'];

/**
 * Compile one saved template into global CSS that works everywhere cosmetics
 * do. Chip-safe by construction: `shift`/`rotate` animate background-position
 * and `pulse` animates brightness — never transforms, which would spin or
 * scale the host chip and its text (the day-background modal can afford
 * transforms only because it paints a dedicated `.day-fill` layer).
 */
export function compileTemplateCss(t: CustomStyleTemplate): string {
  const r = t.recipe;
  if (r.kind === 'raw') return compileRawTemplateCss(t.id, r.source);
  const colors = sanitizeColors(r.colors);
  if (colors.length < 2) return '';
  const angle = clamp(r.angle, 0, 360);
  const speed = clamp(r.speedSec, 1, 60);
  const stops = colors.join(', ');

  const bg =
    r.gradient === 'radial' ? `radial-gradient(circle at center, ${stops})`
    : r.gradient === 'conic' ? `conic-gradient(from ${angle}deg, ${stops})`
    : `linear-gradient(${angle}deg, ${stops})`;

  const cls = `cosmetic-${t.id}`;
  const kfName = `ccs-${t.id}`;

  let anim = '';
  let kf = '';
  if (r.animation === 'shift' || r.animation === 'rotate') {
    anim = ` background-size: 300% 300%; animation: ${kfName} ${speed}s ease infinite;`;
    kf = `@keyframes ${kfName}{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`;
  } else if (r.animation === 'pulse') {
    anim = ` animation: ${kfName} ${speed}s ease-in-out infinite;`;
    kf = `@keyframes ${kfName}{0%,100%{filter:brightness(0.92)}50%{filter:brightness(1.12)}}`;
  }

  const hostSelectors = HOSTS.map((h) => `${h}.${cls}`).join(', ');
  // Day tiles carry their own base background, so mirror the built-in day-tile
  // cosmetic rules (specialDay.css) and force the image over it.
  const dayTile = `.day-tile.${cls} { background-image: ${bg} !important;${anim} }`;
  return `${hostSelectors} { background-image: ${bg};${anim} }\n${dayTile}\n${kf}`.trim();
}

/**
 * Compile a saved raw-CSS template onto every cosmetic host. Runs through the
 * same sanitizer/namespacer as day-scoped custom CSS (dayCss.ts). Day tiles
 * carry their own base background, so — mirroring the recipe path's
 * `!important` — every declaration is forced on the `.day-tile` variant.
 */
function compileRawTemplateCss(id: string, source: string): string {
  const cls = `cosmetic-${id}`;
  const { decls, keyframes } = compileRawParts(source, cls);
  if (!decls) return '';
  const hostSelectors = HOSTS.map((h) => `${h}.${cls}`).join(', ');
  const forced = decls
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `${d} !important`)
    .join('; ');
  return `${hostSelectors} { ${decls} }\n.day-tile.${cls} { ${forced} }\n${keyframes}`.trim();
}

/** The combined stylesheet for every saved template. */
export function compileAllTemplatesCss(templates: CustomStyleTemplate[]): string {
  return templates.map(compileTemplateCss).filter(Boolean).join('\n');
}
