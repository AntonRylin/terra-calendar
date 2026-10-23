# Open Calendar — PC Main Screen (MVP) Design

**Date:** 2026-06-12
**Status:** Approved by user

## Vision

A free, open-source, donation-supported calendar app with a minimalistic, premium
interface (Apple / Notion Calendar feel). Targets PC first; Android/iOS later from
the same codebase. This spec covers the MVP: the PC main screen.

## Stack

- **React + TypeScript + Vite** — the entire app is a web codebase.
- **Tauri 2** — lightweight desktop shell for the PC app (Windows/macOS/Linux).
- **Capacitor** (later) — wraps the same web core for Android/iOS; only the
  storage adapter and layout shell differ.
- **Zustand** — small global store for events.
- **Floating UI** — popover positioning.
- **Vitest** — unit and component tests.

## Architecture

```
src/
  core/        # pure TypeScript, zero React: Event types, time parser,
               # occurrence expander, date helpers — fully unit-testable
  data/        # EventRepository interface + adapters:
               #   JsonFileRepository (Tauri desktop, v1)
               #   LocalStorageRepository (browser dev mode)
  features/    # self-contained UI modules:
               #   upcoming-stack/  year-circle/  month-grid/
               #   quick-entry/  event-editor/
  app/         # layout shell: composes features into the 30/70 grid.
               # Panel placement is a config, so reordering/adding panels
               # later is a config change, not a rewrite.
  ui/          # design system: tokens.css (colors, spacing, typography),
               # shared primitives (Popover, Input, Button)
src-tauri/     # thin Rust shell, no app logic
```

Principles:

- Features read from the store and dispatch actions; none of them know how
  storage works. Sync providers (Google, own cloud) become future adapters.
- All colors/spacing/type are CSS design tokens. MVP ships the light theme;
  a dark theme is a token-set addition, not a rework.
- `core/` has no React imports so logic is portable and trivially testable.

## Storage (v1)

- Local-only. A single JSON file in the platform app-data directory, behind
  the `EventRepository` interface.
- File format: `{ "version": 1, "events": [...] }`. The version field makes
  future schema migrations explicit and cheap.
- On corrupt/unreadable file: back it up as `events.json.bak`, start with an
  empty store, notify the user with a toast. Never crash, never silently lose
  the backup.
- Failed writes surface a quiet toast.
- Upgrading to SQLite or adding sync later does not touch the UI.

## Data model

```ts
interface CalendarEvent {
  id: string;            // uuid
  title: string;
  description?: string;
  date: string;          // "2026-06-12" — first/anchor occurrence
  time?: string;         // "14:30" — absent = all-day
  recurrence: null | {
    unit: 'week' | 'month' | 'year';
    interval: number;    // 1 = every week/month/year, 2 = every 2nd, ...
  };
  createdAt: string;     // ISO timestamp
  updatedAt: string;     // ISO timestamp
}
```

- `core/` provides `expandOccurrences(event, rangeStart, rangeEnd): string[]`
  returning concrete dates. All panels consume occurrences, never raw rules,
  so new recurrence kinds later touch one function.
- Monthly events anchored on day 29–31 clamp to the last day of shorter
  months (Jan 31 → Feb 28/29).
- **Timezones (added after MVP, superseding the original local-only rule).**
  Each timed event records the IANA timezone it was created in (`tz`); all-day
  and legacy events have no `tz` and are shown as-is (floating). A display
  timezone setting (any IANA zone, default = system) converts each occurrence's
  date+time to that zone for the month grid, Upcoming, and editor — so an event
  at 14:00 in one zone shows the converted time (and possibly an adjacent day)
  in another. Conversion uses `Intl` offsets and is DST-correct; recurrence is
  still expanded in the event's own wall-clock, then each occurrence converted.
  Stored dates/times remain wall-clock strings (no UTC at rest).

## Main screen layout

Two columns split 30% / 70% by a vertical hairline. Left column split 50% / 50%
by a horizontal hairline.

### Upcoming stack (left-top)

- Sorted soonest-first, scrollable. One-time events: every future occurrence
  is listed. Recurring events: only their **next** upcoming occurrence is
  listed (so a weekly event doesn't flood the stack).
- Card: title + friendly date ("Today · 14:30", "Tomorrow", "Fri 14 Jun").
- Click a card → event editor.

### Year circle (left-bottom)

- A ring representing the current year; Jan 1 at top, clockwise.
- One dot per occurrence of events with `recurrence.unit === 'year'`
  (any interval), positioned by day-of-year.
- Subtle marker at today's position; year number in the center.
- Hover dot → tooltip (title + date). Click dot → event editor.
- Dots whose dates nearly coincide (within ~3 days) are offset slightly
  along the radius so none is fully hidden.

### Month grid (right, 70%)

- Monday-start grid, 6 rows of quadratic tiles.
- Days outside the displayed month are visually muted (gray tile + dimmed
  number) so the current month is color-distinguishable.
- Header: month + year, ‹ › navigation, "today" button. Today's tile gets the
  accent border.
- Day tiles list their events as small chips (time + title; all-day events
  show title only), sorted all-day first, then by time.
- A tile shows as many chips as fit (typically 2–3) plus a "+N more"
  indicator when there are more. The indicator is not interactive in the
  MVP; the upcoming stack and editor remain the way to reach every event.

### Quick entry (create event)

- Click any day tile → popover with a single text input appears **beside**
  the tile, auto-flipping right/left based on available space (Floating UI);
  it never covers the selected tile.
- Parsing: a leading `HH MM` / `H MM` token pair (`14 30`, `04 12`, `9 00`)
  is parsed as the time and rendered as a chip; the remaining text is the
  title. No time tokens → all-day event.
- Enter saves; Esc or clicking elsewhere cancels.
- Quick entry always creates `recurrence: null`.
- Clicking a muted adjacent-month day works too: the event is created on
  that actual date and the displayed month does not change.

### Event editor (edit/delete)

- Opens on clicking any existing event (card, chip, or circle dot).
- Larger popover, same visual style: title, date, time, description,
  recurrence control, delete button.
- Recurrence control: *Repeats: never / weekly / monthly / yearly* with an
  "every __ weeks/months/years" stepper shown when a unit is selected.
- Editing or deleting a recurring event always affects the **whole series**.
  Per-occurrence exceptions ("skip just this one") are out of scope for MVP.

## Visual design

- Light theme, near-white background (#fafafa-family), hairline borders,
  rounded tiles/cards, a single blue accent for "today"/focus, generous
  whitespace, system font stack. Premium-minimal: no gradients, no clutter.
- All values defined as tokens in `ui/tokens.css`.

## Testing

- **Unit (Vitest):** time parser, occurrence expander (interval math, clamping,
  leap years), date helpers, repository corrupt-file behavior.
- **Component:** quick-entry flow (type → parse → save), month-grid rendering
  (muted adjacent months, today highlight).
- **Manual:** visual polish verified by running the desktop app.

## Out of scope (MVP)

Dark theme, sync of any kind, notifications/reminders, multi-calendar,
drag-and-drop, week/day views, mobile builds, donations page, recurrence
end dates ("repeat until"), per-occurrence exceptions, event end times /
durations (an event is a point in time or all-day for now). The
architecture above keeps each of these addable without rework.
