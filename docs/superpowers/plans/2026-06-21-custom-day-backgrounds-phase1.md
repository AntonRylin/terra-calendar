# Custom Day Backgrounds — Phase 1 (Local Feature) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people set a custom image or custom CSS (pasted or built no-code) as a calendar day's background, alongside the existing preset cosmetics, rendered full-bleed with a legibility scrim — all working on one device.

**Architecture:** Extend the existing `SpecialDay` record with two optional background sources (`image`, `customStyle`). A pure resolver picks the one active background; a pure compiler turns custom CSS into a safe, day-scoped stylesheet; images are downscaled to WebP and cached in IndexedDB. `MonthGrid` paints a `.day-fill` + `.day-scrim` layer. A new "Day background" modal hosts Image / Builder / Code tabs.

**Tech Stack:** TypeScript, React 18, Zustand, Vite, Vitest (jsdom), IndexedDB, Canvas/WebP, `@tauri-apps/plugin-http`.

**Scope note:** This is Phase 1 of the [spec](../specs/2026-06-21-custom-day-backgrounds-design.md). Phase 2 (cross-device sync: `special_days` table, Supabase Storage, settings toggles) is a **separate plan**, written after Phase 1 lands. The data model here is already sync-ready (`updatedAt` field + repository-friendly shape).

**Before you start:** Work on a feature branch, not `main`:
```bash
git checkout -b feat/custom-day-backgrounds
```

**Test runner:** `npx vitest run <file>` for one file; `npm test` for all. Typecheck with `npx tsc --noEmit`.

## Design constraints (MUST follow for all UI in this plan)

The UI must look like the rest of the app — Apple-clean, minimal, themed.

- **Theme tokens only — never hardcode colors.** Use the variables from `src/ui/tokens.css`: `--color-surface`, `--color-bg`, `--color-text`, `--color-text-secondary`, `--color-text-faint`, `--color-border`, `--color-border-strong`, `--color-accent`, `--color-accent-soft`, `--color-muted-bg`, `--color-danger`; radii `--radius-sm|md|lg`; spacing `--space-1..5`; `--font-stack`; `--shadow-popover|modal`. These flip automatically under `:root[data-theme='dark']`, so **light and dark modes come for free** — there must be **zero** literal hex/rgb colors in the new CSS except the dark legibility scrim over photos (`.day-scrim`) and white text/`text-shadow` that sits on top of images.
- **Match existing idioms.** Mirror `specialDay.css`: tiny faint uppercase micro-labels (like `.sd-label`), segmented controls with a surface "thumb" (like `.sd-segment`), pill/icon buttons (`.sd-pill`, `.sd-icon-btn`). Reuse the existing `sd-panel-in` and `sheetBackdropIn` keyframes (global) for entrance animation.
- **No useless titles.** The special-day popover deliberately has no title/date. The studio modal has **no heading** — the tab labels (Image / Builder / Code) already say what it is. Drop any label where the control is self-evident; prefer subtle inline hints that double as state (e.g. `Angle 45°`, `Speed 10s`, placeholder text in the code box) — the way Apple labels a slider with its live value.
- **Keep it quiet.** Subtle borders, generous spacing, one accent color, gentle 120–160ms transitions. No heavy shadows or loud chrome.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/app/specialDaysStore.ts` | `SpecialDay` shape + `image`/`customStyle`/`updatedAt` + migration | Modify |
| `src/core/dayBackground.ts` | Pure resolver: which background is active + scope-class helper | Create |
| `src/core/dayCss.ts` | Pure compiler: `DayCustomStyle` → safe, scoped CSS string | Create |
| `src/data/dayImageStore.ts` | IndexedDB blob cache (put/get-url/delete/has) | Create |
| `src/features/day-background/imageImport.ts` | `fitWithin` (pure) + decode→downscale→WebP + source adapters | Create |
| `src/features/day-background/useDayImageUrls.ts` | Hook: resolve image refs → object URLs | Create |
| `src/features/day-background/DayCustomStyleSheet.tsx` | Inject one `<style>` for all custom-CSS days | Create |
| `src/features/day-background/DayBackgroundHost.tsx` | Modal: Image / Builder / Code tabs + live preview | Create |
| `src/features/day-background/dayBackground.css` | Modal + `.day-fill`/`.day-scrim` styles | Create |
| `src/app/uiStore.ts` | `dayBackground` overlay slot + open/close | Modify |
| `src/features/special-day/SpecialDayHost.tsx` | "Custom background…" button + mutual exclusivity | Modify |
| `src/features/month-grid/MonthGrid.tsx` | Render fill/scrim, stylesheet, image URLs | Modify |
| `src/features/month-grid/monthGrid.css` | z-index/stacking for fill/scrim/number | Modify |
| `src/App.tsx` | Mount `<DayBackgroundHost />` | Modify |

---

## Task 1: Extend the `SpecialDay` data model + migration

**Files:**
- Modify: `src/app/specialDaysStore.ts`
- Test: `src/app/specialDaysStore.test.ts`

- [ ] **Step 1: Write failing tests for the new fields + migration**

Add to `src/app/specialDaysStore.test.ts`:

```ts
import { normalizeSpecialDay } from './specialDaysStore';

