# Dateless Tasks Design

- **Date:** 2026-06-25
- **Status:** Approved (design); ready for implementation plan
- **Type:** Feature — a "task" is an event with no date, created from the Upcoming panel.

## Goal

Let the user right-click empty space in the Upcoming panel to create either an
**event** (as today) or a **task**. A task is a `CalendarEvent` with no date. It
shows in a dedicated "Tasks" section of the Upcoming panel, never appears in
date-based views (month grid, minimap, Ongoing, dated Upcoming), and is **not
synced to iCloud/Google** (a dateless event has no valid `VEVENT`). Assigning a
date to a task promotes it into a normal event. On the paid Cloud (Supabase)
plan tasks sync as normal dateless rows; on the free/CalDAV-connected plans they
persist locally.

## Data model (approach A)

`CalendarEvent.date` stays a required `string`. A task is marked with a new
optional discriminator and carries an empty date:

```ts
export interface CalendarEvent {
  // …existing fields…
  /** True for a dateless "task". Tasks carry date: '' and are excluded from all
   *  date-based views and from CalDAV sync. Absent on normal events. */
  isTask?: true;
}
```

- A task is created with `date: ''`, `isTask: true`, `recurrence: null`, no `time`,
  no `tz`, no `calendarUrls`.
- A single predicate is the source of truth:

```ts
export function isTaskEvent(e: Pick<CalendarEvent, 'isTask'>): boolean {
  return e.isTask === true;
}
```

- **Promotion:** giving a task a real `date` sets `date` to that value and deletes
  `isTask`. It is then an ordinary event in every respect.

Rationale: an explicit flag is low-ripple (no need to make `date` optional across
the dozens of consumers that assume a string) and self-documenting. The empty-date
value never reaches date logic because tasks are filtered out of every date-based
builder (see Exclusions); tests assert that invariant.

## Persistence — capability-aware, local-or-cloud

Add an optional capability to the repository contract:

```ts
export interface EventRepository {
  load(): Promise<LoadResult>;
  saveAll(events: CalendarEvent[]): Promise<void>;
  /** True if this backend can persist dateless tasks itself (Supabase). When
   *  false (CalDAV, local JSON file), tasks are kept in a local store instead. */
  handlesTasks?: boolean;
}
```

- `SupabaseRepository.handlesTasks = true`.
- `JsonFileRepository`, `HttpRepository`, `MultiCalendarRepository`,
  `CompositeRepository` leave it falsy.

A **`TaskAwareRepository` decorator** wraps the active repository (applied in
`createRepositoryAsync` / the cloud path):

- If the underlying repo `handlesTasks` → pure pass-through (tasks flow to Supabase
  like any row).
- Otherwise:
  - `load()` → underlying events **+** tasks read from a local task store.
  - `saveAll(events)` → split: tasks (`isTaskEvent`) go to the local task store;
    the rest go to the underlying repo unchanged (so CalDAV/Google sync is
    untouched and never sees a dateless event).

**Local task store** (`tasks.json`): mirrors the existing local-persistence split
— a JSON file in the Tauri app-data dir on desktop, `localStorage` fallback on the
web build. Stores the full `CalendarEvent[]` of tasks.

**Promotion falls out for free:** once a task gets a date, `isTaskEvent` is false,
so on the next `saveAll` the decorator stops routing it to the local store and
hands it to the underlying repo — which assigns the default calendar and syncs it
(when connected), exactly like a freshly created event. The local store drops it.

**Cloud (Supabase) path — activates with P3.** When cloud mode is wired (P3), the
`events` table needs `date` made nullable and an `is_task boolean default false`
column; `SupabaseRepository` maps `isTask`/empty-date rows. This spec defines that
behavior; the column/mapping ship with P3 since the Supabase runtime path isn't
selected today. The free/local path is fully built now.

## Creation flow

- The Upcoming list container gets an `onContextMenu` that fires **only on empty
  space** (not on a card — card handlers already `preventDefault` and open their
  own menu; the empty-space handler ignores events whose target is within a card).
- It opens the existing `ContextMenu` at the cursor (`pointAnchor`) with two items:
  - **New event** → the current create flow (`openCreate`).
  - **New task** → the create flow in a **task variant**: no date/time/recurrence
    fields; on submit it calls `addEvent` with `date: ''`, `isTask: true`.
- `NewEventInput` gains an optional `isTask?: true`; `useCalendarStore.addEvent`
  sets `date: ''` and omits `calendarUrls` when `isTask` is set.

## Tasks section in the Upcoming panel

- A dedicated **"Tasks"** block rendered at the **bottom** of the Upcoming panel,
  below the dated list, mirroring the existing `Ongoing` section markup/sublabel.
- Tasks are selected from the store with `isTaskEvent` (not via `buildUpcoming`,
  which is date-based). Ordered by `updatedAt` desc (most recent first) — no date
  to sort on.
- Task cards reuse the existing card component and its right-click `ContextMenu`
  (Modify / Duplicate / Delete), with one added action **"Set date…"** that opens
  the editor focused on the date field to promote the task.
- The empty state and density/compact settings apply as for other cards.

## Exclusions (the safety invariant)

Tasks must never leak into date logic or sync. Apply `isTaskEvent` as a filter at
every date-based entry point:

- `buildUpcoming`, `buildOngoing` (Upcoming) — skip tasks.
- Month grid and minimap event sources — skip tasks.
- CalDAV: tasks never reach `eventToICS` because the decorator keeps them out of
  the underlying repo. (Defense in depth: `eventToICS`/projection already only
  see non-tasks.)

Tests assert: a task never appears in `buildUpcoming`/`buildOngoing`, never gets
`calendarUrls`, and is never serialized to ICS.

## Error handling

- Local task store unreadable → start with an empty task list and surface the same
  kind of warning the event store uses; never crash.
- Empty-date guards: date helpers are never called on tasks; a defensive `isTaskEvent`
  check precedes any date parse in the new Tasks rendering path.

## Testing

- `isTaskEvent` predicate.
- `addEvent({ isTask: true })` creates `date: ''`, `isTask: true`, no `calendarUrls`.
- `TaskAwareRepository`: load merges local tasks with underlying events; saveAll
  routes tasks to the local store and non-tasks to the underlying repo; pass-through
  when `handlesTasks`.
- Promotion: a task given a date is removed from the local store and saved to the
  underlying repo on the next save.
- Exclusions: tasks absent from `buildUpcoming`/`buildOngoing`; never ICS-serialized.

## Out of scope (YAGNI)

- Completion / check-off state (a task is strictly a dateless event).
- Reverse demotion (event → task by clearing its date).
- Building/enabling the Supabase task-sync path now — its behavior is specified
  here but ships with P3 when cloud mode is wired (nullable `date` + `is_task`).
