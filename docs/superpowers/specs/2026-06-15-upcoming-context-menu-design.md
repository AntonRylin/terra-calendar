# Upcoming-list right-click context menu

**Date:** 2026-06-15
**Status:** Approved

## Problem

In the Upcoming/Ongoing panel, left-clicking an event card both moves the
calendar to the event *and* opens the edit popover. The user wants left-click to
only navigate the calendar (already the desired navigation), and to surface the
edit and other per-event actions through a **right-click context menu** instead.

## Scope

Only the cards in the left **Upcoming** and **Ongoing** panels
(`src/features/upcoming-stack/UpcomingStack.tsx`). Month-grid chips and spans are
out of scope and unchanged.

## Behavior

### Left-click (and Enter / Space)
- Moves the calendar to the event via `setViewedDate`.
  - Upcoming card → `setViewedDate(date)` (the card's occurrence date).
  - Ongoing card → `setViewedDate(start)`.
- No longer opens the editor.
- Bulk-select mode is unchanged: in selection mode, click still toggles
  selection.

### Right-click (`onContextMenu`)
- `preventDefault()` (suppress the native browser menu).
- Opens a context menu at the cursor position with four items:
  1. **Show in calendar** — `setViewedDate(date | start)`.
  2. **Modify** — opens the existing editor popover, anchored to the card:
     - span / ongoing card → `openSpanEdit(event.id, start, end, cardEl)`
     - normal / recurring card → `openEditor(event.id, cardEl, occurrenceDate)`
     - Modify only edits; it does not also move the calendar.
  3. **Duplicate** — see below.
  4. **Delete** (danger styling) — reuses the existing `handleDelete`, preserving
     the recurring "this occurrence / whole series" confirm flow.
- In bulk-select mode the context menu does not open.

### Duplicate semantics
Creates a one-time copy via `addEvent`, placed on the same date so it appears
adjacent to the original for further editing/moving. Copied fields: `title`,
`time`, `description`, `type`, `color`, `showOnMinimap`, `calendarUrl`, `tz`.
New `id` is assigned by `addEvent`.

- **Plain one-time event** → copy on the same `date`.
- **Span** → copy `date` and `endDate` (the full range).
- **Recurring event** → copy *only the clicked occurrence* as a standalone
  one-time event (`recurrence: null`) on that occurrence date, applying that
  occurrence's `dayOverrides` (title/time) if present. This avoids creating a
  second overlapping series.

## Components

### `ContextMenu` (new, `src/ui/ContextMenu.tsx`)
Reusable presentational menu rendered inside the existing `AnchoredPopover`
(inherits portal, outside-click/Escape dismiss, flip/shift positioning).

- Props: `{ anchor: Element | VirtualElement; onClose(): void; items: ContextMenuItem[] }`
- `ContextMenuItem`: `{ label: string; onClick(): void; danger?: boolean }`
- Each item is a button; on click it runs `item.onClick()` then `onClose()`.
- Placement: `bottom-start`.
- Styling added to `src/ui/popover.css` (or a colocated css), matching existing
  popover look.

### `AnchoredPopover` change
Widen the `anchorEl` prop type from `Element` to
`Element | VirtualElement` (imported from `@floating-ui/react`). floating-ui's
`elements.reference` already accepts virtual elements, so this is a
backward-compatible type widening — no runtime change for existing callers.

### `UpcomingStack` changes
- Add local menu state (mirrors the existing `filterAnchorEl` pattern):
  ```ts
  const [menu, setMenu] = useState<{
    items: ContextMenuItem[];
    anchor: VirtualElement;
  } | null>(null);
  ```
- `cardClick` (both Upcoming and Ongoing) drops the editor call; keeps the
  `setViewedDate` navigation and the selection-toggle branch.
- Add an `onContextMenu` handler on each card that:
  - returns early if `selectionActive`,
  - `preventDefault()`s,
  - builds a zero-size virtual anchor at `{ clientX, clientY }`,
  - builds the four items (capturing `event`, `occurrenceDate`/`start`/`end`,
    and the card element for the editor anchor),
  - sets `menu`.
- Render `<ContextMenu>` when `menu` is set.

A small helper builds the virtual anchor:
```ts
function pointAnchor(x: number, y: number): VirtualElement {
  return { getBoundingClientRect: () => ({
    x, y, top: y, left: x, right: x, bottom: y, width: 0, height: 0,
  }) as DOMRect };
}
```

## Out of scope / unchanged
- The per-card ✕ delete button stays.
- Month-grid chips/spans behavior.
- Mobile: `AnchoredPopover` already renders a bottom-sheet variant; if a touch
  device fires `contextmenu` (long-press), the menu shows as a sheet. No extra
  work, no guarantees.

## Testing
- Left-click an Upcoming card → calendar navigates, editor does NOT open.
- Right-click an Upcoming card → menu appears at cursor with the four items.
- Modify → editor opens anchored to the card.
- Duplicate (one-time) → a copy appears on the same date.
- Duplicate (recurring occurrence) → a one-time copy appears on that date; the
  series is unchanged.
- Delete (recurring) → the existing this-occurrence/whole-series confirm runs.
- Selection mode → click toggles selection; right-click does nothing.
