# Upcoming Marquee (Drag-to-Select) — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)

## Goal

Let the user select multiple events in the Upcoming list by pressing on empty
space and dragging a selection rectangle ("marquee" / rubber-band). Every event
card the rectangle touches is selected. Standard desktop file-manager behavior.

## Decisions

- **Mouse only.** Marquee activates for mouse drags; touch-drag keeps scrolling
  the list (no gesture hijacking).
- **Replace semantics.** Each drag sets the selection to exactly the cards inside
  the rectangle, clearing any prior selection.
- **Auto-enter selection mode.** No need to pre-enable; the drag enters tap-mode
  selection so the floating `SelectionBar` appears and subsequent clicks toggle.
- **Scope:** the scrollable `.upcoming-list` only. The month grid and the small
  ongoing strip above the list are out of scope.

## Architecture

A focused hook `src/features/upcoming-stack/useMarqueeSelect.ts`:

```ts
function useMarqueeSelect(
  listRef: RefObject<HTMLElement>,
): { onPointerDown: (e: React.PointerEvent) => void; marquee: Rect | null }
```

- `Rect = { left: number; top: number; width: number; height: number }` in
  viewport coordinates (for a `position: fixed` overlay).
- The hook owns its drag state (start point, active flag, current rect) via
  refs/state and talks to the selection store through
  `useSelectionStore.getState()` (`enter`, `selectMany`, `exit`, `active`).

`UpcomingStack` attaches `onPointerDown` to the `.upcoming-list` element and
renders the rectangle when `marquee` is non-null.

## Mechanics

- **onPointerDown** — start a drag only if all hold:
  - `e.pointerType === 'mouse'` and `e.button === 0`
  - `!(e.target as HTMLElement).closest('.upcoming-card')` (empty space)
  - not on the scrollbar: `e.nativeEvent.offsetX < listEl.clientWidth`
  Record the start point; `listEl.setPointerCapture(e.pointerId)`.
- **onPointerMove** — once the pointer has moved past a ~4px threshold from the
  start (so a plain click doesn't enter selection):
  - Compute the marquee rect from start→current (min/max), clamped to the list's
    visible bounds.
  - Collect `listEl.querySelectorAll('.upcoming-card[data-event-id]')` whose
    `getBoundingClientRect()` intersects the rect; gather their `data-event-id`s.
  - If selection isn't active, `enter()`; then `selectMany(ids)` (replace).
  - Set the `marquee` rect for rendering.
- **onPointerUp** — release capture; clear the `marquee` rect; keep the
  selection. If the threshold was never crossed (a plain click on empty space)
  and a selection is active, `exit()` (click-empty-space deselects).

## Supporting changes

- Add `data-event-id={event.id}` to each upcoming card so the hook maps DOM
  elements → event ids robustly (cards currently carry only a composite DOM
  `id`). Selection is by event id, matching the existing store model.
- New CSS `.upcoming-marquee`: `position: fixed`, accent-tinted translucent
  fill + 1px accent border, `pointer-events: none`, high `z-index`.

## Geometry helper (unit-tested)

Extract a pure function:

```ts
export function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean
```

Unit tests cover overlap, edge-touching, and fully-disjoint cases. The pointer
orchestration is verified in the browser (jsdom has no layout).

## Verification

- `tsc --noEmit` clean; vitest green incl. new `rectsIntersect` tests.
- Browser: mouse-drag across several cards selects exactly those enclosed; the
  `SelectionBar` shows the count; a second drag replaces the selection; clicking
  empty space exits; touch-drag still scrolls; card heights unaffected.

## Out of scope (v1) — possible follow-ups

- Auto-scroll the list when the drag reaches its top/bottom edge.
- Shift/Ctrl additive drag (union with the existing selection).
- Marquee over the ongoing strip.