describe('normalizeSpecialDay — custom backgrounds', () => {
  it('defaults new fields to undefined/empty on legacy records', () => {
    const sd = normalizeSpecialDay({ date: '2026-06-21', cosmetic: 'aurora', animations: [] });
    expect(sd.image).toBeUndefined();
    expect(sd.customStyle).toBeUndefined();
    expect(sd.updatedAt).toBe('');
  });

  it('carries through an image ref and a raw custom style', () => {
    const sd = normalizeSpecialDay({
      date: '2026-06-21', cosmetic: '', animations: [],
      image: { id: 'img1', w: 512, h: 384 },
      customStyle: { kind: 'raw', source: 'background:red;' },
      updatedAt: '2026-06-21T10:00:00.000Z',
    });
    expect(sd.image).toEqual({ id: 'img1', w: 512, h: 384 });
    expect(sd.customStyle).toEqual({ kind: 'raw', source: 'background:red;' });
    expect(sd.updatedAt).toBe('2026-06-21T10:00:00.000Z');
  });

  it('drops a malformed image ref (missing id)', () => {
    const sd = normalizeSpecialDay({ date: '2026-06-21', image: { w: 1, h: 1 } });
    expect(sd.image).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests; verify they fail**

Run: `npx vitest run src/app/specialDaysStore.test.ts`
Expected: FAIL (`image`/`customStyle`/`updatedAt` not on the returned object).

- [ ] **Step 3: Add the types + extend `normalizeSpecialDay`**

In `src/app/specialDaysStore.ts`, above `SpecialDay`:

```ts
export interface DayImageRef {
  id: string;   // key into the image store
  w: number;    // intrinsic px of the stored WebP
  h: number;
}

export type DayCustomStyle =
  | { kind: 'raw'; source: string }
  | {
      kind: 'recipe';
      gradient: 'linear' | 'radial' | 'conic';
      colors: string[];
      angle: number;
      animation: 'none' | 'shift' | 'rotate' | 'pulse';
      speedSec: number;
    };
```

Add to the `SpecialDay` interface:

```ts
  image?: DayImageRef;
  customStyle?: DayCustomStyle;
  updatedAt?: string; // ISO; '' when never written by the new code
```

In `normalizeSpecialDay`, before the `return`, add:

```ts
  const rawImage = raw?.image;
  const image: DayImageRef | undefined =
    rawImage && typeof rawImage.id === 'string'
      ? { id: rawImage.id, w: Number(rawImage.w) || 0, h: Number(rawImage.h) || 0 }
      : undefined;

  let customStyle: DayCustomStyle | undefined;
  if (raw?.customStyle?.kind === 'raw' && typeof raw.customStyle.source === 'string') {
    customStyle = { kind: 'raw', source: raw.customStyle.source };
  } else if (raw?.customStyle?.kind === 'recipe' && Array.isArray(raw.customStyle.colors)) {
    const r = raw.customStyle;
    customStyle = {
      kind: 'recipe',
      gradient: r.gradient ?? 'linear',
      colors: r.colors.filter((c: unknown) => typeof c === 'string'),
      angle: Number(r.angle) || 0,
      animation: r.animation ?? 'none',
      speedSec: Number(r.speedSec) || 8,
    };
  }
```

Then add to the returned object: `image,`, `customStyle,`, `updatedAt: raw?.updatedAt ?? '',`.

- [ ] **Step 4: Run the tests; verify they pass**

Run: `npx vitest run src/app/specialDaysStore.test.ts`
Expected: PASS (all, including the pre-existing migration tests).

- [ ] **Step 5: Stamp `updatedAt` on writes**

In `setSpecialDayInMemory`, set `updatedAt: new Date().toISOString()` on both the updated and new-record branches (so Phase 2 has ordering data). For the updated branch: `updated = existing.map(d => d.date === anchorDate ? { ...d, ...data, updatedAt: new Date().toISOString() } : d);`. For the new branch add `updatedAt: new Date().toISOString()` to `newDay`.

- [ ] **Step 6: Commit**

```bash
git add src/app/specialDaysStore.ts src/app/specialDaysStore.test.ts
git commit -m "feat: add image/customStyle/updatedAt to SpecialDay model"
```

---

## Task 2: Background resolver (`dayBackground.ts`)

**Files:**
- Create: `src/core/dayBackground.ts`
- Test: `src/core/dayBackground.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/dayBackground.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDayBackground, dayScopeClass } from './dayBackground';

const base = { id: 'rec1', cosmetic: '', animations: [] as string[] };

describe('resolveDayBackground', () => {
  it('returns none when nothing set', () => {
    expect(resolveDayBackground(base)).toEqual({ kind: 'none' });
  });
  it('returns cosmetic when only cosmetic set', () => {
    expect(resolveDayBackground({ ...base, cosmetic: 'aurora' })).toEqual({ kind: 'cosmetic', id: 'aurora' });
  });
  it('prefers customStyle over cosmetic', () => {
    const style = { kind: 'raw', source: 'background:red;' } as const;
    expect(resolveDayBackground({ ...base, cosmetic: 'aurora', customStyle: style }))
      .toEqual({ kind: 'css', style, scopeClass: 'cd-rec1' });
  });
  it('prefers image over everything', () => {
    const ref = { id: 'img1', w: 10, h: 10 };
    const got = resolveDayBackground({ ...base, cosmetic: 'aurora', image: ref });
    expect(got).toEqual({ kind: 'image', ref });
  });
  it('dayScopeClass is stable per record id', () => {
    expect(dayScopeClass('abc')).toBe('cd-abc');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/core/dayBackground.test.ts`
Expected: FAIL ("Cannot find module './dayBackground'").

- [ ] **Step 3: Implement**

`src/core/dayBackground.ts`:

```ts
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
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx vitest run src/core/dayBackground.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/dayBackground.ts src/core/dayBackground.test.ts
git commit -m "feat: add day background resolver"
```

---

## Task 3: Custom-CSS compiler — raw snippets (`dayCss.ts`)

**Files:**
- Create: `src/core/dayCss.ts`
- Test: `src/core/dayCss.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/dayCss.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compileCustomStyle } from './dayCss';

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
});
```

- [ ] **Step 2: Run; verify fail**

Run: `npx vitest run src/core/dayCss.test.ts`
Expected: FAIL ("Cannot find module './dayCss'").

- [ ] **Step 3: Implement the raw path**

`src/core/dayCss.ts`:

```ts
import type { DayCustomStyle } from '../app/specialDaysStore';

const MAX_CSS = 8000;

interface KeyframesBlock { name: string; inner: string }

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pull every @keyframes / @-webkit-keyframes block out of `source` (brace-
 *  counted), returning the remaining declaration text + the blocks found. */
export function extractKeyframes(source: string): { body: string; blocks: KeyframesBlock[] } {
  const blocks: KeyframesBlock[] = [];
  const lower = source.toLowerCase();
  let body = '';
  let i = 0;
  while (i < source.length) {
    const at = lower.indexOf('@keyframes', i);
    const atWk = lower.indexOf('@-webkit-keyframes', i);
    let next = -1;
    let kwLen = 0;
    if (at !== -1 && (atWk === -1 || at <= atWk)) { next = at; kwLen = '@keyframes'.length; }
    else if (atWk !== -1) { next = atWk; kwLen = '@-webkit-keyframes'.length; }
    if (next === -1) { body += source.slice(i); break; }
    body += source.slice(i, next);
    let j = next + kwLen;
    while (j < source.length && /\s/.test(source[j])) j++;
    let name = '';
    while (j < source.length && /[\w-]/.test(source[j])) { name += source[j]; j++; }
    while (j < source.length && source[j] !== '{') j++;
    if (source[j] !== '{') { i = j; continue; }
    let depth = 0;
    let inner = '';
    let k = j;
    for (; k < source.length; k++) {
      const ch = source[k];
      if (ch === '{') { depth++; if (depth === 1) continue; }
      if (ch === '}') { depth--; if (depth === 0) { k++; break; } }
      inner += ch;
    }
    if (name) blocks.push({ name, inner: inner.trim() });
    i = k;
  }
  return { body, blocks };
}

/** Drop unsafe declarations (split on ';'). Values containing ';' (rare) are a
 *  known limitation; url()-bearing decls are removed wholesale. */
export function sanitizeDeclarations(decls: string): string {
  const noComments = decls.replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = noComments.split(';').map((s) => s.trim()).filter(Boolean);
  const safe = parts.filter((decl) => {
    const lower = decl.toLowerCase();
    if (lower.startsWith('@import')) return false;
    if (lower.includes('url(')) return false;
    if (lower.includes('expression(')) return false;
    if (/^position\s*:\s*(fixed|sticky)/.test(lower)) return false;
    if (/^behavior\s*:/.test(lower)) return false;
    if (/^-moz-binding\s*:/.test(lower)) return false;
    return true;
  });
  return safe.join('; ');
}

/** Within animation/animation-name declarations only, rename keyframes refs. */
function namespaceAnimations(decls: string, blocks: KeyframesBlock[], scope: string): string {
  if (blocks.length === 0) return decls;
  return decls
    .split(';')
    .map((part) => {
      const t = part.trim();
      const lower = t.toLowerCase();
      if (!lower.startsWith('animation:') && !lower.startsWith('animation-name:')) return t;
      let out = t;
      for (const b of blocks) {
        out = out.replace(new RegExp('\\b' + escapeRe(b.name) + '\\b', 'g'), `${scope}-${b.name}`);
      }
      return out;
    })
    .filter(Boolean)
    .join('; ');
}

function emit(decls: string, blocks: KeyframesBlock[], scope: string): string {
  const safe = sanitizeDeclarations(decls).slice(0, MAX_CSS);
  const namespaced = namespaceAnimations(safe, blocks, scope);
  const kf = blocks.map((b) => `@keyframes ${scope}-${b.name}{${b.inner}}`).join('\n');
  return `.${scope}{${namespaced}}\n${kf}`.trim();
}

/** Compile a DayCustomStyle into a safe, day-scoped <style> body. */
export function compileCustomStyle(style: DayCustomStyle, scopeClass: string): string {
  if (style.kind === 'raw') {
    const { body, blocks } = extractKeyframes(style.source);
    return emit(body, blocks, scopeClass);
  }
  // recipe handled in Task 4
  return '';
}
```

- [ ] **Step 4: Run; verify pass**

Run: `npx vitest run src/core/dayCss.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/dayCss.ts src/core/dayCss.test.ts
git commit -m "feat: add scoped+sanitized custom-CSS compiler (raw)"
```

---

## Task 4: Custom-CSS compiler — no-code recipe

**Files:**
- Modify: `src/core/dayCss.ts`
- Test: `src/core/dayCss.test.ts`

- [ ] **Step 1: Add failing recipe tests**

Append to `src/core/dayCss.test.ts`:

```ts
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
```

- [ ] **Step 2: Run; verify the new recipe tests fail**

Run: `npx vitest run src/core/dayCss.test.ts`
Expected: FAIL (recipe currently returns `''`).

- [ ] **Step 3: Implement `recipeToParts` and wire it in**

In `src/core/dayCss.ts`, add before `compileCustomStyle`:

```ts
function recipeToParts(r: Extract<DayCustomStyle, { kind: 'recipe' }>): { decls: string; blocks: KeyframesBlock[] } {
  const stops = r.colors.join(', ');
  let bg: string;
  if (r.gradient === 'linear') bg = `linear-gradient(${r.angle}deg, ${stops})`;
  else if (r.gradient === 'radial') bg = `radial-gradient(circle at center, ${stops})`;
  else bg = `conic-gradient(from ${r.angle}deg, ${stops})`;

  let decls = `background: ${bg};`;
  const blocks: KeyframesBlock[] = [];
  const s = Math.max(1, Number(r.speedSec) || 8);

  if (r.animation === 'shift') {
    decls += ` background-size: 200% 200%; animation: move ${s}s ease infinite;`;
    blocks.push({ name: 'move', inner: '0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}' });
  } else if (r.animation === 'rotate') {
    decls += ` animation: spin ${s}s linear infinite;`;
    blocks.push({ name: 'spin', inner: 'from{transform:rotate(0deg) scale(1.8)}to{transform:rotate(360deg) scale(1.8)}' });
  } else if (r.animation === 'pulse') {
    decls += ` animation: pulse ${s}s ease-in-out infinite;`;
    blocks.push({ name: 'pulse', inner: '0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.12);opacity:1}' });
  }
  return { decls, blocks };
}
```

Replace the `// recipe handled in Task 4` branch in `compileCustomStyle`:

```ts
  const { decls, blocks } = recipeToParts(style);
  return emit(decls, blocks, scopeClass);
```

- [ ] **Step 4: Run; verify pass**

Run: `npx vitest run src/core/dayCss.test.ts`
Expected: PASS (raw + recipe).

- [ ] **Step 5: Commit**

```bash
git add src/core/dayCss.ts src/core/dayCss.test.ts
git commit -m "feat: compile no-code recipe gradients to scoped CSS"
```

---

## Task 5: Image import — downscale math (`fitWithin`)

**Files:**
- Create: `src/features/day-background/imageImport.ts`
- Test: `src/features/day-background/imageImport.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/day-background/imageImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fitWithin, MAX_EDGE } from './imageImport';

describe('fitWithin', () => {
  it('does not upscale small images', () => {
    expect(fitWithin(100, 80, 512)).toEqual({ w: 100, h: 80 });
  });
  it('scales a wide image so the long edge == max', () => {
    expect(fitWithin(2048, 1024, 512)).toEqual({ w: 512, h: 256 });
  });
  it('scales a tall image so the long edge == max', () => {
    expect(fitWithin(1000, 4000, 512)).toEqual({ w: 128, h: 512 });
  });
  it('MAX_EDGE is exported and sane', () => {
    expect(MAX_EDGE).toBeGreaterThanOrEqual(256);
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `npx vitest run src/features/day-background/imageImport.test.ts`
Expected: FAIL ("Cannot find module './imageImport'").

- [ ] **Step 3: Implement `fitWithin` + constants (only the pure part for now)**

`src/features/day-background/imageImport.ts`:

```ts
export const MAX_EDGE = 512;
export const WEBP_QUALITY = 0.82;

/** Scale (w,h) so the longer edge is at most `max`, preserving aspect; never
 *  upscales. Returns whole pixels. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
```

- [ ] **Step 4: Run; verify pass**

Run: `npx vitest run src/features/day-background/imageImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the browser-only import pipeline (no unit test — jsdom lacks canvas/createImageBitmap; verified manually in Task 11)**

Append to `src/features/day-background/imageImport.ts`:

```ts
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Decode → downscale → re-encode WebP. Returns the WebP blob + its px size. */
export async function processImage(input: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(input);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('WebP encode failed'))), 'image/webp', WEBP_QUALITY),
  );
  return { blob, w, h };
}

