# Category Management Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared category editor with a nameless two-row swatch grid (hover tooltips), a See-all gallery (customs / presets / premium try-on), saved custom gradients, dual live previews, and a free live-linked "Events match category" toggle.

**Architecture:** Extend the data model first (`CategoryConfig.matchEvents`, `customGradients` in persisted settings; `resolveEventLook` in `core/cosmetics.ts`), then build three focused components under `src/features/category-editor/` (`presets.ts`, `SwatchGrid`, `CategoryPreview`, composed by `CategoryEditor`). Finally rewire the two entry points (popover host, settings Categories pane), integrate matched-event rendering into MonthGrid/UpcomingStack, and delete the two duplicated legacy editors.

**Tech Stack:** React 18 + TypeScript, Zustand, Vitest + Testing Library, existing CSS tokens (`--color-*`, `--radius-*`, `--space-*`). Spec: `docs/superpowers/specs/2026-07-04-category-management-redesign-design.md`.

---

## File structure

New:
- `src/features/category-editor/presets.ts` — preset colors/gradients, premium gallery entries, gallery composition helpers. (+ `presets.test.ts`)
- `src/features/category-editor/SwatchGrid.tsx` — collapsed 6×2 grid, See-all gallery, `+` custom flow, tooltips, locks. (+ `SwatchGrid.test.tsx`)
- `src/features/category-editor/CategoryPreview.tsx` — category + event live preview strip.
- `src/features/category-editor/CategoryEditor.tsx` — composition: name editing, segmented control, grid, match toggle, cosmetic fallback, try-on/upsell, reset. (+ `CategoryEditor.test.tsx`)

Modified:
- `src/app/settingsStore.ts` — `matchEvents`, `customGradients` + actions, migration.
- `src/core/cosmetics.ts` — `resolveEventLook`, `getMatchedEventStyle`. (+ tests in `src/core/cosmetics.test.ts`, create if absent)
- `src/features/category-editor/CategoryEditorHost.tsx` — becomes a thin popover shell.
- `src/features/category-editor/categoryEditor.css` — rewritten for the new editor.
- `src/features/settings/Settings.tsx` — Categories pane hosts list + editor; the floating `categories-card` block is deleted.
- `src/features/month-grid/MonthGrid.tsx` + `src/features/upcoming-stack/UpcomingStack.tsx` — matched-event rendering.
- `src/ui/cosmetics.css` — one `.event-match-gradient` animation class.

---

### Task 1: Data model — `matchEvents` + `customGradients`

