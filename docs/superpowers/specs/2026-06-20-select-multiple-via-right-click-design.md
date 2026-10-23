# Select-Multiple via Right-Click — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)

## Goal

Replace the Upcoming panel's toolbar "select multiple" button with a right-click
context-menu action. Right-clicking an event card offers **Select multiple**,
which enters selection mode and pre-selects that card, then lets the user keep
selecting other cards exactly like the current mode.

## Background

- `src/features/upcoming-stack/UpcomingStack.tsx` has a header checkbox button
  (~lines 548–558) that toggles selection mode via `enterSelection()` /
  `exitSelection()` (tap mode: plain clicks toggle).
- `buildMenuItems` builds the right-click menu shared by both the upcoming and
  the ongoing cards (`onContextMenu` → `openCardMenu`).
- `openCardMenu` early-returns when `selectionActive`, so the menu only opens
  when not already selecting.
- Selection store (`src/app/selectionStore.ts`): `enter()` (tap mode, active,
  empty selection), `toggle(id)`, `exit()`.
- `src/features/bulk-select/SelectionBar.tsx` is a floating bar shown whenever a
  selection is active: count, select-all/clear-all, delete selected, and a
  Cancel (✕) that calls `exit()`. This is the exit affordance once the header
  button is gone.

## Design

1. **Remove** the header select-multiple `<button>` (lines ~548–558).
2. **Add** to `buildMenuItems`, after `Duplicate` and before `Compact View`:
   ```ts
   { label: 'Select multiple', onClick: () => { enterSelection(); toggleSelection(event.id); } }
   ```
   - `enterSelection()` puts the panel in tap selection mode.
   - `toggleSelection(event.id)` pre-selects the right-clicked card.
   - Subsequent plain clicks on other cards toggle them (existing behavior).
   - The floating `SelectionBar` provides finish/cancel + bulk actions.

Both list sections route through `buildMenuItems`, so the single addition covers
upcoming and ongoing cards.

## Out of scope / unchanged

- Selection store, `SelectionBar`, shift+click quick-selection, and the
  month-grid selection behavior are untouched.
- No data-model or persistence changes.

## Verification

- `tsc --noEmit` clean; existing vitest suite green (no logic change, but run to
  confirm nothing references the removed button path).
- Preview: confirm the header checkbox button is gone; right-click an upcoming
  card → "Select multiple" enters selection mode with that card pre-selected;
  click another card to add it; SelectionBar shows the running count; Cancel
  exits. Repeat from an ongoing card.
