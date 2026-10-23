# P3a — Cloud Events Sync Design

- **Date:** 2026-06-26
- **Status:** Approved (design); ready for implementation plan
- **Type:** Cloud sync — make a Cloud subscriber's **events** sync across devices via Supabase.
- **Roadmap:** First slice of P3 in the [strategy](2026-06-23-business-model-strategy-design.md). Depends on P1 (entitlements, merged). Categories/settings sync = P3b; realtime + images + iCloud-mirror = P3c.

## Goal

When a user is signed in **and** has an active Cloud subscription (`cloud_active`),
their events live in Supabase and sync across every device they sign into —
reliably (no cross-device data loss), securely (Row-Level Security), and with an
Apple-grade smoothness (no UI disruption, calendar intact on activation).

## Non-goals (explicit)

- Category/settings sync (P3b) and day-background image sync, realtime live updates,
  and keeping iCloud/Google as a live mirror (P3c). In Cloud mode v1, iCloud/Google
  connections are **paused** — Supabase is the sole event store.
- Offline write queue. Offline = reads from the in-memory list; failed writes roll
  back with a toast (the existing behavior). A queue is a later enhancement.

## Architecture

### 1. Cloud mode activates at runtime, by entitlement

Retire the build-time `VITE_BACKEND` switch. `getBackend()` is removed; repository
selection becomes runtime:

- **Cloud mode** when `isSupabaseConfigured()` **and** a signed-in session exists
  **and** `useEntitlementStore.cloudActive` is true → use the Supabase-backed repo.
- Otherwise → the local-first repo (`JsonFileRepository` / `HttpRepository`, plus
  CalDAV/Google composite when connected) exactly as today.

`createRepositoryAsync()` reads the session + `cloudActive` and returns the right
repository. `src/App.tsx` re-initializes the repository when the **session** or
**`cloudActive`** changes (added to the existing repo-init effect's deps), so
subscribing/lapsing or signing in/out switches modes live. In Cloud mode the
CalDAV/Google composite is **not** built (connections paused).

### 2. Multi-device-safe sync — the snapshot-diff `SupabaseRepository`

The store contract (`load()` / `saveAll(fullList)`) is unchanged; the repository
becomes smart. `SupabaseRepository` holds an in-memory **snapshot** (`Map<id,
CalendarEvent>`) of the rows it last loaded or saved.

- `load()` selects all of the user's rows (RLS-scoped), records them as the
  snapshot, returns them.
- `saveAll(list)` diffs `list` against the snapshot:
  - **Upsert** rows that are new, or whose `updatedAt` differs from the snapshot
    (changed on this device). Unchanged rows are not rewritten.
  - **Delete** only ids that are in the snapshot but absent from `list` (a real
    local delete). Rows this device has never loaded (e.g. another device's new
    events) are **never** deleted.
  - Update the snapshot to `list`.
- Conflicts resolve **last-writer-wins per row** (a later `saveAll` upsert
  overwrites). Because upserts are limited to locally-changed rows, a device never
  clobbers a row it didn't touch. (A server-side `updated_at` guard is a possible
  P3c hardening.)

This eliminates the current whole-list-replace data-loss bug.

### 3. Pull on open + focus (Cloud mode only)

On app open the initial `load()` pulls server state. A `window` `focus` listener
(installed only in Cloud mode) re-loads from Supabase and refreshes the store so
another device's changes appear when the user returns. **Polish:** the refresh is
**skipped while any editor/overlay is open** (checked via `useUiStore`) so it never
disrupts an in-progress edit, and it only updates the store when the loaded rows
actually differ from the current list (avoids needless re-renders).

### 4. First-activation auto-seed

When the repository switches into Cloud mode, if `load()` returns **0 rows** for
this user, the current local events (already in the store from the prior local
session) are pushed up once via `saveAll`, seeding the cloud. After that Supabase
is authoritative. The seed runs only on an empty cloud, so it's idempotent and
never overwrites existing cloud data.

### 5. Schema + field mapping

