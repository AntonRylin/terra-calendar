# App UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Open-Calendar's UI onto one quiet, Notion-flavored control language (subtle-gray buttons, a layout dropdown, a clean zoom capsule, a collapsing lupa search, an avatar account menu, and a left-sidebar settings layout) so the app looks production-ready.

**Architecture:** Extract shared UI primitives (`ToolbarButton`, `Dropdown`, `ZoomStepper`, `AccountMenu`) under `src/ui/`, then refit the calendar toolbar, Upcoming header, settings panel, and remaining surfaces to use them. Behavior logic (search expand/collapse, layout shortcuts, settings routing, menu actions) is unit-tested; pure restyles are verified manually and by snapshot of class usage. State changes are limited to broadening the settings panel id.

**Tech Stack:** React 18 + TypeScript, Zustand, Vite, Vitest + Testing Library, `@floating-ui/react` (`AnchoredPopover`), Tauri v2. CSS via existing `--color-*` / `--radius-*` / `--space-*` tokens in `src/ui/tokens.css`.

Spec: `docs/superpowers/specs/2026-06-29-app-ui-rework-design.md`.

> **Status: COMPLETE** (2026-07-02). All 11 tasks executed and verified
> (tsc clean, full vitest suite green, live browser verification of toolbar,
> lupa search, account menu, and settings sidebar). See the spec's "Outcome"
> section for shipped-vs-designed deviations (settings nav icons + fixed modal
> size added on user feedback; minimap header and confirm dialog structure
> intentionally left as-is; dropdown hint keys wired while the menu is open).

---

## File structure

New files:
- `src/ui/ToolbarButton.tsx` — labeled/icon button (variants: `text`, `icon`; `active`, `disabled`).
- `src/ui/toolbarButton.css` — the shared button language.
- `src/ui/Dropdown.tsx` — Notion-style labeled selector + checkmark menu (wraps `AnchoredPopover`).
- `src/ui/dropdown.css`
- `src/ui/ZoomStepper.tsx` — `− value +` capsule + fit button.
- `src/ui/zoomStepper.css`
- `src/ui/AccountMenu.tsx` — avatar trigger + account dropdown.
- `src/ui/accountMenu.css`
- `src/ui/ExpandingSearch.tsx` — collapsing lupa search input.
- `src/ui/expandingSearch.css`
- Test files alongside each (`*.test.tsx`).

Modified files:
- `src/features/month-grid/MonthGrid.tsx` (`.month-header`, ~1487–1564) — swap controls for primitives.
- `src/features/month-grid/monthGrid.css` — remove dead toolbar styles.
- `src/features/upcoming-stack/UpcomingStack.tsx` (~786–873) — lupa search, restyle action buttons.
- `src/features/settings/Settings.tsx` — left-sidebar nav restructure.
- `src/features/settings/settings.css` — sidebar nav styles.
- `src/features/settings/CalendarsButton.tsx` — **delete** (replaced by `AccountMenu`).
- `src/app/settingsStore.ts:243-306` — broaden `SettingsPanel`, update `openSettings`.

---

## Task 1: Shared button language (`ToolbarButton`)

**Files:**
- Create: `src/ui/ToolbarButton.tsx`, `src/ui/toolbarButton.css`
- Test: `src/ui/ToolbarButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/ToolbarButton.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarButton } from './ToolbarButton';

describe('ToolbarButton', () => {
  it('renders a labeled text button and fires onClick', async () => {
    const onClick = vi.fn();
    render(<ToolbarButton onClick={onClick}>Today</ToolbarButton>);
    const btn = screen.getByRole('button', { name: 'Today' });
    expect(btn).toHaveClass('tb', 'tb-text');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders an icon-only button using aria-label and marks active', () => {
    render(
      <ToolbarButton variant="icon" aria-label="Fit" active>
        <svg />
      </ToolbarButton>,
    );
    const btn = screen.getByRole('button', { name: 'Fit' });
    expect(btn).toHaveClass('tb', 'tb-icon', 'is-active');
  });

  it('respects disabled', () => {
    render(<ToolbarButton disabled>Today</ToolbarButton>);
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ToolbarButton.test.tsx`
Expected: FAIL — cannot resolve `./ToolbarButton`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/ToolbarButton.tsx
import type { ButtonHTMLAttributes } from 'react';
import './toolbarButton.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'text' = labeled pill, 'icon' = 30x30 square. Default 'text'. */
  variant?: 'text' | 'icon';
  /** Selected/active visual state (accent-soft fill). */
  active?: boolean;
}

