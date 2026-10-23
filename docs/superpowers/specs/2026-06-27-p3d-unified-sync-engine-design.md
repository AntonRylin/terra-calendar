# P3d — Unified Sync Engine Design

- **Date:** 2026-06-27
- **Status:** Approved (design); ready for implementation plan
- **Type:** Core sync architecture — reconcile events across local + iCloud + Google + Supabase as one logical calendar.
- **Roadmap:** Replaces the previous "P3d realtime" slot. Realtime → **P3e**. This
  supersedes the current "cloud = Supabase-only" event path and upgrades the free
  CalDAV path with true deletion propagation.

## Goal

Make **local, iCloud, Google, and (for subscribers) Supabase** behave as **one
interconnected calendar**. Create an event → it appears in every active store.
Delete it anywhere → it's removed from every store and from the app. Edit it
anywhere → the change propagates. This holds for **all users**; Supabase is simply
one more store that paid users get (carrying full cosmetic fidelity and providing
cross-device event sync even when no iCloud/Google is connected).

## Business-model context (settled)

- **Free** = a full calendar. Events sync across local + iCloud + Google (CalDAV).
  Per-event cosmetics continue to ride CalDAV via `X-OPENCAL-COSMETIC` (unchanged).
- **Cosmetics Unlock ($3.99)** = the premium cosmetic *set*; client-gated (P2).
- **Cloud ($2/mo)** = Supabase as an additional store. It syncs **events with full
  fidelity** and is the **only** automatic sync path for category colours, app
  settings, and day backgrounds (which never ride CalDAV). Free users move those
  via export/import (P3b/P3c, unchanged).

This spec is about **event** sync topology. Category/settings/day-background sync
is already shipped and untouched here.

## Store model

The unit of sync is a **store** — anything implementing `EventRepository`
(`load()` / `saveAll()`). The active set per device:

```
[ local ]  +  [ iCloud? ]  +  [ Google? ]  +  [ Supabase? (paid) ]
```

- **local** is **always present** (`JsonFileRepository` desktop / `HttpRepository`
  web) — durable offline copy, and the anchor the engine always has.
- **iCloud / Google** are the connected CalDAV accounts. Each **writes to its
  account's default calendar** and **reads from all its enabled calendars**
  (existing `MultiCalendarRepository` / `CompositeRepository` behavior).
- **Supabase** is added when `isCloudMode()` (signed in + `cloud_active`).

Every listed combination — local-only, local+Supabase, local+iCloud, local+Google,
local+iCloud+Google, local+iCloud+Google+Supabase — is just a different active set.

## The core problem: detecting deletions

A single snapshot can't tell "deleted in iCloud" from "not yet created in iCloud."
Both look like "present in store A, absent from store B." Distinguishing them
requires remembering **what was synced last time** — a per-device **baseline**.

### Baseline

A persisted record (local file + `localStorage`, like settings), keyed by event id:

```ts
type BaselineEntry = { updatedAt: string; stores: string[] }; // stores it was synced to
type Baseline = Record<string /* eventId */, BaselineEntry>;
```

It records, per event, the `updatedAt` last reconciled and **which stores held it**.
Per-store presence is what makes connect/disconnect safe (below).

## `reconcile()` — the pure heart

A single I/O-free function — the entire algorithm, exhaustively unit-testable:

```ts
reconcile(
  baseline: Baseline,
  reads: Map<StoreId, CalendarEvent[]>,   // current per-store reads
  activeStores: StoreId[],
  supabaseStoreId: StoreId | null,         // for the tie-break
): {
  merged: CalendarEvent[];                  // the reconciled unified set (what the app shows)
  targets: Map<StoreId, CalendarEvent[]>;   // desired contents per store (drives each saveAll)
  newBaseline: Baseline;
}
```

For each id in `union(baseline keys, all read ids)`:

1. **Deletion check (delete-wins).** If `baseline[id]` exists and there is a store
   `s` in `baseline[id].stores` that is **active now** but whose current read does
   **not** contain the id → the user deleted it in `s` → **drop the event
   everywhere**: excluded from `merged`, from every store's `targets`, and from
   `newBaseline`. (A store in `baseline[id].stores` that is *not* active now is
   ignored — a disconnected account is not a deletion.)