/** Fetch image bytes from a URL. Uses the Tauri HTTP plugin to avoid CORS
 *  canvas-tainting; falls back to fetch() on web. */
export async function blobFromUrl(url: string): Promise<Blob> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return new Blob([await res.arrayBuffer()]);
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.blob();
}

/** Pull the first image File out of a clipboard/drag event's items. */
export function imageFileFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  const file = Array.from(dt.files).find((f) => f.type.startsWith('image/'));
  return file ?? null;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/day-background/imageImport.ts src/features/day-background/imageImport.test.ts
git commit -m "feat: image import pipeline (downscale + WebP) and source adapters"
```

---

## Task 6: Image blob store (IndexedDB)

**Files:**
- Create: `src/data/dayImageStore.ts`

*(No unit test — jsdom has no IndexedDB; verified manually in Task 11. Keep the module thin.)*

- [ ] **Step 1: Implement the store**

`src/data/dayImageStore.ts`:

```ts
const DB_NAME = 'open-calendar';
const STORE = 'day-images';
const urlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export interface StoredImage { blob: Blob; w: number; h: number }

/** Store a WebP blob under a fresh id; returns the ref to persist on the day. */
export async function putImage(blob: Blob, w: number, h: number): Promise<{ id: string; w: number; h: number }> {
  const id = crypto.randomUUID();
  await tx('readwrite', (s) => s.put({ blob, w, h } satisfies StoredImage, id));
  return { id, w, h };
}