/** The shared toolbar button: subtle-gray Notion-style fill, tight padding.
 *  Used for every toolbar/header action across the app. */
export function ToolbarButton({ variant = 'text', active = false, className = '', ...rest }: Props) {
  const cls = ['tb', variant === 'icon' ? 'tb-icon' : 'tb-text', active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button className={cls} {...rest} />;
}
```

```css
/* src/ui/toolbarButton.css */
.tb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--color-muted-bg);
  border: 0.5px solid var(--color-border);
  color: var(--color-text);
  font-family: var(--font-stack);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;
}
.tb-text { padding: 0 9px; }
.tb-icon { width: 30px; padding: 0; }
.tb:hover:not(:disabled) { background: var(--color-surface); }
.tb.is-active {
  background: var(--color-accent-soft);
  border-color: transparent;
  color: var(--color-accent);
}
.tb:disabled { opacity: 0.45; cursor: default; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ToolbarButton.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ToolbarButton.tsx src/ui/toolbarButton.css src/ui/ToolbarButton.test.tsx
git commit -m "feat(ui): add shared ToolbarButton primitive"
```

---

## Task 2: Notion-style `Dropdown` selector

**Files:**
- Create: `src/ui/Dropdown.tsx`, `src/ui/dropdown.css`
- Test: `src/ui/Dropdown.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/Dropdown.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown } from './Dropdown';

const options = [
  { value: 'continuous', label: 'Continuous', hint: 'C' },
  { value: 'separate', label: 'Months', hint: 'M' },
];

describe('Dropdown', () => {
  it('shows the current option label on the trigger', () => {
    render(<Dropdown value="continuous" options={options} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Continuous/ })).toBeInTheDocument();
  });

  it('opens the menu and selects an option', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="continuous" options={options} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Continuous/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Months/ }));
    expect(onChange).toHaveBeenCalledWith('separate');
  });

  it('marks the active option as checked', async () => {
    render(<Dropdown value="separate" options={options} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Months/ }));
    expect(screen.getByRole('menuitem', { name: /Months/ })).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/Dropdown.test.tsx`
Expected: FAIL — cannot resolve `./Dropdown`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/Dropdown.tsx
import { useState, useRef } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { ToolbarButton } from './ToolbarButton';
import './dropdown.css';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange(value: T): void;
  ariaLabel?: string;
}

/** Notion-style labeled selector: the trigger names the current value; the menu
 *  lists options with a leading checkmark and an optional keyboard hint. */
export function Dropdown<T extends string>({ value, options, onChange, ariaLabel }: Props<T>) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <ToolbarButton
        ref={anchor as never}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? value}
        <svg className="dd-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </ToolbarButton>
      {open && anchor.current && (
        <AnchoredPopover anchorEl={anchor.current} onClose={() => setOpen(false)} placement="bottom-end">
          <div className="dd-menu" role="menu">
            {options.map((o) => (
              <button
                key={o.value}
                role="menuitem"
                aria-checked={o.value === value}
                className="dd-item"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="dd-check">
                  {o.value === value && (
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="dd-label">{o.label}</span>
                {o.hint && <kbd className="dd-hint">{o.hint}</kbd>}
              </button>
            ))}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
```

> **Note:** `ToolbarButton` must forward its ref for the anchor. Update Task 1's
> component to wrap in `forwardRef` if not already — do it here:
> in `src/ui/ToolbarButton.tsx`, change the export to
> `export const ToolbarButton = forwardRef<HTMLButtonElement, Props>(function ToolbarButton({ variant = 'text', active = false, className = '', ...rest }, ref) { ... return <button ref={ref} className={cls} {...rest} />; });`
> (add `import { forwardRef } from 'react'`). Re-run Task 1's test to confirm still green.

