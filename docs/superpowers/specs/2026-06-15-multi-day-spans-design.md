# Multi-day spans (holidays & typed spans) — design

Date: 2026-06-15
Status: approved (Phase 1), iterate on visuals during build

## Problem

`CalendarEvent` is single-date: every panel (month grid, minimap, upcoming)
expands events to individual occurrence dates. There is no way to represent a
holiday or any event that lasts a continuous range of days as **one** entity.

The user wants to click-and-drag across day tiles in the month grid to create a
multi-day, all-day span (default a "holiday" type), give it a name/color/type in
a dedicated modal, see it as a single bar across its tiles, get a special
marking on the minimap, and have it surface once in the upcoming area —
specifically moving into a new **Ongoing** section once it has started, and
dropping off when it ends.

## Scope

### Phase 1 (this spec)
All-day, uniform multi-day spans:
- Drag-create across tiles → choice (Holiday / Event) → span modal.
- Span modal: name, type, color, editable start/end (pre-filled from drag).
- Whole-span editing + delete via the same modal.
- Month grid: continuous bar across the span's tiles.
- Minimap: special arc/band marking (distinct from per-day dots).
- Upcoming + new **Ongoing** section.
- CalDAV `DTEND` round-trip.

### Phase 2 (in progress)
Per-day overrides on a span via `dayOverrides?: Record<string, DayOverride>`
(`DayOverride = { title?; time?; showOnMinimap? }`):
- **Edit chooser**: clicking a span segment opens a small popover — "This day" /
  "Whole holiday" — routing to the per-day editor or the whole-span editor.
- **Per-day editor**: title, time (gives that day a specific start time), and an
  On-map toggle for just that day.
- **Timed day**: renders a time prefix inside the bar segment ("14:30 Title");
  the day stays part of the continuous bar.
- **Per-day minimap**: a day toggled off the map creates a gap in the band
  (the span splits into sub-bands around hidden days). The whole-span On-map
  toggle still hides the entire band.
- **CalDAV**: `dayOverrides` persist via an `X-OPENCAL-DAYOVERRIDES` JSON prop so
  our own sync round-trips them (other clients ignore the X-prop).

## Data model

Extend `CalendarEvent` (`src/core/types.ts`):

```ts
/** Inclusive last day of a multi-day span, "YYYY-MM-DD". Absent or === date
 *  means a normal single-day event (behavior unchanged). All-day in Phase 1. */
endDate?: string;
/** Open-ended category. "holiday" is the first built-in; drives default look
 *  and future filtering. */
type?: string;
```

- A span is `date..endDate` inclusive. `endDate <= date` (or absent) ⇒ single day.
- Spans are always all-day in Phase 1 (`time` absent). A span with `time` is out
  of scope for Phase 1.
- Recurrence + span are mutually exclusive in Phase 1 (a span has
  `recurrence: null`).
- Phase 2 `dayOverrides?: Record<string, {...}>` slots in without touching the
  above.

### Helpers (new, in `src/core/`)
- `isSpan(event): boolean` — `!!endDate && endDate > date`.
- `spanDates(event): string[]` / iteration — the inclusive day list.
- `spanStatus(event, today): 'upcoming' | 'ongoing' | 'past'`.

## Occurrence handling

`expandOccurrences` currently returns the anchor date(s). For a non-recurring
span it must return **every day in the range that intersects [rangeStart,
rangeEnd]**, so the month grid paints a chip/segment on each visible day.
`groupOccurrences` then groups per day as today, and the grid composes adjacent
days into a single visual bar (see Rendering).

The minimap and upcoming list do **not** consume per-day occurrences for spans —
they treat the span as one entity (see below).

## Rendering — month grid

Each day a span covers gets a span segment. Visually they read as one
continuous bar:
- The title shows once (on the first visible day of the span, or first day of
  each week row).
- Segments are styled by the span color; rounded on the true start/end, square
  where the span continues across a week boundary.
- Spans render in a reserved row above normal day chips so they don't disrupt
  the existing chip stack.

(Exact bar treatment validated visually with the companion during build.)

## Rendering — minimap

A span is drawn as an **arc/band** along the ring between its start-day angle and
end-day angle, in the span color, rather than as discrete per-day tick lines.
Honors `showOnMinimap` and the existing minimap filter. Clicking the band sets
`viewedDate` to the span start.

## Upcoming + Ongoing

`buildUpcoming` / `UpcomingStack` change:
- A span with `start > today` → appears in **Upcoming**, keyed/sorted by start
  date, shown once.
- A span with `start <= today <= end` → appears only in the new **Ongoing**
  section (with an "ends in N days" / end-date hint), and is excluded from
  Upcoming.
- A span with `end < today` → not shown.
- Non-span events behave exactly as today.

Ongoing is a labeled section rendered above the Upcoming list (same panel).

## CalDAV mapping

`eventToICS` (`src/data/caldav/icalMapping.ts`):
- For an all-day span, also emit `DTEND;VALUE=DATE:<endDate + 1 day>` (iCal DTEND
  is exclusive).
- Single-day all-day events stay byte-identical to today (no DTEND, or DTEND =
  next day — keep current output unchanged to avoid churn).
- Emit `X-OPENCAL-TYPE:<type>` when `type` is set.

`icsToEvent`:
- Read `DTEND;VALUE=DATE`; if it is more than one day after DTSTART, set
  `endDate = DTEND - 1 day`.
- Read `X-OPENCAL-TYPE` into `type`.

## Modal

A new component (e.g. `SpanCreateHost` / `SpanForm`) in `src/features/`,
rendered in an `AnchoredPopover` like the existing create/edit hosts. Fields:
name, type (select: Holiday + free entry), color (`PaletteSelector`), start
date, end date. Save commits one event with `endDate` + `type`. Reopening on an
existing span edits the whole span; a Delete action removes it.

## Edge cases
- Drag where start > end (dragged backwards): normalize so `date <= endDate`.
- Single-tile drag: treat as a 1-day event — fall back to normal quick-entry, or
  create a 1-day span of the chosen type (decide during build; default to span
  so the type is honored).
- Span crossing year boundaries: minimap shows it in each year's ring for the
  portion in that year.
- Timezone: spans are all-day/floating; no tz conversion (matches all-day today).

## Testing
- `isSpan` / `spanStatus` / span-aware `expandOccurrences` unit tests.
- `buildUpcoming` split into upcoming vs ongoing — unit tests for the three
  status buckets and the boundary days (today == start, today == end).
- `eventToICS` / `icsToEvent` round-trip for a multi-day span (DTEND exclusivity)
  and unchanged output for single-day events.
- Grid grouping test: a span paints every covered day in range.