/** A cached object URL for an image id, or null if it isn't stored. */
export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = (await tx<StoredImage | undefined>('readonly', (s) => s.get(id))) ?? null;
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export async function hasImage(id: string): Promise<boolean> {
  const count = await tx<number>('readonly', (s) => s.count(id));
  return count > 0;
}

export async function deleteImage(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
  await tx('readwrite', (s) => s.delete(id));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/dayImageStore.ts
git commit -m "feat: IndexedDB image blob store"
```

---

## Task 7: UI store — `dayBackground` overlay slot

**Files:**
- Modify: `src/app/uiStore.ts`

- [ ] **Step 1: Add the slot, target type, opener, and close wiring**

In `src/app/uiStore.ts`:

1. Add a target interface near `SpecialDayEditorTarget`:
```ts
export interface DayBackgroundTarget {
  date: string;
}
```
2. In `interface UiState`, add field `dayBackground: DayBackgroundTarget | null;` and method `openDayBackground(date: string): void;`.
3. In the store object, add initial `dayBackground: null,`.
4. Add the opener (closes other overlays, like the rest):
```ts
  openDayBackground: (date) => set({ dayBackground: { date }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, highlightedEvent: null }),
```
5. Add `dayBackground: null,` to the object set inside `closeOverlays()`.
6. Add `dayBackground: null,` to the reset object in **every** other `open*` action (so opening another overlay closes this one), matching the existing pattern.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/uiStore.ts
git commit -m "feat: add dayBackground overlay slot to uiStore"
```

---

## Task 8: Render fill + scrim + custom stylesheet in the grid

**Files:**
- Create: `src/features/day-background/useDayImageUrls.ts`
- Create: `src/features/day-background/DayCustomStyleSheet.tsx`
- Create: `src/features/day-background/dayBackground.css`
- Modify: `src/features/month-grid/MonthGrid.tsx`
- Modify: `src/features/month-grid/monthGrid.css`

- [ ] **Step 1: Image-URL hook**

`src/features/day-background/useDayImageUrls.ts`:

```ts
import { useEffect, useState } from 'react';
import type { SpecialDay } from '../../app/specialDaysStore';
import { getImageUrl } from '../../data/dayImageStore';

/** Resolve every day-image ref in `specialDays` to a cached object URL. Returns
 *  a map of imageId → url (entries appear as they resolve). */
export function useDayImageUrls(specialDays: SpecialDay[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(specialDays.map((d) => d.image?.id).filter((id): id is string => !!id)));
    Promise.all(
      ids.map(async (id) => {
        const url = await getImageUrl(id);
        return [id, url] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of pairs) if (url) next[id] = url;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [specialDays]);

  return urls;
}
```

- [ ] **Step 2: Custom-stylesheet component**

`src/features/day-background/DayCustomStyleSheet.tsx`:

```tsx
import { useMemo } from 'react';
import type { SpecialDay } from '../../app/specialDaysStore';
import { dayScopeClass } from '../../core/dayBackground';
import { compileCustomStyle } from '../../core/dayCss';

/** One <style> element holding the compiled, scoped CSS for every day that uses
 *  a custom style. De-duped by record id (recurring days reuse one rule). */
export function DayCustomStyleSheet({ specialDays }: { specialDays: SpecialDay[] }) {
  const css = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of specialDays) {
      if (!d.customStyle || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(compileCustomStyle(d.customStyle, dayScopeClass(d.id)));
    }
    return out.join('\n');
  }, [specialDays]);

  if (!css) return null;
  return <style data-day-custom-css>{css}</style>;
}
```

- [ ] **Step 3: Fill/scrim CSS**

`src/features/day-background/dayBackground.css`:

```css
.day-fill {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  overflow: hidden;
  contain: paint;       /* clip any custom transform/size to the tile */
  pointer-events: none;
}
.day-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.05) 34%,
    rgba(0, 0, 0, 0) 58%,
    rgba(0, 0, 0, 0.42) 100%
  );
}
@media (prefers-reduced-motion: reduce) {
  .day-fill { animation: none !important; }
  .day-fill * { animation: none !important; }
}
```

- [ ] **Step 4: Stacking rules in `monthGrid.css`**

Append to `src/features/month-grid/monthGrid.css`:

```css
/* Custom image / CSS backgrounds sit behind the day's content. */
.day-tile.is-custom-bg .day-number { position: relative; z-index: 3; }
.day-tile.is-custom-bg .day-number { color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9); }
.day-tile.is-custom-bg .special-day-particles { z-index: 2; }
.day-tile.is-custom-bg .event-chip,
.day-tile.is-custom-bg .span-seg { position: relative; z-index: 3; }
```

- [ ] **Step 5: Wire into `MonthGrid.tsx`**

Add imports near the existing cosmetics import (top of file):
```ts
import { resolveDayBackground } from '../../core/dayBackground';
import { useDayImageUrls } from '../day-background/useDayImageUrls';
import { DayCustomStyleSheet } from '../day-background/DayCustomStyleSheet';
import '../day-background/dayBackground.css';
```

Inside the component, near the other special-days hooks (around line 408), add:
```ts
const dayImageUrls = useDayImageUrls(specialDays);
```

Render the stylesheet once. Find the top-level grid container returned by the component (the scroll/grid wrapper) and add as its first child:
```tsx
<DayCustomStyleSheet specialDays={specialDays} />
```

Replace the `specialCosmeticClass` IIFE (lines ~1115–1121) with a background-aware version, and add a custom-bg flag:
```ts
    const bg = specialDay
      ? resolveDayBackground(specialDay)
      : ({ kind: 'none' } as ReturnType<typeof resolveDayBackground>);
    const specialCosmeticClass =
      bg.kind === 'cosmetic'
        ? (() => {
            const c = cosmeticById(bg.id);
            if (!c) return '';
            const cls = cosmeticClass(bg.id);
            return cls ? ` ${cls} cosmetic-${c.kind}` : '';
          })()
        : '';
    const customBgClass = bg.kind === 'image' || bg.kind === 'css' ? ' is-custom-bg' : '';
```

Add `customBgClass` into the tile `className` (right after `specialCosmeticClass`):
```ts
          specialCosmeticClass +
          customBgClass +
          specialAnimationClass
```

Insert the fill + scrim as the FIRST children of the tile `<div>`, immediately before `<span className="day-number">` (line ~1190):
```tsx
        {bg.kind === 'image' && dayImageUrls[bg.ref.id] && (
          <div className="day-fill" aria-hidden="true" style={{ backgroundImage: `url("${dayImageUrls[bg.ref.id]}")` }} />
        )}
        {bg.kind === 'css' && <div className={`day-fill ${bg.scopeClass}`} aria-hidden="true" />}
        {(bg.kind === 'image' || bg.kind === 'css') && <div className="day-scrim" aria-hidden="true" />}
```

- [ ] **Step 6: Typecheck + run full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; all tests pass (including pre-existing `MonthGrid.test.tsx`).

- [ ] **Step 7: Commit**

```bash
git add src/features/day-background/useDayImageUrls.ts src/features/day-background/DayCustomStyleSheet.tsx src/features/day-background/dayBackground.css src/features/month-grid/MonthGrid.tsx src/features/month-grid/monthGrid.css
git commit -m "feat: render custom image/CSS day backgrounds in the month grid"
```

---

## Task 9: The "Day background" studio modal

**Files:**
- Create: `src/features/day-background/DayBackgroundHost.tsx`
- Modify: `src/features/day-background/dayBackground.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build the modal**

`src/features/day-background/DayBackgroundHost.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../../app/uiStore';
import { useSpecialDaysStore, type DayCustomStyle } from '../../app/specialDaysStore';
import { dayScopeClass } from '../../core/dayBackground';
import { compileCustomStyle } from '../../core/dayCss';
import { processImage, blobFromUrl, imageFileFromDataTransfer } from './imageImport';
import { putImage, deleteImage, getImageUrl } from '../../data/dayImageStore';
import './dayBackground.css';

type Tab = 'image' | 'builder' | 'code';

const DEFAULT_RECIPE: Extract<DayCustomStyle, { kind: 'recipe' }> = {
  kind: 'recipe', gradient: 'linear', colors: ['#ee7752', '#e73c7e', '#23a6d5'], angle: 45,
  animation: 'shift', speedSec: 10,
};

export function DayBackgroundHost() {
  const target = useUiStore((s) => s.dayBackground);
  if (!target) return null;
  return <DayBackgroundModal key={target.date} date={target.date} />;
}

function DayBackgroundModal({ date }: { date: string }) {
  const close = useUiStore((s) => s.closeOverlays);
  const { specialDays, setSpecialDayInMemory, commit } = useSpecialDaysStore();
  const existing = specialDays.find((d) => d.date === date);

  const [tab, setTab] = useState<Tab>(existing?.image ? 'image' : existing?.customStyle?.kind === 'raw' ? 'code' : 'builder');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [recipe, setRecipe] = useState(
    existing?.customStyle?.kind === 'recipe' ? existing.customStyle : DEFAULT_RECIPE,
  );
  const [code, setCode] = useState(existing?.customStyle?.kind === 'raw' ? existing.customStyle.source : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Resolve an existing image for preview.
  useEffect(() => {
    if (existing?.image) getImageUrl(existing.image.id).then(setImageUrl);
  }, [existing?.image?.id]);

  // Commit on close.
  useEffect(() => () => commit(), [commit]);

  /** Persist a background source, clearing the others (mutual exclusivity). */
  const apply = (patch: { image?: any; customStyle?: DayCustomStyle | undefined; cosmetic?: string }) => {
    setSpecialDayInMemory(date, {
      cosmetic: patch.cosmetic ?? '',
      animations: existing?.animations ?? [],
      emoji: existing?.emoji ?? '',
      recurrence: existing?.recurrence ?? 'none',
      image: patch.image,
      customStyle: patch.customStyle,
    });
  };

  const ingest = async (blob: Blob) => {
    setBusy(true); setError('');
    try {
      const { blob: webp, w, h } = await processImage(blob);
      if (existing?.image) await deleteImage(existing.image.id);
      const ref = await putImage(webp, w, h);
      setImageUrl(await getImageUrl(ref.id));
      apply({ image: ref, customStyle: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load image');
    } finally {
      setBusy(false);
    }
  };

  const previewCss = useMemo(() => {
    const style: DayCustomStyle = tab === 'code' ? { kind: 'raw', source: code } : recipe;
    return compileCustomStyle(style, 'cd-preview');
  }, [tab, code, recipe]);

  return (
    <div className="dbg-backdrop" onClick={close}>
      <div className="dbg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dbg-tabs">
          {(['image', 'builder', 'code'] as Tab[]).map((t) => (
            <button key={t} className={`dbg-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t === 'image' ? '🖼 Image' : t === 'builder' ? '🎚 Builder' : '⟨⟩ Code'}
            </button>
          ))}
          <button className="dbg-close" onClick={close} aria-label="Done">✕</button>
        </div>

        {/* Live preview */}
        {tab !== 'image' && <style>{previewCss}</style>}
        <div className="dbg-preview">
          {tab === 'image' && imageUrl && (
            <div className="day-fill" style={{ backgroundImage: `url("${imageUrl}")` }} />
          )}
          {tab !== 'image' && <div className="day-fill cd-preview" />}
          <div className="day-scrim" />
          <span className="dbg-prev-num">{Number(date.slice(8, 10))}</span>
        </div>

        {error && <p className="dbg-error">{error}</p>}

        {tab === 'image' && (
          <ImageTab busy={busy} hasImage={!!existing?.image} onIngest={ingest}
            onRemove={async () => { if (existing?.image) await deleteImage(existing.image.id); setImageUrl(null); apply({ image: undefined, customStyle: undefined }); }} />
        )}
        {tab === 'builder' && (
          <BuilderTab recipe={recipe} onChange={(r) => { setRecipe(r); apply({ customStyle: r, image: undefined }); }} />
        )}
        {tab === 'code' && (
          <CodeTab code={code} onChange={(c) => { setCode(c); apply({ customStyle: c ? { kind: 'raw', source: c } : undefined, image: undefined }); }} />
        )}
      </div>
    </div>
  );
}

function ImageTab({ busy, hasImage, onIngest, onRemove }: {
  busy: boolean; hasImage: boolean; onIngest: (b: Blob) => void; onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  return (
    <div className="dbg-body"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = imageFileFromDataTransfer(e.dataTransfer); if (f) onIngest(f); }}
      onPaste={(e) => { const f = imageFileFromDataTransfer(e.clipboardData); if (f) onIngest(f); }}
    >
      <div className="dbg-drop">{busy ? 'Processing…' : 'Drag & drop a photo here, or paste (Ctrl+V)'}</div>
      <div className="dbg-row">
        <button onClick={() => fileRef.current?.click()}>📁 Choose file</button>
        {hasImage && <button onClick={onRemove}>🗑 Remove</button>}
      </div>
      <div className="dbg-row">
        <input className="dbg-input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button disabled={!url} onClick={async () => onIngest(await blobFromUrl(url))}>🔗 Load URL</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onIngest(f); }} />
    </div>
  );
}

function BuilderTab({ recipe, onChange }: {
  recipe: Extract<DayCustomStyle, { kind: 'recipe' }>;
  onChange: (r: Extract<DayCustomStyle, { kind: 'recipe' }>) => void;
}) {
  const set = (patch: Partial<typeof recipe>) => onChange({ ...recipe, ...patch });
  return (
    <div className="dbg-body">
      <label className="dbg-lab">Type</label>
      <div className="dbg-seg">
        {(['linear', 'radial', 'conic'] as const).map((g) => (
          <button key={g} className={recipe.gradient === g ? 'on' : ''} onClick={() => set({ gradient: g })}>{g}</button>
        ))}
      </div>
      <label className="dbg-lab">Colors</label>
      <div className="dbg-colors">
        {recipe.colors.map((c, i) => (
          <input key={i} type="color" value={c}
            onChange={(e) => set({ colors: recipe.colors.map((x, j) => (j === i ? e.target.value : x)) })} />
        ))}
        {recipe.colors.length < 5 && <button onClick={() => set({ colors: [...recipe.colors, '#ffffff'] })}>+</button>}
        {recipe.colors.length > 2 && <button onClick={() => set({ colors: recipe.colors.slice(0, -1) })}>−</button>}
      </div>
      <label className="dbg-lab">Angle: {recipe.angle}°</label>
      <input type="range" min={0} max={360} value={recipe.angle} onChange={(e) => set({ angle: Number(e.target.value) })} />
      <label className="dbg-lab">Animation</label>
      <div className="dbg-seg">
        {(['none', 'shift', 'rotate', 'pulse'] as const).map((a) => (
          <button key={a} className={recipe.animation === a ? 'on' : ''} onClick={() => set({ animation: a })}>{a}</button>
        ))}
      </div>
      <label className="dbg-lab">Speed: {recipe.speedSec}s</label>
      <input type="range" min={1} max={30} value={recipe.speedSec} onChange={(e) => set({ speedSec: Number(e.target.value) })} />
    </div>
  );
}

function CodeTab({ code, onChange }: { code: string; onChange: (c: string) => void }) {
  // No label — the placeholder shows the expected shape; the note states the guarantees.
  return (
    <div className="dbg-body">
      <textarea className="dbg-code" value={code} spellCheck={false}
        placeholder={'background: linear-gradient(-45deg,#ee7752,#23d5ab);\nbackground-size: 400% 400%;\nanimation: g 12s ease infinite;\n\n@keyframes g { 50% { background-position: 100% 50% } }'}
        onChange={(e) => onChange(e.target.value)} />
      <p className="dbg-note">✓ Scoped to this day · @keyframes auto-renamed · remote url() &amp; layout-escape stripped</p>
    </div>
  );
}
```

- [ ] **Step 2: Add modal CSS**

Append to `src/features/day-background/dayBackground.css`:

All colors come from theme tokens, so light/dark are automatic. Reuses the
global `sheetBackdropIn` (popover.css) + `sd-panel-in` (specialDay.css) keyframes.

```css
/* Day-background studio — themed via tokens, mirrors the app's popover idiom. */
.dbg-backdrop {
  position: fixed; inset: 0; z-index: 400;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  animation: sheetBackdropIn 0.2s ease forwards;
}
.dbg-modal {
  width: 440px; max-width: 92vw; max-height: 88vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--space-3);
  background: var(--color-surface); color: var(--color-text);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  padding: var(--space-3);
  font-family: var(--font-stack);
  animation: sd-panel-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dbg-tabs { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: var(--space-1); align-items: center; }
.dbg-tab {
  padding: 7px 0; border: none; border-radius: var(--radius-sm);
  background: transparent; color: var(--color-text-secondary);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.dbg-tab:hover { background: var(--color-muted-bg); color: var(--color-text); }
.dbg-tab.on { background: var(--color-muted-bg); color: var(--color-text); font-weight: 600; }
.dbg-close {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%; background: transparent;
  color: var(--color-text-secondary); font-size: 15px; cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.dbg-close:hover { background: var(--color-muted-bg); color: var(--color-text); }

.dbg-preview {
  position: relative; height: 132px; overflow: hidden;
  border-radius: var(--radius-md); background: var(--color-muted-bg);
}
.dbg-prev-num {
  position: absolute; top: var(--space-2); left: var(--space-3); z-index: 3;
  font-weight: 700; font-size: 15px; color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

.dbg-body { display: flex; flex-direction: column; gap: var(--space-2); }
.dbg-lab {
  font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--color-text-faint); margin-top: var(--space-2);
}

/* Segmented control — mirrors .sd-segment (surface "thumb" on muted track). */
.dbg-seg {
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px;
  padding: 3px; background: var(--color-muted-bg); border-radius: var(--radius-md);
}
.dbg-seg button {
  border: none; background: transparent; padding: 6px 0;
  border-radius: calc(var(--radius-md) - 3px);
  font-size: 12px; font-weight: 500; color: var(--color-text-secondary);
  cursor: pointer; text-transform: capitalize;
  transition: background 140ms ease, color 140ms ease;
}
.dbg-seg button.on {
  background: var(--color-surface); color: var(--color-accent); font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.dbg-colors { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.dbg-colors input[type='color'] {
  width: 32px; height: 32px; padding: 0; cursor: pointer;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: none;
}
.dbg-colors button {
  width: 32px; height: 32px; font-size: 16px; cursor: pointer;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: var(--color-surface); color: var(--color-text-secondary);
}

input[type='range'] { accent-color: var(--color-accent); }

.dbg-row { display: flex; gap: var(--space-2); align-items: center; }
.dbg-row button {
  padding: 7px 12px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm);
  background: var(--color-surface); color: var(--color-text);
  transition: background 120ms ease;
}
.dbg-row button:hover:not(:disabled) { background: var(--color-muted-bg); }
.dbg-row button:disabled { opacity: 0.4; cursor: default; }
.dbg-input {
  flex: 1; padding: 7px 10px; font-size: 13px;
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: var(--color-bg); color: var(--color-text);
}
.dbg-drop {
  padding: var(--space-5); text-align: center; font-size: 12px; color: var(--color-text-secondary);
  border: 1.5px dashed var(--color-border-strong); border-radius: var(--radius-md);
}
.dbg-code {
  width: 100%; min-height: 120px; box-sizing: border-box; resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  padding: var(--space-2); border-radius: var(--radius-sm);
  border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text);
}
.dbg-note { font-size: 11px; color: var(--color-text-faint); margin: var(--space-1) 0 0; }
.dbg-error { font-size: 12px; color: var(--color-danger); margin: var(--space-1) 0 0; }
```

- [ ] **Step 3: Mount the modal**

In `src/App.tsx`, add the import next to the `SpecialDayHost` import:
```ts
import { DayBackgroundHost } from './features/day-background/DayBackgroundHost';
```
And render it next to `<SpecialDayHost />` (line ~41):
```tsx
      <SpecialDayHost />
      <DayBackgroundHost />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/day-background/DayBackgroundHost.tsx src/features/day-background/dayBackground.css src/App.tsx
git commit -m "feat: Day background studio modal (image/builder/code)"
```

---

## Task 10: Open the modal from the special-day popover + mutual exclusivity

**Files:**
- Modify: `src/features/special-day/SpecialDayHost.tsx`

- [ ] **Step 1: Add the "Custom background…" button and clear-on-preset behavior**

In `src/features/special-day/SpecialDayHost.tsx`:

1. Read the opener: `const openDayBackground = useUiStore((s) => s.openDayBackground);`
2. The existing preview `useEffect` writes `{ cosmetic, animations, emoji, recurrence }`. Extend its `setSpecialDayInMemory` call to also clear the custom sources when a preset/effect is chosen, so picking a preset is mutually exclusive with image/CSS:
```ts
      setSpecialDayInMemory(date, {
        cosmetic,
        animations,
        emoji: existingDirect?.emoji ?? '',
        recurrence,
        image: cosmetic ? undefined : existingDirect?.image,
        customStyle: cosmetic ? undefined : existingDirect?.customStyle,
      });
```
   And in the `removeSpecialDayInMemory` branch's guard, treat an existing image/customStyle as "still special" so it isn't wiped when only cosmetic+animations are empty:
```ts
    const stillCustom = existingDirect?.image || existingDirect?.customStyle;
    if (!cosmetic && animations.length === 0 && !stillCustom) {
      removeSpecialDayInMemory(date);
    } else {
      // ...the setSpecialDayInMemory call above
    }
```
3. Add a button at the end of the panel (after the recurrence section, before `</div>` of `.sd-panel`):
```tsx
        <button
          type="button"
          className="sd-custom-bg-btn"
          onClick={() => openDayBackground(date)}
        >
          🎨 Custom background…
        </button>
```
4. Update `isSpecial` to include the custom sources so the clear (↺) button shows:
```ts
  const isSpecial = Boolean(cosmetic) || animations.length > 0 || Boolean(existingDirect?.image) || Boolean(existingDirect?.customStyle);
```

- [ ] **Step 2: Style the button**

Append to `src/features/special-day/specialDay.css`:
```css
/* Matches the sd-panel idiom; sd-panel's gap handles spacing (no margin). */
.sd-custom-bg-btn {
  width: 100%;
  padding: 9px;
  border: 1px dashed var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 120ms ease;
}
.sd-custom-bg-btn:hover { filter: brightness(0.97); }
```

- [ ] **Step 3: Typecheck + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/special-day/SpecialDayHost.tsx src/features/special-day/specialDay.css
git commit -m "feat: open Day background modal from special-day popover"
```

---

## Task 11: Manual verification + final pass

**Files:** none (verification only)

- [ ] **Step 1: Build/typecheck/test gate**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck, all tests green.

- [ ] **Step 2: Run the app**

Run: `npm run tauri dev` (desktop) or `npm run dev` (web).

- [ ] **Step 3: Manual checklist (right-click a day → "Custom background…")**

- [ ] **Image — file:** Choose file → tile shows the photo full-bleed, date legible on the scrim.
- [ ] **Image — drag & drop:** drop a photo onto the drop zone → same result. *(If OS drops don't reach the zone in Tauri, see Open Questions in the spec — wire the Tauri drag-drop event / `dragDropEnabled`.)*
- [ ] **Image — URL:** paste an image URL → Load URL → photo appears (downscaled WebP).
- [ ] **Image — paste:** copy an image, focus the drop zone, Ctrl+V → photo appears.
- [ ] **Builder:** switch to Builder, change type/colors/angle/animation/speed → live preview + tile update.
- [ ] **Code:** paste the classic animated-gradient snippet → live preview animates; tile animates; date stays legible.
- [ ] **Safety:** paste `position:fixed; background:url(http://example.com/x.png) red;` → neither escapes the tile nor makes a network request (check devtools Network).
- [ ] **Mutual exclusivity:** set an image, then pick a preset gradient in the popover → image is replaced by the preset (and vice-versa).
- [ ] **Effects + emoji stack:** add Sparkles + an emoji on a custom-image day → both render above the photo.
- [ ] **Recurrence:** set a photo with **Yearly** → it shows on the same date next year.
- [ ] **Persistence:** reload the app → all of the above survive (localStorage + IndexedDB).
- [ ] **Clear:** ↺ in the popover removes the custom background.
- [ ] **Light & dark:** toggle the theme (Settings) → the studio modal, popover button, labels, segmented controls, inputs and code box all read correctly in both modes (no hardcoded colors; tokens flip). The over-photo scrim + white date stay legible in both.
- [ ] **Apple-clean check:** no stray titles, micro-labels match `.sd-label`, segmented controls match `.sd-segment`, spacing/radii use tokens — the modal feels like part of the app, not bolted on.

- [ ] **Step 4: Merge the branch**

Use the superpowers:finishing-a-development-branch skill (merge to `main` / open a PR).

---

## Self-review (completed during planning)

- **Spec coverage:** mental model (Task 1 fields + Task 2 resolver + Task 8 render); image pipeline incl. WebP + all 4 sources (Tasks 5, 9); IndexedDB store (Task 6); custom-CSS compile + sanitize + scope + keyframe namespacing (Tasks 3–4); no-code builder (Tasks 4, 9); full-bleed render + scrim (Task 8); editor popover + studio modal (Tasks 9–10); reduced-motion + containment (Task 8 CSS). Phase-2 sync is intentionally a separate plan.
- **Placeholder scan:** none — every code step is concrete.
- **Type consistency:** `DayImageRef`/`DayCustomStyle` (Task 1) used identically in `dayBackground.ts`, `dayCss.ts`, the hook, and the modal; `compileCustomStyle(style, scopeClass)`, `dayScopeClass(id)`, `putImage/getImageUrl/deleteImage`, `processImage/fitWithin/blobFromUrl/imageFileFromDataTransfer`, and `openDayBackground` are named consistently across tasks.
```