```css
/* src/ui/dropdown.css */
.dd-caret { color: var(--color-text-faint); margin-left: 1px; }
.dd-menu {
  min-width: 200px;
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  padding: 6px;
}
.dd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-stack);
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.dd-item:hover { background: var(--color-muted-bg); }
.dd-check { width: 18px; display: inline-flex; justify-content: center; color: var(--color-accent); }
.dd-label { flex: 1; }
.dd-hint {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--color-text-faint);
  background: var(--color-muted-bg);
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/Dropdown.test.tsx src/ui/ToolbarButton.test.tsx`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add src/ui/Dropdown.tsx src/ui/dropdown.css src/ui/Dropdown.test.tsx src/ui/ToolbarButton.tsx
git commit -m "feat(ui): add Notion-style Dropdown selector"
```

---

## Task 3: `ZoomStepper` capsule

**Files:**
- Create: `src/ui/ZoomStepper.tsx`, `src/ui/zoomStepper.css`
- Test: `src/ui/ZoomStepper.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/ZoomStepper.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomStepper } from './ZoomStepper';

describe('ZoomStepper', () => {
  it('shows the rounded percentage', () => {
    render(<ZoomStepper value={1} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}} fitDisabled={false} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('fires zoom in/out/fit', async () => {
    const onZoomIn = vi.fn(), onZoomOut = vi.fn(), onFit = vi.fn();
    render(<ZoomStepper value={0.8} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFit={onFit} fitDisabled={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fit to width' }));
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onFit).toHaveBeenCalledOnce();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('disables fit when already fitted', () => {
    render(<ZoomStepper value={1} onZoomIn={() => {}} onZoomOut={() => {}} onFit={() => {}} fitDisabled />);
    expect(screen.getByRole('button', { name: 'Fit to width' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ZoomStepper.test.tsx`
Expected: FAIL — cannot resolve `./ZoomStepper`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/ZoomStepper.tsx
import { ToolbarButton } from './ToolbarButton';
import './zoomStepper.css';

interface Props {
  value: number;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  fitDisabled: boolean;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
}

/** Clean zoom capsule (− value +) plus a separate fit-to-width button. */
export function ZoomStepper({ value, onZoomIn, onZoomOut, onFit, fitDisabled, zoomInDisabled, zoomOutDisabled }: Props) {
  return (
    <div className="zoomstep">
      <div className="zoomstep-cap">
        <button className="zoomstep-btn" aria-label="Zoom out" onClick={onZoomOut} disabled={zoomOutDisabled}>−</button>
        <span className="zoomstep-val">{Math.round(value * 100)}%</span>
        <button className="zoomstep-btn" aria-label="Zoom in" onClick={onZoomIn} disabled={zoomInDisabled}>+</button>
      </div>
      <ToolbarButton variant="icon" aria-label="Fit to width" onClick={onFit} disabled={fitDisabled}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 9 4 9 4 4" /><polyline points="15 9 20 9 20 4" />
          <polyline points="9 15 4 15 4 20" /><polyline points="15 15 20 15 20 20" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
```

```css
/* src/ui/zoomStepper.css */
.zoomstep { display: inline-flex; align-items: center; gap: 6px; }
.zoomstep-cap {
  display: inline-flex;
  align-items: center;
  height: 30px;
  border: 0.5px solid var(--color-border);
  background: var(--color-muted-bg);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.zoomstep-btn {
  width: 28px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;
}
.zoomstep-btn:hover:not(:disabled) { background: var(--color-surface); color: var(--color-text); }
.zoomstep-btn:disabled { opacity: 0.4; cursor: default; }
.zoomstep-val {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  min-width: 38px;
  text-align: center;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-left: 0.5px solid var(--color-border);
  border-right: 0.5px solid var(--color-border);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ZoomStepper.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ZoomStepper.tsx src/ui/zoomStepper.css src/ui/ZoomStepper.test.tsx
git commit -m "feat(ui): add ZoomStepper capsule"
```

---

## Task 4: `ExpandingSearch` (lupa)

**Files:**
- Create: `src/ui/ExpandingSearch.tsx`, `src/ui/expandingSearch.css`
- Test: `src/ui/ExpandingSearch.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/ExpandingSearch.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ExpandingSearch } from './ExpandingSearch';

function Harness() {
  const [q, setQ] = useState('');
  return <ExpandingSearch value={q} onChange={setQ} placeholder="Search events" />;
}

describe('ExpandingSearch', () => {
  it('is collapsed until the lupa is clicked, then focuses the input', async () => {
    render(<Harness />);
    const root = screen.getByTestId('expanding-search');
    expect(root).not.toHaveClass('is-open');
    await userEvent.click(screen.getByRole('button', { name: 'Search events' }));
    expect(root).toHaveClass('is-open');
    expect(screen.getByPlaceholderText('Search events')).toHaveFocus();
  });

  it('stays open while it has a value but collapses when emptied and blurred', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Search events' }));
    const input = screen.getByPlaceholderText('Search events');
    await userEvent.type(input, 'dentist');
    input.blur();
    expect(screen.getByTestId('expanding-search')).toHaveClass('is-open');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByTestId('expanding-search')).not.toHaveClass('is-open');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ExpandingSearch.test.tsx`
Expected: FAIL — cannot resolve `./ExpandingSearch`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/ExpandingSearch.tsx
import { useRef, useState } from 'react';
import './expandingSearch.css';

interface Props {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}

/** Lupa that expands into a search field on hover OR click, and collapses on
 *  blur/mouse-leave only when empty. Controlled value. */
export function ExpandingSearch({ value, onChange, placeholder = 'Search' }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = hovered || focused || value.length > 0;

  return (
    <div
      className={`exsearch${open ? ' is-open' : ''}`}
      data-testid="expanding-search"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="exsearch-lupa"
        aria-label={placeholder}
        onClick={() => inputRef.current?.focus()}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="text"
        className="exsearch-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value && (
        <button
          type="button"
          className="exsearch-clear"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

```css
/* src/ui/expandingSearch.css */
.exsearch {
  display: inline-flex;
  align-items: center;
  height: 30px;
  width: 30px;
  border: 0.5px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: width 0.22s ease, background 0.18s ease, border-color 0.18s ease;
}
.exsearch.is-open {
  width: 190px;
  background: var(--color-muted-bg);
  border-color: var(--color-border);
}
.exsearch-lupa {
  flex: none;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.exsearch-input {
  flex: 1;
  min-width: 0;
  width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-stack);
  font-size: 13px;
  color: var(--color-text);
}
.exsearch-clear {
  flex: none;
  width: 24px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-faint);
  cursor: pointer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ExpandingSearch.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/ExpandingSearch.tsx src/ui/expandingSearch.css src/ui/ExpandingSearch.test.tsx
git commit -m "feat(ui): add collapsing ExpandingSearch (lupa)"
```

---

## Task 5: Broaden settings panel ids

**Files:**
- Modify: `src/app/settingsStore.ts:243`
- Test: `src/app/settingsStore.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/app/settingsStore.test.ts
import { useSettingsStore } from './settingsStore';

describe('settingsStore panel routing', () => {
  it('opens and closes settings sections', () => {
    useSettingsStore.getState().openSettings('account');
    expect(useSettingsStore.getState().panel).toBe('account');
    useSettingsStore.getState().openSettings('minimap');
    expect(useSettingsStore.getState().panel).toBe('minimap');
    useSettingsStore.getState().closeSettings();
    expect(useSettingsStore.getState().panel).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/settingsStore.test.ts`
Expected: FAIL — TypeScript error: `'account'` not assignable to `SettingsPanel`.

- [ ] **Step 3: Broaden the type**

In `src/app/settingsStore.ts:243`, replace:

```ts
export type SettingsPanel = 'minimap' | 'calendars';
```

with:

```ts
export type SettingsPanel =
  | 'account'
  | 'calendars'
  | 'appearance'
  | 'categories'
  | 'weather'
  | 'minimap'
  | 'data';
```

No other change needed — `openSettings`/`closeSettings` already accept any `SettingsPanel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/settingsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/settingsStore.ts src/app/settingsStore.test.ts
git commit -m "feat(settings): broaden settings panel ids for sidebar nav"
```

---

## Task 6: Account menu (`AccountMenu`)

**Files:**
- Create: `src/ui/AccountMenu.tsx`, `src/ui/accountMenu.css`
- Test: `src/ui/AccountMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/AccountMenu.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from './AccountMenu';
import { useSettingsStore } from '../app/settingsStore';

describe('AccountMenu', () => {
  it('opens settings on the account section when Settings is clicked', async () => {
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(useSettingsStore.getState().panel).toBe('account');
  });

  it('opens the calendars section from the menu', async () => {
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Calendars' }));
    expect(useSettingsStore.getState().panel).toBe('calendars');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/AccountMenu.test.tsx`
Expected: FAIL — cannot resolve `./AccountMenu`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/AccountMenu.tsx
import { useRef, useState } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { useSettingsStore } from '../app/settingsStore';
import { useAuthStore } from '../auth/authStore';
import { useEntitlementStore } from '../app/entitlementStore';
import './accountMenu.css';

function initials(email: string | undefined): string {
  if (!email) return '?';
  return email.slice(0, 2).toUpperCase();
}

/** Avatar trigger + account dropdown. Replaces the app settings gear. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const email = session?.user.email;
  const isDark = theme === 'dark';

  function go(panel: Parameters<typeof openSettings>[0]) {
    openSettings(panel);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={anchor}
        className="acct-avatar"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {initials(email)}
      </button>
      {open && anchor.current && (
        <AnchoredPopover anchorEl={anchor.current} onClose={() => setOpen(false)} placement="bottom-end">
          <div className="acct-menu" role="menu">
            <div className="acct-head">
              <div className="acct-avatar acct-avatar-lg" aria-hidden="true">{initials(email)}</div>
              <div className="acct-id">
                <div className="acct-email">{email ?? 'Not signed in'}</div>
                <div className="acct-plan">{cloudActive ? 'Cloud plan' : 'Free plan'}</div>
              </div>
            </div>
            <div className="acct-sep" />
            <button role="menuitem" className="acct-item" onClick={() => go('account')}>Settings</button>
            <button role="menuitem" className="acct-item" onClick={() => go('calendars')}>Calendars</button>
            <button
              role="menuitem"
              className="acct-item acct-item-toggle"
              aria-checked={isDark}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              <span>Dark mode</span>
              <span className={`acct-switch${isDark ? ' on' : ''}`} aria-hidden="true"><span className="acct-knob" /></span>
            </button>
            {!cloudActive && (
              <button role="menuitem" className="acct-item acct-item-accent" onClick={() => go('account')}>
                Upgrade to cloud
              </button>
            )}
            {session && (
              <>
                <div className="acct-sep" />
                <button role="menuitem" className="acct-item" onClick={() => { void signOut(); setOpen(false); }}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
```

```css
/* src/ui/accountMenu.css */
.acct-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border: 0.5px solid var(--color-accent);
  font-family: var(--font-stack);
  font-size: 11px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.acct-menu {
  width: 248px;
  background: var(--color-surface);
  border: 0.5px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  padding: 6px;
}
.acct-head { display: flex; align-items: center; gap: 10px; padding: 8px; }
.acct-avatar-lg { width: 38px; height: 38px; font-size: 13px; }
.acct-id { min-width: 0; }
.acct-email { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acct-plan { font-size: 11px; color: var(--color-text-faint); }
.acct-sep { height: 0.5px; background: var(--color-border); margin: 4px 2px; }
.acct-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-stack);
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.acct-item:hover { background: var(--color-muted-bg); }
.acct-item-accent { color: var(--color-accent); }
.acct-switch { width: 34px; height: 20px; border-radius: 10px; background: var(--color-border-strong); position: relative; transition: background 0.15s ease; }
.acct-switch.on { background: var(--color-accent); }
.acct-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.15s ease; }
.acct-switch.on .acct-knob { left: 16px; }
```

> **Note:** verify `useAuthStore` exposes `session` and `signOut`, and
> `useEntitlementStore` exposes `cloudActive` (confirmed in `Settings.tsx`
> imports). If `theme` can be `'system'`, treat non-`'dark'` as light (the toggle
> sets explicit `'light'`/`'dark'`), which matches the code above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/AccountMenu.test.tsx`
Expected: PASS (2 tests). (Auth/entitlement stores default to signed-out; menu still renders Settings/Calendars.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/AccountMenu.tsx src/ui/accountMenu.css src/ui/AccountMenu.test.tsx
git commit -m "feat(ui): add avatar AccountMenu"
```

---

## Task 7: Refit the calendar toolbar

**Files:**
- Modify: `src/features/month-grid/MonthGrid.tsx` (imports + `.month-header`, ~1487–1564)
- Modify: `src/features/month-grid/monthGrid.css` (remove dead `.view-toggle-*`, `.tile-zoom-*`, `.month-today-btn`, `.weather-location-btn` rules)
- Delete: `src/features/settings/CalendarsButton.tsx`

- [ ] **Step 1: Add primitive imports**

At the top of `MonthGrid.tsx`, add:

```tsx
import { Dropdown } from '../../ui/Dropdown';
import { ZoomStepper } from '../../ui/ZoomStepper';
import { ToolbarButton } from '../../ui/ToolbarButton';
import { AccountMenu } from '../../ui/AccountMenu';
```

Remove the import of `CalendarsButton` (`import { CalendarsButton } from '../settings/CalendarsButton';`).

- [ ] **Step 2: Replace the `<nav className="month-nav">` block**

Replace the entire `<nav className="month-nav"> … </nav>` (lines ~1491–1563) with:

```tsx
<nav className="month-nav">
  {weatherAndLocationEnabled && (
    <button className="month-weather-glance" onClick={handleLocationClick} title="Change location">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 6.5 19z" />
      </svg>
      <span>{locationName}</span>
    </button>
  )}
  <Dropdown
    ariaLabel="Calendar layout"
    value={calendarViewMode}
    options={[
      { value: 'continuous', label: 'Continuous', hint: 'C' },
      { value: 'separate', label: 'Months', hint: 'M' },
    ]}
    onChange={setCalendarViewMode}
  />
  <ToolbarButton onClick={scrollToToday} disabled={todayVisible}>
    {todayVisible ? 'Showing today' : 'Today'}
  </ToolbarButton>
  <ZoomStepper
    value={tileScale}
    onZoomOut={() => setTileScale(Math.max(0.5, Number((tileScale - 0.05).toFixed(2))))}
    onZoomIn={() => setTileScale(Math.min(1.5, Number((tileScale + 0.05).toFixed(2))))}
    onFit={() => setTileScaleAuto()}
    fitDisabled={tileScaleAuto}
    zoomOutDisabled={tileScale <= 0.5}
    zoomInDisabled={tileScale >= 1.5}
  />
  <div className="month-nav-sep" />
  <AccountMenu />
</nav>
```

> `setCalendarViewMode` takes `'continuous' | 'separate'`; the `Dropdown<T>`
> generic infers `T` from the options, so `onChange={setCalendarViewMode}` typechecks.

- [ ] **Step 3: Add minimal new CSS, remove dead rules**

In `monthGrid.css`, delete the now-unused `.view-toggle-control`, `.view-toggle-btn`, `.tile-zoom-control`, `.tile-zoom-*`, `.month-today-btn`, and `.weather-location-btn` rule blocks. Add:

```css
.month-nav { display: flex; align-items: center; gap: 6px; }
.month-nav-sep { width: 0.5px; height: 22px; background: var(--color-border); margin: 0 2px; }
.month-weather-glance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 6px;
  margin-right: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-stack);
  font-size: 12px;
  cursor: pointer;
}
.month-weather-glance:hover { color: var(--color-text); }
```

- [ ] **Step 4: Delete `CalendarsButton.tsx`**

```bash
git rm src/features/settings/CalendarsButton.tsx
```

Confirm no other importers: `git grep -n CalendarsButton` should return nothing.

- [ ] **Step 5: Typecheck + run the month-grid tests**

Run: `npx tsc --noEmit && npx vitest run src/features/month-grid`
Expected: no type errors; existing `MonthGrid.test.tsx` passes.

- [ ] **Step 6: Manual verification (dev server)**

Run `npm run dev`, open the app. Confirm: layout dropdown switches Continuous/Months, Today scrolls to today and disables when today is visible, zoom capsule changes tile size and fit re-fits, avatar opens the account menu, weather glance opens the location dialog. Check light + dark.

- [ ] **Step 7: Commit**

```bash
git add src/features/month-grid/MonthGrid.tsx src/features/month-grid/monthGrid.css
git commit -m "feat(calendar): refit toolbar onto shared control language"
```

---

## Task 8: Lupa search + button restyle in the Upcoming header

**Files:**
- Modify: `src/features/upcoming-stack/UpcomingStack.tsx` (~786–873)
- Modify: `src/features/upcoming-stack/upcomingStack.css` (search + action button styles)

- [ ] **Step 1: Swap the search block for `ExpandingSearch`**

Add import at top of `UpcomingStack.tsx`:

```tsx
import { ExpandingSearch } from '../../ui/ExpandingSearch';
```

Replace the `<div className={`upcoming-search…`}> … </div>` block (the search icon + input + clear, ~817–844) with:

```tsx
<ExpandingSearch
  value={view.query}
  onChange={(query) => setView({ ...view, query })}
  placeholder="Search events"
/>
```

- [ ] **Step 2: Restyle the filter and add buttons**

Give the existing `upcoming-filter-btn` and `upcoming-add` buttons the shared icon-button look by adding the `tb tb-icon` classes (keep their existing classes for any JS hooks):

```tsx
className={`upcoming-filter-btn tb tb-icon ${filterAnchorEl ? 'is-active' : ''}`}
```
```tsx
className="upcoming-add tb tb-icon"
```

Add `import '../../ui/toolbarButton.css';` near the other imports if not transitively loaded.

- [ ] **Step 3: Remove dead search CSS**

In `upcomingStack.css`, delete `.upcoming-search`, `.upcoming-search-icon`, `.upcoming-search-mini`, `.upcoming-search-clear` rule blocks (now provided by `ExpandingSearch`).

- [ ] **Step 4: Typecheck + run upcoming tests**

Run: `npx tsc --noEmit && npx vitest run src/features/upcoming-stack`
Expected: no type errors; existing tests pass.

- [ ] **Step 5: Manual verification**

In `npm run dev`: the Upcoming header shows a lupa that expands on hover and on click, focuses the input, filters the list as you type, keeps open while it has text, collapses when cleared. Filter/add buttons match the toolbar style.

- [ ] **Step 6: Commit**

```bash
git add src/features/upcoming-stack/UpcomingStack.tsx src/features/upcoming-stack/upcomingStack.css
git commit -m "feat(upcoming): collapsing lupa search and unified action buttons"
```

---

## Task 9: Settings left-sidebar nav

**Files:**
- Modify: `src/features/settings/Settings.tsx` (the render block from ~471)
- Modify: `src/features/settings/settings.css`

- [ ] **Step 1: Add the section nav model**

Near the top of the `Settings` component body, add a nav definition and treat the open `panel` as the active section (default `'account'` when the panel is any non-minimap value):

```tsx
const SECTIONS: { id: SettingsPanel; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'calendars', label: 'Calendars' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'categories', label: 'Categories' },
  { id: 'weather', label: 'Weather & grid' },
  { id: 'minimap', label: 'Minimap' },
  { id: 'data', label: 'Data' },
];
```

Import the `SettingsPanel` type: `import { useSettingsStore, /* … */, type SettingsPanel } from '../../app/settingsStore';` (extend the existing import).

- [ ] **Step 2: Wrap the card in a two-pane layout**

Replace the `<div className="settings-card">` header + body structure so the card holds a left nav and a right content pane. The minimap panel keeps its dedicated view; everything else renders under the sidebar. Structure:

```tsx
<div className="settings-backdrop" onClick={close}>
  <div className="settings-card settings-card-split" onClick={(e) => e.stopPropagation()}>
    {panel === 'minimap' ? (
      <MinimapSettings /* existing minimap section JSX, unchanged */ />
    ) : (
      <>
        <nav className="settings-nav">
          <div className="settings-nav-account">
            {/* avatar + email, reuse acct-avatar styles or a simple initials circle */}
          </div>
          {SECTIONS.filter((s) => s.id !== 'minimap').map((s) => (
            <button
              key={s.id}
              className={`settings-nav-item${panel === s.id ? ' is-active' : ''}`}
              onClick={() => useSettingsStore.getState().openSettings(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          <header className="settings-header">
            <h2>{SECTIONS.find((s) => s.id === panel)?.label ?? 'Settings'}</h2>
            <button className="settings-close" onClick={close} aria-label="Close settings">{/* existing × svg */}</button>
          </header>
          {panel === 'account' && (/* account: sign-in + Apple/Google connect, moved from the old calendars section */)}
          {panel === 'calendars' && (/* calendar list / connect existing markup */)}
          {panel === 'appearance' && (/* theme seg + accent color existing markup */)}
          {panel === 'categories' && (/* categories existing markup */)}
          {panel === 'weather' && (/* weather + grid existing markup */)}
          {panel === 'data' && (/* export/import existing markup */)}
        </div>
      </>
    )}
  </div>
</div>
```

> This regroups the existing JSX — no controls are removed, each block moves under
> the matching `panel ===` guard. Keep all existing handlers and state. The old
> single `panel === 'calendars'` section is split: account UI → `'account'`,
> calendar list → `'calendars'`, theme/accent → `'appearance'`, etc.

- [ ] **Step 3: Add sidebar CSS**

In `settings.css`, add:

```css
.settings-card-split { display: flex; padding: 0; width: min(760px, 92vw); max-height: 84vh; overflow: hidden; }
.settings-nav {
  width: 172px;
  flex: none;
  border-right: 0.5px solid var(--color-border);
  background: var(--color-bg);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.settings-nav-item {
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: var(--font-stack);
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.settings-nav-item:hover { background: var(--color-muted-bg); color: var(--color-text); }
.settings-nav-item.is-active { background: var(--color-accent-soft); color: var(--color-accent); font-weight: 500; }
.settings-pane { flex: 1; min-width: 0; padding: 16px 20px; overflow-y: auto; }
```

- [ ] **Step 4: Typecheck + run settings-adjacent tests**

Run: `npx tsc --noEmit && npx vitest run src/app/settingsStore.test.ts src/ui/AccountMenu.test.tsx`
Expected: PASS; no type errors.

- [ ] **Step 5: Manual verification**

In `npm run dev`, open settings from the avatar menu. Confirm: left nav lists all sections, clicking each swaps the right pane, Account shows sign-in + connect, the minimap entry (opened from the minimap header) still shows the minimap panel, close works, dark mode looks right, layout respects `--font-scale`.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/Settings.tsx src/features/settings/settings.css
git commit -m "feat(settings): left-sidebar nav layout"
```

---

## Task 10: Consistency rollout to remaining surfaces

**Files:**
- Modify: popovers/editors that still use ad-hoc buttons — `src/features/upcoming-stack/upcomingStack.css` (filter panel), `src/features/event-editor/EventForm.tsx`, `src/features/span-editor/SpanForm.tsx`, `src/features/year-circle/MinimapHeader.tsx`, and shared `src/ui/contextMenu.css` / `confirmDialog.css` as needed.

- [ ] **Step 1: Inventory ad-hoc buttons**

Run: `git grep -nE "className=\"[^\"]*(btn|button)" src/features src/ui` and list buttons not yet using `tb`/primitive classes. Focus on visible action buttons in editors, the filter/sort popover, the minimap header, and confirm/context menus.

- [ ] **Step 2: Apply the shared classes**

For each plain secondary button, add `tb tb-text` (or `tb tb-icon` for icon-only); for primary/confirm actions keep a primary style (accent fill) — add a `.tb-primary` modifier to `toolbarButton.css`:

```css
.tb-primary { background: var(--color-accent); border-color: transparent; color: #fff; }
.tb-primary:hover:not(:disabled) { filter: brightness(0.95); background: var(--color-accent); }
```

Apply `className="tb tb-text tb-primary"` to the main confirm action in each editor (e.g. Save). Leave inputs/switches as-is (already themed).

- [ ] **Step 3: Restyle the minimap header controls**

In `MinimapHeader.tsx`, give its mode/size controls the `tb` classes so it matches; keep handlers. Ensure the minimap settings entry still calls `openSettings('minimap')`.

- [ ] **Step 4: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Manual verification across surfaces**

In `npm run dev`: open an event editor, the upcoming filter popover, a delete/confirm dialog, and the minimap — confirm buttons share the gray language, primary actions use the accent fill, and dark mode + `--font-scale` look correct. Check mobile width (DevTools responsive ~390px): toolbars collapse to icon buttons + avatar; lupa, dropdown, and account menu all work on tap.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): roll out unified button language across editors, popovers, minimap"
```

---

## Task 11: Docs + final pass

**Files:**
- Modify: relevant docs/roadmap per [[update-docs-thoroughly]].

- [ ] **Step 1: Update docs**

Update any UI/setup/roadmap docs that describe the old toolbar, the settings gear, or the search box. Note what shipped vs deferred (prev/next chevrons and ⌘K are deferred).

- [ ] **Step 2: Full verification**

Run: `npm run build` (which runs `tsc && vite build`) and `npx vitest run`.
Expected: clean build, all tests green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(ui): update docs for the UI rework"
```

---

## Self-review notes

- **Spec coverage:** design language → Tasks 1–4, 10; calendar toolbar → 7; layout
  selector → 2/7; zoom → 3/7; lupa search → 4/8; avatar menu → 6/7; settings
  sidebar → 5/9; whole-app rollout + mobile → 10; docs → 11. All spec sections map
  to a task.
- **Type consistency:** `SettingsPanel` extended once (Task 5) and consumed in
  Tasks 6/9; `Dropdown<T>` generic matches `setCalendarViewMode` signature
  (`'continuous' | 'separate'`); `ToolbarButton` gains `forwardRef` in Task 2 and
  is used everywhere after.
- **Non-goals respected:** no palette change, no ⌘K, no data/sync changes.