**Files:**
- Modify: `src/app/settingsStore.ts` (CategoryConfig ~line 20 region, `PersistedSettings:44-74`, `defaults():82`, `mergeSettings():112`, `syncableSettings():210`, store actions)
- Test: `src/app/settingsStore.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to the existing file):

```ts
describe('custom gradients', () => {
  it('adds custom gradients with auto names and deletes by name', () => {
    const before = useSettingsStore.getState().customGradients.length;
    useSettingsStore.getState().addCustomGradient({ color1: '#22d3ee', color2: '#818cf8' });
    const list = useSettingsStore.getState().customGradients;
    expect(list).toHaveLength(before + 1);
    expect(list[list.length - 1]).toMatchObject({ color1: '#22d3ee', color2: '#818cf8' });
    expect(list[list.length - 1].name).toMatch(/^Custom \d+$/);
    const name = list[list.length - 1].name;
    useSettingsStore.getState().deleteCustomGradient(name);
    expect(useSettingsStore.getState().customGradients.find((g) => g.name === name)).toBeUndefined();
  });

  it('auto-names past deleted gradients without duplicating', () => {
    useSettingsStore.setState({ customGradients: [{ name: 'Custom 2', color1: '#000000', color2: '#ffffff' }] });
    useSettingsStore.getState().addCustomGradient({ color1: '#111111', color2: '#222222' });
    const names = useSettingsStore.getState().customGradients.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/app/settingsStore.test.ts` — expect FAIL (`customGradients`/`addCustomGradient` undefined).

- [ ] **Step 3: Implement.** In `settingsStore.ts`:

Find the `CategoryConfig` interface (search `interface CategoryConfig` / `type CategoryConfig`) and add:

```ts
  /** When true, this category's events render with the category's exact
   *  solid/gradient look and follow later category edits (free feature).
   *  When false/undefined, `cosmetic` drives the default event style. */
  matchEvents?: boolean;
```

Add near it:

```ts
export interface CustomGradient {
  name: string;
  color1: string;
  color2: string;
}
```

In `PersistedSettings` add `customGradients: CustomGradient[];`. In `defaults()` add `customGradients: [],`. In `mergeSettings()` add to the returned object:

```ts
    customGradients: Array.isArray(parsed.customGradients) ? parsed.customGradients : base.customGradients,
```

Check `syncableSettings()` (line ~210): if it whitelists fields, add `customGradients` (and confirm `categories` is already synced — it is). In the `SettingsState` interface add:

```ts
  addCustomGradient(g: { color1: string; color2: string }): void;
  deleteCustomGradient(name: string): void;
```

In the store body (follow the pattern of other actions — `set` then `persist()`):

```ts
    addCustomGradient: ({ color1, color2 }) => {
      const existing = get().customGradients;
      const used = new Set(existing.map((g) => g.name));
      let n = existing.length + 1;
      while (used.has(`Custom ${n}`)) n++;
      set({ customGradients: [...existing, { name: `Custom ${n}`, color1, color2 }] });
      persist();
    },
    deleteCustomGradient: (name) => {
      set({ customGradients: get().customGradients.filter((g) => g.name !== name) });
      persist();
    },
```

- [ ] **Step 4: Run** `npx vitest run src/app/settingsStore.test.ts` — expect PASS. Then `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/settingsStore.ts src/app/settingsStore.test.ts
git commit -m "feat(categories): matchEvents flag and persisted custom gradients"
```

---

### Task 2: `resolveEventLook` + matched style

**Files:**
- Modify: `src/core/cosmetics.ts` (below `resolveCosmetic`, ~line 190)
- Modify: `src/ui/cosmetics.css` (append one class)
- Test: `src/core/cosmetics.test.ts` (create if absent; check for an existing file first and append)

- [ ] **Step 1: Write the failing tests:**

```ts
import { resolveEventLook, getMatchedEventStyle } from './cosmetics';
import type { CategoryConfig } from '../app/settingsStore';

const matched: CategoryConfig = {
  type: 'gradient',
  value: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)',
  color1: '#00c6ff',
  color2: '#0072ff',
  matchEvents: true,
};
const withCosmetic: CategoryConfig = { type: 'color', value: '#0a84ff', color1: '#0a84ff', cosmetic: 'aurora' };

describe('resolveEventLook', () => {
  it('event own cosmetic beats everything', () => {
    expect(resolveEventLook({ cosmetic: 'aurora', type: 'Work' }, { Work: matched }))
      .toEqual({ kind: 'cosmetic', id: 'aurora' });
  });
  it('matchEvents beats category cosmetic', () => {
    expect(resolveEventLook({ type: 'Work' }, { Work: { ...matched, cosmetic: 'aurora' } }))
      .toEqual({ kind: 'match', config: { ...matched, cosmetic: 'aurora' } });
  });
  it('falls back to category cosmetic, then none', () => {
    expect(resolveEventLook({ type: 'Work' }, { Work: withCosmetic })).toEqual({ kind: 'cosmetic', id: 'aurora' });
    expect(resolveEventLook({ type: 'Work' }, {})).toEqual({ kind: 'none' });
  });
});

describe('getMatchedEventStyle', () => {
  it('gradient config yields an animated background image', () => {
    const s = getMatchedEventStyle(matched);
    expect(s.backgroundImage).toBe(matched.value);
    expect(s.backgroundSize).toBe('300% 100%');
  });
  it('solid config yields background color with contrast text', () => {
    const s = getMatchedEventStyle({ type: 'color', value: '#ffd60a', color1: '#ffd60a' });
    expect(s.backgroundColor).toBe('#ffd60a');
    expect(typeof s.color).toBe('string');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/core/cosmetics.test.ts` — expect FAIL (exports missing).

- [ ] **Step 3: Implement** in `core/cosmetics.ts` (it already imports the `CategoryConfig` type; also import `getContrastColor` from `./colors`):

```ts
export type EventLook =
  | { kind: 'cosmetic'; id: string }
  | { kind: 'match'; config: CategoryConfig }
  | { kind: 'none' };

/** Effective look for an event: own cosmetic → category matchEvents → category
 *  cosmetic → none. Matched categories return the config so callers derive CSS. */
export function resolveEventLook(
  event: Pick<CalendarEvent, 'cosmetic' | 'type'>,
  categories: Record<string, CategoryConfig>,
): EventLook {
  if (event.cosmetic && cosmeticById(event.cosmetic)) return { kind: 'cosmetic', id: event.cosmetic };
  const config = event.type ? categories[event.type] : undefined;
  if (config?.matchEvents) return { kind: 'match', config };
  if (config?.cosmetic && cosmeticById(config.cosmetic)) return { kind: 'cosmetic', id: config.cosmetic };
  return { kind: 'none' };
}

/** Inline style for a matched event chip. Gradients animate via the
 *  `.event-match-gradient` class (caller adds it when backgroundImage is set). */
export function getMatchedEventStyle(config: CategoryConfig): React.CSSProperties {
  if (config.type === 'gradient') {
    return { backgroundImage: config.value, backgroundSize: '300% 100%', color: '#fff' };
  }
  return { backgroundColor: config.value, color: getContrastColor(config.value) };
}
```

(If `React` types aren't imported in this file, use `import type { CSSProperties } from 'react'` and return `CSSProperties`.)

Append to `src/ui/cosmetics.css`:

```css
/* Matched-category events reuse the cosmetic gradient drift. */
.event-match-gradient {
  animation: upcoming-type-shift 6s linear infinite;
}
```

(Verify the keyframes name `upcoming-type-shift` exists — it's used by the current preset preview code; if it lives in a feature CSS file, reference that name anyway since it's global once loaded, but note it in the report.)

- [ ] **Step 4: Run** `npx vitest run src/core/cosmetics.test.ts` — expect PASS. `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/cosmetics.ts src/core/cosmetics.test.ts src/ui/cosmetics.css
git commit -m "feat(cosmetics): resolveEventLook with matched-category styling"
```

---

### Task 3: Presets + gallery composition (`presets.ts`)

**Files:**
- Create: `src/features/category-editor/presets.ts`
- Test: `src/features/category-editor/presets.test.ts`

- [ ] **Step 1: Failing tests:**

```ts
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
```

- [ ] **Step 2: Run** `npx vitest run src/features/category-editor/presets.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `presets.ts`:**

```ts
import type { CustomGradient } from '../../app/settingsStore';

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
 *  cosmetics. `id` MUST be a real cosmetic id (locking checks it). */
export const PREMIUM_DESIGNS: { id: string; name: string; color1: string; color2: string }[] = [
  { id: 'neon-rush', name: 'Neon Rush', color1: '#ff007f', color2: '#7f77dd' },
  { id: 'nebula', name: 'Nebula', color1: '#8a2be2', color2: '#312e81' },
  { id: 'cyberpunk', name: 'Cyberpunk', color1: '#ffd700', color2: '#ff2079' },
  { id: 'lava-flow', name: 'Lava Flow', color1: '#ff4500', color2: '#7c2d12' },
];

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

/** The collapsed 6x2 grid: first 11 non-premium designs (customs first). */
export function collapsedGallery(all: Design[]): Design[] {
  return all.filter((d) => !d.premium).slice(0, 11);
}
```

Before finalizing, verify the premium ids exist: `git grep -n "neon-rush\|nebula\|cyberpunk\|lava-flow" src/core/cosmetics.ts` — all four are defined there. If any is missing, swap it for another premium gradient cosmetic id from `COSMETICS` and adjust the test count accordingly.

- [ ] **Step 4: Run** `npx vitest run src/features/category-editor/presets.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/category-editor/presets.ts src/features/category-editor/presets.test.ts
git commit -m "feat(categories): preset/custom/premium design gallery model"
```

---

### Task 4: `SwatchGrid` component

**Files:**
- Create: `src/features/category-editor/SwatchGrid.tsx`
- Modify: `src/features/category-editor/categoryEditor.css` (append grid styles)
- Test: `src/features/category-editor/SwatchGrid.test.tsx`

- [ ] **Step 1: Failing tests:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwatchGrid } from './SwatchGrid';
import { buildGallery } from './presets';

const customs = [{ name: 'Custom 1', color1: '#22d3ee', color2: '#818cf8' }];

function setup(over: Partial<React.ComponentProps<typeof SwatchGrid>> = {}) {
  const props = {
    mode: 'gradient' as const,
    designs: buildGallery('gradient', customs),
    selectedValue: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)',
    cosmeticsUnlocked: false,
    onSelect: vi.fn(),
    onSaveCustom: vi.fn(),
    onDeleteCustom: vi.fn(),
    ...over,
  };
  render(<SwatchGrid {...props} />);
  return props;
}

describe('SwatchGrid', () => {
  it('collapsed: 11 swatches + custom tile, names as accessible labels only', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /gradient$/i })).toHaveLength(11);
    expect(screen.getByRole('button', { name: 'New custom gradient' })).toBeInTheDocument();
    expect(screen.queryByText('Ocean Breeze')).not.toBeInTheDocument(); // no visible names
    expect(screen.queryByRole('button', { name: /premium/ })).not.toBeInTheDocument(); // premium only in gallery
  });

  it('clicking a swatch reports its design', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Forest Vine gradient' }));
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Forest Vine' }));
  });

  it('See all reveals groups incl. locked premium; premium is still clickable', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: /see all designs/i }));
    expect(screen.getByText('Your gradients')).toBeInTheDocument();
    expect(screen.getByText('Premium designs')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Neon Rush.*premium/i }));
    expect(p.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'neon-rush', premium: true }));
  });

  it('custom flow saves start/end via onSaveCustom', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'New custom gradient' }));
    // color inputs default to #000000; fireEvent needed for type=color
    const [start, end] = screen.getAllByLabelText(/start|end/i);
    expect(start).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save gradient' }));
    expect(p.onSaveCustom).toHaveBeenCalled();
  });

  it('deleting a custom asks via onDeleteCustom', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: /see all designs/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Custom 1' }));
    expect(p.onDeleteCustom).toHaveBeenCalledWith('Custom 1');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/category-editor/SwatchGrid.test.tsx` — FAIL.

- [ ] **Step 3: Implement `SwatchGrid.tsx`:**

```tsx
import { useState } from 'react';
import { collapsedGallery, type Design } from './presets';
import './categoryEditor.css';

interface Props {
  mode: 'color' | 'gradient';
  designs: Design[];
  /** The current config.value — used for the selected outline. */
  selectedValue: string;
  cosmeticsUnlocked: boolean;
  onSelect(design: Design): void;
  onSaveCustom(color1: string, color2: string): void;
  onDeleteCustom(name: string): void;
}

function swatchBackground(d: Design): string {
  return d.kind === 'gradient' ? `linear-gradient(90deg, ${d.color1}, ${d.color2})` : d.color1;
}

export function SwatchGrid({ mode, designs, selectedValue, cosmeticsUnlocked, onSelect, onSaveCustom, onDeleteCustom }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [c1, setC1] = useState('#22d3ee');
  const [c2, setC2] = useState('#818cf8');

  const customs = designs.filter((d) => d.custom);
  const presets = designs.filter((d) => !d.custom && !d.premium);
  const premium = designs.filter((d) => d.premium);

  const addLabel = mode === 'gradient' ? 'New custom gradient' : 'Custom color';

  function swatch(d: Design, opts: { deletable?: boolean } = {}) {
    const locked = d.premium && !cosmeticsUnlocked;
    const label = `${d.name} ${d.kind}${d.premium ? ' — premium' : ''}`;
    return (
      <div key={d.id} className="catswatch-cell">
        <button
          type="button"
          className={`catswatch${selectedValue === d.value ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
          style={{ background: swatchBackground(d) }}
          title={label}
          aria-label={label}
          onClick={() => onSelect(d)}
        />
        {opts.deletable && (
          <button
            type="button"
            className="catswatch-delete"
            aria-label={`Delete ${d.name}`}
            title={`Delete ${d.name}`}
            onClick={() => onDeleteCustom(d.name)}
          >
            ×
          </button>
        )}
        {locked && <span className="catswatch-lock" aria-hidden="true">🔒</span>}
      </div>
    );
  }

  const addTile = (
    <button
      type="button"
      className="catswatch catswatch-add"
      aria-label={addLabel}
      title={addLabel}
      onClick={() => setAdding((v) => !v)}
    >
      +
    </button>
  );

  const customFlow = mode === 'gradient' && adding && (
    <div className="catswatch-custom-row">
      <label className="catswatch-custom-label">
        Start
        <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} aria-label="Start color" />
      </label>
      <label className="catswatch-custom-label">
        End
        <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} aria-label="End color" />
      </label>
      <span className="catswatch-custom-strip" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
      <button
        type="button"
        className="tb tb-text tb-primary"
        onClick={() => { onSaveCustom(c1, c2); setAdding(false); }}
      >
        Save gradient
      </button>
    </div>
  );

  if (!expanded) {
    return (
      <div className="catswatch-wrap">
        <div className="catswatch-grid">
          {collapsedGallery(designs).map((d) => swatch(d))}
          {addTile}
        </div>
        {customFlow}
        <button type="button" className="catswatch-more" onClick={() => setExpanded(true)}>
          See all designs ▾
        </button>
      </div>
    );
  }

  return (
    <div className="catswatch-wrap">
      {mode === 'gradient' && (
        <>
          <div className="catswatch-group-title">Your gradients</div>
          <div className="catswatch-grid">
            {customs.map((d) => swatch(d, { deletable: true }))}
            {addTile}
          </div>
        </>
      )}
      <div className="catswatch-group-title">Presets</div>
      <div className="catswatch-grid">{presets.map((d) => swatch(d))}{mode === 'color' ? addTile : null}</div>
      {mode === 'gradient' && premium.length > 0 && (
        <>
          <div className="catswatch-group-title">Premium designs</div>
          <div className="catswatch-grid">{premium.map((d) => swatch(d))}</div>
        </>
      )}
      {customFlow}
      <button type="button" className="catswatch-more" onClick={() => setExpanded(false)}>
        Show less ▴
      </button>
    </div>
  );
}
```

For solid mode the `+` tile opens the flow too — but with a single native color input; to keep this task small, in solid mode clicking `+` renders the same row minus the End picker and Save calls `onSaveCustom(c1, c1)`; the parent treats a solid custom as a direct `onSelect` (Task 6 wires it: solid custom just applies the color, it is NOT saved to the gradient library). Implement that branch:

```tsx
  const solidFlow = mode === 'color' && adding && (
    <div className="catswatch-custom-row">
      <label className="catswatch-custom-label">
        Color
        <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} aria-label="Custom color" />
      </label>
      <button type="button" className="tb tb-text tb-primary" onClick={() => { onSaveCustom(c1, c1); setAdding(false); }}>
        Apply color
      </button>
    </div>
  );
```

and render `{solidFlow}` next to `{customFlow}` in both branches.

Append to `categoryEditor.css` (keep existing file content for now — Task 6 prunes it):

```css
/* ---- Swatch grid ---- */
.catswatch-wrap { display: flex; flex-direction: column; gap: var(--space-2); }
.catswatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 8px;
}
@media (min-width: 480px) {
  .catswatch-grid { grid-template-columns: repeat(6, 1fr); }
}
.catswatch-cell { position: relative; }
.catswatch {
  position: relative;
  width: 100%;
  height: 30px;
  border-radius: 7px;
  border: 0.5px solid var(--color-border);
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s ease;
}
.catswatch:hover { transform: scale(1.06); z-index: 2; }
.catswatch.is-selected { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.catswatch.is-locked { opacity: 0.75; }
.catswatch-lock { position: absolute; right: -4px; top: -6px; font-size: 10px; pointer-events: none; }
.catswatch-delete {
  position: absolute;
  left: -5px;
  top: -6px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 0.5px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 3;
}
.catswatch-cell:hover .catswatch-delete { opacity: 1; }
.catswatch-add {
  border-style: dashed;
  border-color: var(--color-border-strong);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 16px;
}
.catswatch-more {
  border: none;
  background: none;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  padding: 2px;
  align-self: center;
  font-family: inherit;
}
.catswatch-group-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: var(--space-1);
}
.catswatch-custom-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.catswatch-custom-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary); }
.catswatch-custom-label input[type='color'] { width: 26px; height: 26px; border: none; padding: 0; background: transparent; cursor: pointer; }
.catswatch-custom-strip { flex: 1; min-width: 60px; height: 24px; border-radius: 6px; }
```

Note: hover tooltips come from the native `title` attribute (also the touch/a11y fallback); no custom tooltip element is needed.

- [ ] **Step 4: Run** `npx vitest run src/features/category-editor/SwatchGrid.test.tsx` — PASS. `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/category-editor/SwatchGrid.tsx src/features/category-editor/SwatchGrid.test.tsx src/features/category-editor/categoryEditor.css
git commit -m "feat(categories): SwatchGrid with gallery, custom flow, premium locks"
```

---

### Task 5: `CategoryPreview` component

**Files:**
- Create: `src/features/category-editor/CategoryPreview.tsx`
- Modify: `src/features/category-editor/categoryEditor.css` (append)

No dedicated test file — it's a pure presentation component fully covered through `CategoryEditor.test.tsx` (Task 6). Steps:

- [ ] **Step 1: Implement:**

```tsx
import { getCategoryStyle, type CategoryConfig } from '../../app/settingsStore';
import { getMatchedEventStyle, cosmeticById } from '../../core/cosmetics';
import './categoryEditor.css';

interface Props {
  name: string;
  config: CategoryConfig;
  /** Hide the upcoming-row line in the compact popover variant. */
  compact?: boolean;
  /** Inline rename support: commits on blur/Enter. */
  onRename?(next: string): void;
}

export function CategoryPreview({ name, config, compact, onRename }: Props) {
  const eventStyle = config.matchEvents
    ? getMatchedEventStyle(config)
    : config.cosmetic && cosmeticById(config.cosmetic)
      ? undefined // cosmetic classes handle it
      : getMatchedEventStyle(config); // sensible default: show category colors
  const eventClass = config.matchEvents && config.type === 'gradient' ? ' event-match-gradient' : '';
  const cosmeticCls = !config.matchEvents && config.cosmetic ? ` cosmetic-${config.cosmetic} cosmetic-${cosmeticById(config.cosmetic)?.kind ?? ''}` : '';

  return (
    <div className={`catprev${compact ? ' is-compact' : ''}`}>
      <div className="catprev-card">
        <div className="catprev-label">Category</div>
        <span
          className="upcoming-type catprev-name"
          style={getCategoryStyle(config)}
          contentEditable={Boolean(onRename)}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => onRename?.(e.currentTarget.textContent ?? '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
          }}
        >
          {name}
        </span>
      </div>
      <div className="catprev-card catprev-card-event">
        <div className="catprev-label">Event</div>
        <div className={`catprev-pill${eventClass}${cosmeticCls}`} style={eventStyle} data-testid="event-preview-pill">
          9:00 Team standup
        </div>
        {!compact && (
          <div className="catprev-row">
            <span className="catprev-dot" style={{ background: config.type === 'gradient' ? `linear-gradient(90deg, ${config.color1}, ${config.color2})` : config.value }} />
            Team standup <span className="catprev-dim">· 9:00</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

Append CSS:

```css
/* ---- Preview strip ---- */
.catprev { display: flex; gap: 10px; }
.catprev-card {
  flex: 1;
  background: var(--color-muted-bg);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  text-align: center;
  min-width: 0;
}
.catprev-card-event { flex: 1.4; text-align: left; }
.catprev-label {
  font-size: 10px;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
  text-align: center;
}
.catprev-name { font-size: 20px; font-weight: 500; outline: none; word-break: break-word; }
.catprev-pill {
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 500;
  background-size: 300% 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.catprev-row { margin-top: 6px; display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-text); }
.catprev-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.catprev-dim { color: var(--color-text-faint); font-size: 11px; }
/* Narrow panes/popover: stack the two preview cards. */
@media (max-width: 420px) {
  .catprev { flex-direction: column; }
}
.catprev.is-compact .catprev-row { display: none; }
```

- [ ] **Step 2:** `npx tsc --noEmit` — clean (behavioral verification lands with Task 6's tests).

- [ ] **Step 3: Commit**

```bash
git add src/features/category-editor/CategoryPreview.tsx src/features/category-editor/categoryEditor.css
git commit -m "feat(categories): live category + event preview strip"
```

---

### Task 6: `CategoryEditor` composition

**Files:**
- Create: `src/features/category-editor/CategoryEditor.tsx`
- Test: `src/features/category-editor/CategoryEditor.test.tsx`
- Modify: `src/features/category-editor/categoryEditor.css` (append; ALSO delete the old `.category-editor-gradient-*` / `.category-editor-preset-*` rules once Task 7 removes their markup — do the deletion in Task 7)

- [ ] **Step 1: Failing tests:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryEditor } from './CategoryEditor';
import { useSettingsStore } from '../../app/settingsStore';
import { useEntitlementStore } from '../../app/entitlementStore';

beforeEach(() => {
  useSettingsStore.setState({
    categories: {
      Work: { type: 'gradient', value: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)', color1: '#00c6ff', color2: '#0072ff', matchEvents: true },
    },
    customGradients: [],
  });
});

describe('CategoryEditor', () => {
  it('selecting a free swatch saves immediately and updates the store', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Forest Vine gradient' }));
    expect(useSettingsStore.getState().categories.Work.color1).toBe('#11998e');
  });

  it('selecting a locked premium swatch previews but does not persist', async () => {
    useEntitlementStore.setState({ cosmeticsUnlocked: false } as never);
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: /see all designs/i }));
    await userEvent.click(screen.getByRole('button', { name: /Neon Rush.*premium/i }));
    expect(useSettingsStore.getState().categories.Work.color1).toBe('#00c6ff'); // unchanged
    expect(screen.getByTestId('event-preview-pill')).toHaveStyle({ backgroundImage: 'linear-gradient(90deg, #ff007f, #7f77dd, #ff007f)' });
  });

  it('saving a custom gradient adds it to the library and applies it', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'New custom gradient' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save gradient' }));
    expect(useSettingsStore.getState().customGradients).toHaveLength(1);
    expect(useSettingsStore.getState().categories.Work.color1).toBe(useSettingsStore.getState().customGradients[0].color1);
  });

  it('match toggle off reveals the cosmetic selector and persists matchEvents', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('switch', { name: /events match category/i }));
    expect(useSettingsStore.getState().categories.Work.matchEvents).toBe(false);
    expect(document.querySelector('.cosmetic-swatch')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/features/category-editor/CategoryEditor.test.tsx` — FAIL.

- [ ] **Step 3: Implement `CategoryEditor.tsx`:**

```tsx
import { useState } from 'react';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore, type CategoryConfig } from '../../app/settingsStore';
import { useEntitlementStore } from '../../app/entitlementStore';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
import { confirmChoice } from '../../ui/confirmStore';
import { startCheckout } from '../../data/checkout';
import { buildGallery, gradientValue, type Design } from './presets';
import { SwatchGrid } from './SwatchGrid';
import { CategoryPreview } from './CategoryPreview';
import './categoryEditor.css';

const DEFAULT_GRADIENT: CategoryConfig = {
  type: 'gradient',
  value: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #f59e0b, #6366f1)',
  color1: '#6366f1',
  color2: '#ec4899',
  matchEvents: true,
};

interface Props {
  category: string;
  variant?: 'pane' | 'popover';
}

export function CategoryEditor({ category, variant = 'pane' }: Props) {
  const storeCategories = useSettingsStore((s) => s.categories);
  const customGradients = useSettingsStore((s) => s.customGradients);
  const setCategoryConfig = useSettingsStore((s) => s.setCategoryConfig);
  const deleteCategoryConfig = useSettingsStore((s) => s.deleteCategoryConfig);
  const renameCategoryConfig = useSettingsStore((s) => s.renameCategoryConfig);
  const addCustomGradient = useSettingsStore((s) => s.addCustomGradient);
  const deleteCustomGradient = useSettingsStore((s) => s.deleteCustomGradient);
  const renameCategory = useCalendarStore((s) => s.renameCategory);
  const notify = useCalendarStore((s) => s.notify);
  const cosmeticsUnlocked = useEntitlementStore((s) => s.cosmeticsUnlocked);

  const [name, setName] = useState(category);
  const saved: CategoryConfig = storeCategories[name] ?? storeCategories[category] ?? DEFAULT_GRADIENT;
  /** Premium try-on: previews only, never persisted. */
  const [tryDesign, setTryDesign] = useState<Design | null>(null);

  const effective: CategoryConfig = tryDesign
    ? { ...saved, type: 'gradient', value: tryDesign.value, color1: tryDesign.color1, color2: tryDesign.color2 ?? tryDesign.color1 }
    : saved;

  function save(config: CategoryConfig) {
    setTryDesign(null);
    setCategoryConfig(name.trim() || category, config);
  }

  function handleSelect(d: Design) {
    if (d.premium && !cosmeticsUnlocked) {
      setTryDesign(d);
      void confirmChoice({
        title: `${d.name} is a premium design`,
        message: 'Unlock all premium cosmetics with a one-time $3.99 purchase. You can preview it now.',
        actions: [{ value: 'buy', label: 'Unlock — $3.99', primary: true }],
        cancelLabel: 'Keep previewing',
      }).then((v) => {
        if (v === 'buy') void startCheckout('cosmetics');
      });
      return;
    }
    if (d.kind === 'solid') {
      save({ ...saved, type: 'color', value: d.value, color1: d.color1, color2: undefined });
    } else {
      save({ ...saved, type: 'gradient', value: d.value, color1: d.color1, color2: d.color2 });
    }
  }

  async function handleRename(next: string) {
    const trimmedNew = next.trim();
    const trimmedOld = name.trim();
    if (!trimmedNew || trimmedNew === trimmedOld) return;
    try {
      await renameCategory(trimmedOld, trimmedNew);
      renameCategoryConfig(trimmedOld, trimmedNew);
      setCategoryConfig(trimmedNew, saved);
      setName(trimmedNew);
    } catch (err) {
      console.error('Failed to rename category:', err);
    }
  }

  const mode = effective.type === 'color' ? 'color' : 'gradient';
  const designs = buildGallery(mode, customGradients);

  return (
    <div className={`catedit${variant === 'popover' ? ' is-popover' : ''}`}>
      <CategoryPreview name={name} config={effective} compact={variant === 'popover'} onRename={handleRename} />

      <div className="catedit-seg" role="group" aria-label="Style type">
        <button
          type="button"
          className={`catedit-seg-btn${mode === 'color' ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, type: 'color', value: saved.color1 || '#0a84ff', color1: saved.color1 || '#0a84ff' })}
        >
          Solid
        </button>
        <button
          type="button"
          className={`catedit-seg-btn${mode === 'gradient' ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, type: 'gradient', value: gradientValue(saved.color1 || '#6366f1', saved.color2 || '#ec4899'), color1: saved.color1 || '#6366f1', color2: saved.color2 || '#ec4899' })}
        >
          Gradient
        </button>
      </div>

      <SwatchGrid
        mode={mode}
        designs={designs}
        selectedValue={effective.value}
        cosmeticsUnlocked={cosmeticsUnlocked}
        onSelect={handleSelect}
        onSaveCustom={(c1, c2) => {
          if (mode === 'gradient') {
            addCustomGradient({ color1: c1, color2: c2 });
            save({ ...saved, type: 'gradient', value: gradientValue(c1, c2), color1: c1, color2: c2 });
          } else {
            save({ ...saved, type: 'color', value: c1, color1: c1 });
          }
        }}
        onDeleteCustom={(gname) => {
          void confirmChoice({
            title: `Delete "${gname}"?`,
            message: 'Categories using it keep their current colors.',
            actions: [{ value: 'delete', label: 'Delete', danger: true }],
          }).then((v) => {
            if (v === 'delete') deleteCustomGradient(gname);
          });
        }}
      />

      <div className="catedit-match">
        <div>
          <div className="catedit-match-title">Events match category</div>
          <div className="catedit-match-hint">Events use this exact look, and follow changes.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(saved.matchEvents)}
          aria-label="Events match category"
          className={`catedit-switch${saved.matchEvents ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, matchEvents: !saved.matchEvents })}
        >
          <span className="catedit-knob" />
        </button>
      </div>

      {!saved.matchEvents && (
        <CosmeticSelector
          value={saved.cosmetic ?? ''}
          onChange={(id) => save({ ...saved, cosmetic: id || undefined })}
          color={saved.type === 'color' ? saved.value : saved.color1}
        />
      )}

      <button
        type="button"
        className="tb tb-text catedit-reset"
        onClick={() => {
          deleteCategoryConfig(name.trim() || category);
          notify(`Reset style for "${name.trim() || category}".`);
        }}
      >
        Reset style
      </button>
    </div>
  );
}
```

VERIFY before coding: the exact signature of `confirmChoice` in `src/ui/confirmStore.ts` (actions/cancelLabel shape) and `startCheckout` kinds in `src/data/checkout.ts` (`'cosmetics'` — check the `CheckoutKind` union; `Settings.tsx` calls `buy(kind)` with real values). Adapt the calls to the real APIs and note deviations.

Append CSS:

```css
/* ---- Editor composition ---- */
.catedit { display: flex; flex-direction: column; gap: var(--space-3); }
.catedit-seg { display: flex; border: 0.5px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
.catedit-seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  padding: 7px 0;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.catedit-seg-btn.is-on { background: var(--color-accent-soft); color: var(--color-accent); font-weight: 500; }
.catedit-match { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-top: 0.5px solid var(--color-border); padding-top: var(--space-3); }
.catedit-match-title { font-size: 13px; font-weight: 500; color: var(--color-text); }
.catedit-match-hint { font-size: 11px; color: var(--color-text-faint); }
.catedit-switch {
  width: 36px;
  height: 21px;
  border-radius: 11px;
  border: none;
  background: var(--color-border-strong);
  position: relative;
  cursor: pointer;
  flex: none;
  transition: background 0.15s ease;
}
.catedit-switch.is-on { background: var(--color-accent); }
.catedit-knob { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; transition: left 0.15s ease; }
.catedit-switch.is-on .catedit-knob { left: 17px; }
.catedit-reset { align-self: flex-start; }
.catedit.is-popover { max-width: min(92vw, 360px); }
```

- [ ] **Step 4: Run** `npx vitest run src/features/category-editor` — all editor tests PASS. `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/category-editor/CategoryEditor.tsx src/features/category-editor/CategoryEditor.test.tsx src/features/category-editor/categoryEditor.css
git commit -m "feat(categories): shared CategoryEditor with try-on and match toggle"
```

---

### Task 7: Rewire the popover host

**Files:**
- Modify: `src/features/category-editor/CategoryEditorHost.tsx` (replace almost everything)
- Modify: `src/features/category-editor/categoryEditor.css` (delete now-dead rules)

- [ ] **Step 1: Replace `CategoryEditorHost.tsx` with:**

```tsx
import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { CategoryEditor } from './CategoryEditor';
import './categoryEditor.css';

/** Anchored popover entry point for category editing (chip double-click). */
export function CategoryEditorHost() {
  const target = useUiStore((s) => s.categoryEditor);
  const close = useUiStore((s) => s.closeOverlays);

  if (!target) return null;

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close} placement="right">
      <div className="category-editor">
        <CategoryEditor category={target.category} variant="popover" />
      </div>
    </AnchoredPopover>
  );
}
```

(The old PRESET_* constants move fully to `presets.ts`; delete them here.)

- [ ] **Step 2: Prune dead CSS.** In `categoryEditor.css` delete rules no longer referenced by any TSX: `.category-editor-preset-grid`, `.category-editor-preset-btn`, `.category-editor-gradient-list`, `.category-editor-gradient-btn`, `.category-editor-section-title`, `.category-editor-actions`, `.category-editor-save`, `.category-action-btn`, `.editor-title`/`.editor-label` IF only used here (check `git grep -n "editor-title\|editor-label" src` first — they may be shared with other editors; delete only what has zero remaining references). Keep `.category-editor` (the popover sizing shell) and restyle it: `padding: var(--space-3); width: min(92vw, 360px); max-height: min(78vh, 560px); overflow-y: auto;`.

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx vitest run src/features/category-editor` — clean/PASS. `git grep -n "PRESET_GRADIENTS\|PRESET_SOLID_COLORS" src` → only `presets.ts` (and Settings.tsx until Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/features/category-editor/CategoryEditorHost.tsx src/features/category-editor/categoryEditor.css
git commit -m "refactor(categories): popover host delegates to shared CategoryEditor"
```

---

### Task 8: Rewire the settings Categories pane

**Files:**
- Modify: `src/features/settings/Settings.tsx`

- [ ] **Step 1: Read the current wiring.** Locate: the `panel === 'categories'` pane section; the `categoriesOpen` state + "Manage Categories…" button; the entire `{categoriesOpen && (<div className="categories-card"> … )}` block (~line 1161 to its close, ~400 lines incl. the edit view); the states/handlers used only by that block (`selectedCategory`, `newCategoryName`, `editName`, `editSpanRef`, `handleAddCategory`, `handleResetCategory`, `handleUpdateCategoryStyle`, `handleRenameCategory`, and the local `PRESET_SOLID_COLORS`/`PRESET_GRADIENTS` copies).

- [ ] **Step 2: Rebuild the pane.** Replace the `panel === 'categories'` section content with:

```tsx
{panel === 'categories' && (
  <section className="settings-section">
    {!selectedCategory ? (
      <>
        <div className="category-add-row" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            type="text"
            className="settings-mode"
            placeholder="New category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <button className="tb tb-text" onClick={handleAddCategory}>Add</button>
        </div>
        <div className="category-list">
          {existingCategories.length === 0 ? (
            <p className="settings-empty" style={{ margin: 0, textAlign: 'center' }}>No categories created yet.</p>
          ) : (
            existingCategories.map((cat) => (
              <button key={cat} className="category-item-row" onClick={() => setSelectedCategory(cat)}>
                <span className="upcoming-type" style={{ fontSize: '14px', fontWeight: 500, ...getCategoryStyle(storeCategories[cat]) }}>
                  {cat}
                </span>
              </button>
            ))
          )}
        </div>
      </>
    ) : (
      <>
        <button className="tb tb-text" onClick={() => setSelectedCategory(null)} style={{ alignSelf: 'flex-start' }}>
          ← All categories
        </button>
        <CategoryEditor category={selectedCategory} />
      </>
    )}
  </section>
)}
```

Add `import { CategoryEditor } from '../category-editor/CategoryEditor';` at the top. Keep `selectedCategory`, `newCategoryName`, `handleAddCategory`, `existingCategories` (they exist already). `handleAddCategory` must create new categories with `matchEvents: true` (spec: default on for NEW categories) — find where it writes the initial config and add the flag; if it doesn't write a config at all, change it to call `setCategoryConfig(name, { ...DEFAULT_GRADIENT })` — import nothing new; inline the default object matching Task 6's `DEFAULT_GRADIENT` values including `matchEvents: true`.

- [ ] **Step 3: Delete** the `categoriesOpen` state, the "Manage Categories…"/"Close Categories Panel" button, the whole `categories-card` overlay block, `handleUpdateCategoryStyle`, `handleRenameCategory`, `handleResetCategory`, `editName`, `editSpanRef`, and the local `PRESET_SOLID_COLORS`/`PRESET_GRADIENTS` arrays (now unused). Add minimal CSS to `settings.css` for the simplified list:

```css
.category-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}
.category-item-row {
  display: flex;
  align-items: center;
  padding: 6px var(--space-2);
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.category-item-row:hover { background: var(--color-muted-bg); }
```

Also delete the old `.categories-card` rules from `settings.css` and confirm zero references: `git grep -n "categories-card\|categoriesOpen" src` → nothing.

- [ ] **Step 4: Verify** `npx tsc --noEmit && npx vitest run` — full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/Settings.tsx src/features/settings/settings.css
git commit -m "feat(settings): categories pane hosts the shared editor; drop floating card"
```

---

### Task 9: Matched-event rendering in MonthGrid + UpcomingStack

**Files:**
- Modify: `src/features/month-grid/MonthGrid.tsx` (`cosmeticSuffix`, ~line 958, and the chip render that consumes it)
- Modify: `src/features/upcoming-stack/UpcomingStack.tsx` (event card style resolution)

- [ ] **Step 1:** In `MonthGrid.tsx`, import `resolveEventLook, getMatchedEventStyle` from `../../core/cosmetics`. Replace the `cosmeticSuffix` helper with a look resolver:

```tsx
  /** Effective look for an event chip: cosmetic class suffix or a matched
   *  inline style derived from the category config. */
  const eventLook = (event: CalendarEvent): { suffix: string; style?: React.CSSProperties } => {
    const look = resolveEventLook(event, categories);
    if (look.kind === 'cosmetic') {
      const cls = cosmeticClass(look.id);
      return { suffix: cls ? ` ${cls} cosmetic-${cosmeticById(look.id)!.kind}` : '' };
    }
    if (look.kind === 'match') {
      const style = getMatchedEventStyle(look.config);
      return { suffix: look.config.type === 'gradient' ? ' event-match-gradient' : '', style };
    }
    return { suffix: '' };
  };
```

Find every call site of `cosmeticSuffix(` (grep within the file) and update it to use `eventLook(event)`: append `.suffix` to the className expression and spread `.style` into the chip's existing `style` prop AFTER the existing entries so matched colors win over the default category color but BEFORE any explicit per-event `event.color` if the code applies one — read the chip render and preserve its precedence for `event.color`; when `event.color` exists it should still win (matched style only applies when the chip would otherwise use the category default). Report the exact precedence you implemented.

- [ ] **Step 2:** In `UpcomingStack.tsx`, find where cards derive cosmetic classes/styles (grep `resolveCosmetic|cosmeticClass` in the file; if absent, the cards style via `getCategoryStyle` only — in that case apply the matched style to the card's category chip/dot only, NOT the whole card, and note it). Apply the same `resolveEventLook` pattern to whatever element currently reflects the event's cosmetic.

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx vitest run` — full suite PASS.

- [ ] **Step 4: Manual browser check** (preview_start "dev"): create a category, confirm match-on shows events with the category gradient in BOTH the month grid and Upcoming; toggle match off and pick a cosmetic → cosmetic wins; set a per-event cosmetic → it beats both.

- [ ] **Step 5: Commit**

```bash
git add src/features/month-grid/MonthGrid.tsx src/features/upcoming-stack/UpcomingStack.tsx
git commit -m "feat(events): render matched-category event styling"
```

---

### Task 10: Dark mode + responsive verification, docs, final pass

**Files:**
- Modify: CSS files only as needed by findings; `docs/superpowers/specs/2026-07-04-category-management-redesign-design.md` (status line)

- [ ] **Step 1: Browser verification matrix** (preview_start "dev", use preview_resize + preview_eval):
  - Light AND dark (`data-theme`): swatch borders visible, tooltips legible, lock/delete badges legible, preview cards readable with light gradients (e.g. Rose Gold) and dark ones (Deep Sea).
  - Widths: settings pane at desktop; mobile preset (375px) where the settings nav stacks — grid must reflow (auto-fill) and the preview strip stack; popover variant within `min(92vw, 360px)`.
  - `--font-scale` 0.8 and 1.4 (set via the Appearance section): popover and pane stay usable.
  - Fix any failures in the relevant CSS (keep to tokens; no hardcoded colors).
- [ ] **Step 2: Full pass:** `npm run build && npx vitest run` — clean build, all tests green.
- [ ] **Step 3: Docs:** flip the spec's `Status:` line to `Shipped (<date>)` with a one-line outcome note listing any deviations found during implementation.
- [ ] **Step 4: Commit**

```bash
git add -A -- src docs
git commit -m "feat(categories): dark/responsive polish; mark redesign shipped"
```

---

## Self-review notes

- **Spec coverage:** §1 unify → Tasks 6/7/8; §2 layout (previews/segmented/grid/gallery/custom/toggle) → Tasks 4/5/6; §3 try-on → Task 6 (test 2); §4 match + migration + helper → Tasks 1/2/9 (migration = `matchEvents` optional, absent ⇒ falsy ⇒ old behavior — no explicit migration code needed; new-category default handled in Task 8 Step 2); §5 data/sync → Task 1; §6 dark/responsive → Tasks 4/5 CSS + Task 10 matrix; §7 error handling → Task 6 delete-confirm + try-on-never-persists; §8 testing → per-task TDD + Task 10 manual matrix.
- **Type consistency:** `Design` defined once in Task 3 and imported everywhere; `CustomGradient` from settingsStore; `resolveEventLook`/`getMatchedEventStyle` signatures match between Tasks 2 and 9; `CategoryEditor` props (`category`, `variant`) match Tasks 7/8 usage.
- **Verified-before-use flags:** Tasks 6 and 9 explicitly instruct verifying `confirmChoice`/`startCheckout` signatures and the chip-render precedence instead of assuming.
