# Upcoming "Tightness" (Density) Control — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)

## Goal

Add a continuous size/density control to the Upcoming settings (gear) popover so
the user can make all upcoming event cards uniformly smaller/tighter or bigger.
Default 100%, with a reset icon — matching the day-style popover's ↺ affordance.

## Decisions

- **Scales the whole card** (text + padding + inter-card gaps) via a single zoom
  factor, so 80% is uniformly tighter/smaller and 120% bigger.
- **Control:** a slider with a live `%` readout (default 100%) and a ↺ reset icon
  (enabled only when ≠ 100%).
- **Range 70%–130%, step 5%.**

## Mechanism

Apply CSS `zoom: <density>` (a number, 1 = 100%) inline to the scrollable
`.upcoming-list` and to the `.ongoing-section` above it, so every event card
scales. `zoom` scales layout uniformly and is reflected in
`getBoundingClientRect()`, so:
- the marquee (`useMarqueeSelect`) keeps selecting accurately at any zoom, and
- scrolling and the auto-hiding scrollbar are unaffected.

Tauri runs a Chromium WebView and the codebase already relies on Chromium-only
`::-webkit-scrollbar`, so `zoom` is an acceptable, simplest-possible knob here.

## State & persistence

Mirror the existing settings pattern in `UpcomingStack.tsx`:

```ts
const [density, setDensity] = useState<number>(() => {
  const v = parseFloat(localStorage.getItem('upcoming_density') ?? '');
  return clampDensity(Number.isFinite(v) ? v : 1);
});
const changeDensity = (v: number) => {
  const d = clampDensity(v);
  setDensity(d);
  localStorage.setItem('upcoming_density', String(d));
};
```

Default 1.0. `changeDensity` is also the reset (`changeDensity(1)`).

## Pure helper (unit-tested)

```ts
// in upcoming.ts (or a small local module)
export const DENSITY_MIN = 0.7;
export const DENSITY_MAX = 1.3;
export const DENSITY_STEP = 0.05;
export function clampDensity(v: number): number; // clamp to [MIN,MAX], round to STEP
```

Tests: below-min clamps to 0.7, above-max to 1.3, rounds to the nearest 5%, and
a NaN-safe path (handled at the call site by defaulting to 1).

## UI

In `upcoming-settings-popover`, after the Card Visibility block:

```
Tightness
[↺]  ──────●────────  100%
```

- Title `Tightness` (reuse `.upcoming-settings-title`).
- A `.upcoming-density-row` (flex, centered) containing:
  - ↺ reset icon-button, `disabled` when `density === 1`.
  - `<input type="range" min=0.7 max=1.3 step=0.05 value={density}
    onChange={e => changeDensity(parseFloat(e.target.value))} />`.
  - `<span>{Math.round(density * 100)}%</span>` readout.

New CSS: `.upcoming-density-row` layout + range-input styling consistent with the
popover; reset icon reuses the existing small icon-button look.

## Application in render

- `<div className="upcoming-list" style={{ zoom: density }} …>`
- `<div className="ongoing-section" style={{ zoom: density }}>` (when rendered)

`zoom` accepts a unitless number in Chromium; React passes it through inline.

## Interaction with Compact

Independent and composable: Compact changes layout structure; tightness scales
whatever layout is active.

## Verification

- `tsc --noEmit` clean; vitest green incl. new `clampDensity` tests.
- Browser: dragging the slider scales all cards live; the `%` readout updates;
  reset returns to 100% and disables; the value persists across reload; the
  marquee still selects the correct cards at, e.g., 80% and 120%.

## Out of scope

- A separate spacing-only knob (this control scales the whole card).
- Applying density anywhere outside the Upcoming panel.
