# Animated event cosmetics

**Date:** 2026-06-15
**Status:** Approved

## Problem

Events are currently styled by a single solid `color`. The user wants a premium,
customizable layer of **prebuilt animated cosmetics** (gradient "skins" and
animated effects) applied to events across the calendar — extending the vibe of
the existing animated text gradient on `.upcoming-type`.

## Goals

- A fixed library of named, animated cosmetics selectable per event.
- Per-category default cosmetic, inherited by events of that category.
- Cosmetics visible on month-grid chips, multi-day span bars, and the minimap.
- Respect `prefers-reduced-motion` (show the gradient, drop the animation).

## Cosmetic library

`src/core/cosmetics.ts` — a pure registry, no React.

```ts
export type CosmeticKind = 'gradient' | 'effect';

export interface Cosmetic {
  id: string;          // stable id stored on events, e.g. 'aurora'
  name: string;        // display label, e.g. 'Aurora'
  kind: CosmeticKind;  // 'gradient' = self-contained; 'effect' = uses event color
  swatch?: string;     // representative hex for the minimap; omitted for effects
                       // (effects are color-derived, so the minimap uses event.color)
}

export const COSMETICS: Cosmetic[] = [ /* 11 entries, order below */ ];
```

Eleven cosmetics:

| id | name | kind | swatch |
|----|------|------|--------|
| `aurora` | Aurora | gradient | `#1d9e75` |
| `sunset` | Sunset | gradient | `#d85a30` |
| `ocean` | Ocean | gradient | `#185fa5` |
| `rainbow` | Rainbow | gradient | `#7f77dd` |
| `gold` | Gold | gradient | `#caa033` |
| `candy` | Candy | gradient | `#d4537e` |
| `magma` | Magma | gradient | `#e24b4a` |
| `mint` | Mint | gradient | `#5dcaa5` |
| `shimmer` | Shimmer | effect | — (uses event color) |
| `glow` | Glow | effect | — (uses event color) |
| `sheen` | Sheen | effect | — (uses event color) |

Helpers:

```ts
const byId = new Map(COSMETICS.map((c) => [c.id, c]));
export function cosmeticById(id?: string): Cosmetic | undefined;     // byId.get(id)
export function cosmeticClass(id?: string): string | undefined;      // 'cosmetic-aurora'
/** event.cosmetic wins; else the event's category default; else undefined. */
export function resolveCosmetic(
  event: Pick<CalendarEvent, 'cosmetic' | 'type'>,
  categories: Record<string, CategoryConfig>,
): string | undefined;
```

`resolveCosmetic` returns an id only if it exists in `byId` (ignore unknown/stale
ids so a removed cosmetic degrades to plain).

## Styles

`src/ui/cosmetics.css` — imported by the components that render events (after
`monthGrid.css` so cosmetic rules win on equal specificity). To stay robust
regardless of bundle order, each cosmetic rule is scoped to its host elements
(`.event-chip.cosmetic-x, .span-seg.cosmetic-x`).

- Shared reset for any cosmetic chip: remove the timed-chip left border, make the
  time text inherit the chip's text color.
- **Gradient kind** (`.cosmetic-aurora` …): `background-image: linear-gradient(110deg, …)`,
  `background-size: 300% 100%`, `animation: cos-flow <dur> linear infinite`,
  `color: #fff`, `text-shadow: 0 1px 2px rgba(0,0,0,.38)`. Gold uses dark text.
- **Effect kind**:
  - `shimmer`: solid `var(--event-color)` base + an `::after` light band that
    sweeps across (`cos-shimmer`). Text uses `--event-text-color`.
  - `glow`: solid base + pulsing `box-shadow`/`filter: brightness` (`cos-glow`).
  - `sheen`: a tight gradient built from the base color that drifts (`cos-flow`,
    slower).
- `@keyframes cos-flow { to { background-position: 300% 50%; } }` and the others.
- `@media (prefers-reduced-motion: reduce)` disables all cosmetic animations.

The exact gradient stops/durations are the ones validated in the brainstorming
preview widget.

## Data model

`src/core/types.ts`:
- `CalendarEvent.cosmetic?: string` — cosmetic id; absent = plain (current look).

`src/app/settingsStore.ts`:
- `CategoryConfig.cosmetic?: string` — per-category default; persisted with the
  rest of `categories` (no migration needed, optional field).

`src/app/store.ts`:
- Add `cosmetic?: string` to `NewEventInput` and `EventPatch`; carry it through
  `addEvent` (set on the created event) and `updateEvent` (already spreads patch).

`EventFormValues` (`EventForm.tsx`): add `cosmetic?: string`.

## Applying cosmetics

### Month-grid chips and span bars (`MonthGrid.tsx`)
For each rendered occurrence resolve `cosmeticId = resolveCosmetic(event, categories)`.
- Add `cosmeticClass(cosmeticId)` and a kind marker (`cosmetic-gradient` /
  `cosmetic-effect`) to the chip/span `className`.
- Keep setting `--event-color` (and `--event-text-color` for chips). Effects rely
  on these; gradient skins override the background and force white text via CSS.
- Spans currently set `background-color` inline; when a gradient cosmetic is
  present, omit the inline background so the cosmetic class fills the bar. (Set
  `--event-color` regardless for the effect kinds and selection outline.)
- `categories` comes from `useSettingsStore((s) => s.categories)`.

### Minimap (`circle.ts` + `YearCircle.tsx`)
- `computeYearDots` and `computeYearBands` gain a `categories` parameter and set
  `color = cosmeticById(resolveCosmetic(event, categories))?.swatch || event.color`
  (effects have no swatch, so they keep `event.color`).
- No animation on the minimap (SVG strokes); the representative swatch color is
  enough to mark the event as special.

## Picking a cosmetic

### Per-event — `CosmeticSelector` (new, `src/ui/CosmeticSelector.tsx`)
A horizontal strip of small buttons: a "None" option plus one swatch per cosmetic,
each rendered with its real `cosmetic-<id>` class at chip-swatch size so it
previews live. Effect swatches set `--event-color` to the form's current color so
the preview matches. Props: `{ value, onChange, color }`.

In `EventForm`, add a new row labeled **Style** directly under the Color row,
wired to a `cosmetic` state field (initialized from `initial.cosmetic`), included
in `onChange`/`submit` payloads.

### Per-category — Settings category editor (`Settings.tsx`)
Add a "Default event style" `CosmeticSelector` in the per-category config section,
reading/writing `config.cosmetic` via the existing `setCategoryConfig`. This is
separate from the existing label-gradient controls.

## Duplicate action

`UpcomingStack.duplicateEvent` already copies cosmetic-relevant fields; add
`cosmetic: event.cosmetic` to both the recurring and non-recurring copy paths.

## Out of scope / unchanged
- Upcoming/Ongoing cards (the left panel) — not skinned in this pass.
- Arbitrary user-authored cosmetics — the library is a fixed registry (easy to
  extend in code later).
- The existing category *label* gradient system stays as-is.

## Testing
- `cosmetics.ts` unit tests: `cosmeticById`, `cosmeticClass`, and `resolveCosmetic`
  precedence (event over category, unknown id → undefined, no category → event
  only).
- `circle.ts`: a cosmetic event's dot/band uses the swatch color; a plain event
  still uses `event.color`.
- Manual/browser: chip + span show the animated skin; effect skins use the chosen
  color; minimap shows the swatch color; reduced-motion disables animation;
  category default applies and is overridden by a per-event choice.