The current `events` table (migrations `0001`–`0003`) is missing columns, so
spans, categories, per-day overrides, and tasks don't round-trip. **Migration
`0006` (run it in your Supabase SQL editor / `supabase db push`):**

```sql
-- Migration 0006: columns for spans (end_date), categories (type), per-day
-- overrides, tasks, and (optional) calendar routing. (show_in_upcoming is 0005.)
alter table public.events add column if not exists end_date      text;
alter table public.events add column if not exists type          text;
alter table public.events add column if not exists day_overrides jsonb;
alter table public.events add column if not exists calendar_urls text[];
alter table public.events add column if not exists is_task       boolean;
```

`date` stays `text not null`; tasks store `date = ''` (empty string, not null) +
`is_task = true`, consistent with the local model. `SupabaseRepository`'s
`fromRow`/`toRow` are extended to map **every** `CalendarEvent` field:
`endDate`, `dayOverrides`, `calendarUrls`, `isTask` (plus the already-mapped id,
title, description, date, time, tz, recurrence, exdates, color, cosmetic,
showOnMinimap, showInUpcoming, reminders, createdAt, updatedAt).

Because `SupabaseRepository.handlesTasks` is already `true`, the existing
`TaskAwareRepository` wrapper passes tasks straight through to Supabase — tasks
sync in Cloud mode with no extra work.

## Security

- Per-user isolation is enforced by the existing RLS policies on `events`
  (select/insert/update/delete `where auth.uid() = user_id`). The client uses only
  the **anon/publishable key + the user's JWT**; no service-role key ships in the
  client. The webhook (P1) remains the only service-role user.
- The user's real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` live only in their
  gitignored `.env.local`; the repo keeps placeholders in `.env.example`.

## Reliability / error handling

- Writes stay optimistic: the store sets state, calls `saveAll`, and on failure
  **rolls back + toasts** (existing `save()` logic). Offline → writes fail and roll
  back; reads use the in-memory list.
- The snapshot-diff makes deletes safe across devices (never deletes unseen rows).
- Auto-seed only fires on an empty cloud (idempotent).
- A quiet, non-blocking cue ("Cloud sync on") on entering Cloud mode.

## Components / files

- **Modify** `src/data/createRepository.ts` — runtime Cloud-mode selection by
  entitlement; remove `getBackend`/`VITE_BACKEND`; wrap Supabase in
  `TaskAwareRepository` (passthrough) as today.
- **Modify** `src/data/supabaseRepository.ts` — snapshot-diff `saveAll`; full field
  mapping (`end_date`, `day_overrides`, `calendar_urls`, `is_task`).
- **Modify** `src/App.tsx` — re-init repo on session/`cloudActive` change; install
  the Cloud-mode focus-refresh (overlay-guarded); the "Cloud sync on" cue.
- **Modify** `src/app/store.ts` — a `refresh()` that re-loads from the repository
  and updates events (used by the focus listener); used by auto-seed too.
- **Create** `supabase/migrations/0006_events_sync_columns.sql` — the SQL above.
- **Modify** `.env.example` — clarify `VITE_SUPABASE_*` enables accounts + Cloud;
  note `VITE_BACKEND` is retired.
- **Test** `src/data/supabaseRepository.test.ts` — new.

## Testing

- **Snapshot-diff** (mocked Supabase client): upsert only changed/new rows; delete
  only ids removed from a previously-loaded snapshot; never delete an id the
  snapshot never had; LWW on re-save.
- **First-activation seed:** empty cloud + non-empty local → seeds; non-empty cloud
  → no seed.
- **Field round-trip:** an event with `endDate`/`dayOverrides`/`isTask`/reminders
  maps to a row and back unchanged.
- **Repository selection:** Cloud mode only when configured + session + `cloudActive`;
  otherwise local. (Pure-function test around the selection predicate.)

## Documentation to update

- Strategy roadmap progress: P3a shipped; P3b/P3c remain.
- `docs/BILLING_SETUP.md`: add "apply `0006` before enabling Cloud" + that Cloud
  uses `cloud_active` at runtime (no `VITE_BACKEND`).
