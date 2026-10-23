# Upcoming Filter Popover — Consistency + Multi-Category — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm)

## Goal

Make the Upcoming section's Filter & Sort popover visually and structurally
consistent with the day-editing (special-day) popover, and make the Category
filter **multi-select** — multiple categories selectable at once, the same way
effects are multi-selectable in the day popover.

## Background

- Filter popover lives in `src/features/upcoming-stack/UpcomingStack.tsx`
  (`filterAnchorEl` block). Today it is four `<select>` dropdowns (Order, Repeat,
  Time, Category) plus a full-width "Reset to Default" button, styled with
  `.upcoming-popover-*`, `.upcoming-select`, `.upcoming-reset-btn`.
- The day popover (`src/features/special-day/SpecialDayHost.tsx` +
  `specialDay.css`) uses two reusable patterns: a single-select **segmented
  control** with a sliding thumb (`.sd-segment` / `.sd-segment-thumb` /
  `.sd-segment-btn`) for recurrence, and **multi-select pills** (`.sd-pill`) for
  effects, inside labelled `.sd-section` blocks with a `.sd-topbar` (↺ + ✕).
- The filter `view` is component `useState` only — **not persisted**. No
  migration is required.

## Design

Adopt the day popover's structure wholesale:

1. **Topbar** (`.sd-topbar`): a ↺ icon-button (`.sd-icon-btn`) that resets to
   `DEFAULT_UPCOMING_VIEW`, disabled when already default; plus a ✕ icon-button
   that closes the popover. This replaces the bottom "Reset to Default" button.
2. **Order / Repeat / Time** — three single-select **segmented controls**, one
   per `.sd-section` with an uppercase `.sd-label`, using the exact recurrence
   markup (sliding `.sd-segment-thumb` positioned by selected index):
   - Order: Date Asc / Date Desc / Alphabetical
   - Repeat: All Events / One-time / Repeating
   - Time: All Times / Timed / All-day
3. **Category** — multi-select **pills** (`.sd-pill`, `.sd-pills`):
   - An **All** pill, `.selected` when `categories.length === 0`; clicking it
     sets `categories: []`.
   - A **No Category** pill (token `'none'`) for uncategorized events.
   - One pill per existing category.
   - Toggling any specific pill adds/removes its value; selecting any specific
     category leaves All visually unselected (because the array is non-empty).

### Styling — reuse, don't duplicate

The `.sd-*` classes are already global (specialDay.css is imported app-wide via
MonthGrid). Reuse them directly so the two popovers stay pixel-identical and
cannot drift. Add an explicit `import '../special-day/specialDay.css'` to
UpcomingStack for clarity. Remove the now-unused `.upcoming-popover-content`,
`.upcoming-popover-row`, `.upcoming-select`, `.upcoming-reset-btn` rules from
`upcomingStack.css`. A small wrapper class (e.g. `.sd-panel` reused, or an
`upcoming-filter-panel` that only sets width) keeps the panel sized like the day
panel (~268px); add a `max-height` + `overflow-y: auto` guard so a long category
list scrolls instead of overflowing.

## Data model — `src/features/upcoming-stack/upcoming.ts`

- `UpcomingView.category: string` → `categories: string[]`.
- `DEFAULT_UPCOMING_VIEW.categories = []` (empty = all categories).
- `viewUpcoming` and `viewOngoing` category filter:
  ```ts
  if (view.categories.length > 0) {
    const match = view.categories.some((c) =>
      c === 'none' ? !event.type : event.type === c
    );
    if (!match) return false;
  }
  ```
  Empty array = no category constraint. Multiple categories = OR.

## Component — `UpcomingStack.tsx`

- Replace the four-dropdown JSX with the topbar + three segmented controls +
  category pill group described above.
- Segmented `onClick` sets the single value (`setView({ ...view, order })` etc.).
- Category pills: All → `setView({ ...view, categories: [] })`; specific pill →
  toggle membership.
- Reset disabled check: compare `order`, `repeat`, `timing`, `query`, and
  `categories.length === 0` against defaults.

## Tests — `src/features/upcoming-stack/upcoming.test.ts`

Update the two category cases to the array shape and add an OR case:
- `categories: []` → all events (no filtering).
- `categories: ['Work']` → only Work.
- `categories: ['none']` → only uncategorized.
- `categories: ['Work', 'none']` → Work **or** uncategorized.
Applies to both `viewUpcoming` and `viewOngoing`.

## Verification

- `tsc --noEmit` clean; full vitest suite green.
- Preview: open the filter popover; confirm it matches the day popover's look
  (topbar, segmented controls, pills). Select several categories; confirm the
  list narrows to the union. Toggle a segmented control; confirm filtering.
  Reset (↺) returns to defaults and disables.