2. **Otherwise the event is live.** Pick the **canonical copy**: the copy with the
   newest `updatedAt`; **Supabase breaks exact ties**. Then:
   - `merged` gets the canonical copy.
   - every **active** store's `targets` gets it (propagating to stores that lack
     it, refreshing stale copies) — **except CalDAV stores never receive tasks**
     (`isTask` events have no date and can't be calendar events).
   - `newBaseline[id] = { updatedAt: canonical.updatedAt, stores: <active stores it
     should be in> }`.

### Why "newest wins, Supabase breaks ties" (not "Supabase always wins")

Pure "Supabase always wins" would discard a fresh edit made in Apple/Google
Calendar — contradicting "events from iCloud get synced into Supabase too." So the
rule is **newest `updated_at` wins**, with **Supabase as the tie-breaker** on equal
timestamps. That honors edits made anywhere while giving Supabase the edge your
"Supabase priority" call asked for. (If you truly want Supabase to override even
newer external edits, that's a one-line change — flagged here so it's a conscious
choice.)

### First sync / new device

Empty baseline → step 1 never fires (nothing was "previously synced") → every read
event is live → the union is propagated to all stores and recorded in the baseline.
**No deletion is ever inferred on first sync** — the safe bootstrap (this is the
current "first-activation seed," generalized).

### Connect / disconnect safety

- **Newly connected store:** its events aren't in any `baseline[id].stores`, so
  they're treated as live and propagated; existing events simply get pushed into it.
  No deletions inferred for it.
- **Disconnected store:** it's not in `activeStores`, so step 1 skips it — removing
  an account never deletes data from the others.

## `UnifiedRepository` (implements `EventRepository`)

Holds the active stores `[{ id, kind: 'local'|'caldav'|'supabase', repo }]` and the
persisted baseline. `handlesTasks = true` (tasks live in local + Supabase).

- **`load()`**: read every store → `reconcile()` → for each store whose `targets`
  differ from its read, call `store.repo.saveAll(target)` (each repo already diffs
  internally to do the minimal create/update/delete) → persist `newBaseline` →
  return `merged`. CalDAV/Supabase writes are **best-effort** (a failing provider
  logs + is skipped; it can't corrupt the set or block the read).
- **`saveAll(events)`**: the user's edit is the new desired set → write to every
  store (CalDAV gets non-task events) → update the baseline from the written set.
  Local write is synchronous-critical; remote writes best-effort.

The baseline is read once at construction and rewritten after each reconcile/save.

## `createRepository` integration

`createRepositoryAsync()` builds the active store list from connection + entitlement
and wraps it in `UnifiedRepository`:

- Always include **local**.
- Add **iCloud** / **Google** stores when connected (reuse the existing
  account-assembly code — extracted into a shared `buildCalDavStores()` helper so the
  cloud and local paths don't duplicate it).
- Add **Supabase** when `isCloudMode()`.
- Zero remote stores → `UnifiedRepository` over `[local]` alone (≡ today's local-only
  behavior, just routed through the same code path).

The old `if (isCloudMode()) return SupabaseRepository`-only branch is **removed**.

## Cosmetics (unchanged, restated for clarity)

- **Per-event cosmetic** is a field on the event → rides CalDAV (X-props) and
  Supabase alike. No special handling in `reconcile` — it travels with the event.
- **Category / settings / day-background** cosmetics: Supabase-only for paid
  (P3b/P3c), export/import for free. Out of scope here.

## Reliability & risk

This is the **highest-stakes slice** — a `reconcile` bug can delete real calendar
events. Mitigations:

- `reconcile` is **pure** and built **test-first**, covering: create, delete,
  edit, conflict/tie, first-sync, connect, disconnect, task-exclusion, and
  two-device convergence.
- All remote writes are **best-effort**; a flaky CalDAV/Supabase read or write
  never deletes from the others (deletion requires the store to be *active and
  successfully read* and the id *absent* — a read failure skips the store, it
  doesn't look like a deletion).
- Local store + baseline are written first and are the durable fallback.

## Testing

- **`reconcile` (pure, the bulk):** every case above as table-driven unit tests.
- **`UnifiedRepository`:** load drives per-store `saveAll` to the computed targets;
  tasks excluded from CalDAV stores; a throwing store is skipped, not fatal; baseline
  persisted/reloaded.
- **`createRepositoryAsync`:** correct active-store set for each tier/connection
  combo; local always present; Supabase added only in cloud mode.

## Out of scope

- **Realtime** live propagation (Supabase Realtime / CalDAV poll) → **P3e**.
- Field-level/3-way *content* merge beyond delete-wins + newest-wins/Supabase-tie
  (e.g. merging two concurrent edits of the same event field by field).
- Category/settings/day-background sync changes (already shipped).
- Conflict UI / undo of a remote deletion.

## Roadmap update

- **P3d — unified sync engine:** this spec (replaces "realtime + iCloud-mirror").
- **P3e — realtime:** live multi-device propagation on top of the unified engine.
