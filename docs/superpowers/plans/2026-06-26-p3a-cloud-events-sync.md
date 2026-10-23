# P3a — Cloud Events Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in Cloud subscriber's events live in Supabase and sync across devices — multi-device-safe (no whole-list clobber), via a runtime entitlement switch, with first-activation auto-seed.

**Architecture:** `SupabaseRepository` keeps an in-memory snapshot of the last-loaded rows and, on `saveAll`, upserts only locally-changed rows and deletes only ids that left its own snapshot (never unseen rows). Repository selection becomes runtime (`isCloudMode()` = configured + signed-in + `cloud_active`), retiring the build-time `VITE_BACKEND`. `App.tsx` re-inits the repo on session/entitlement change, seeds an empty cloud from local events on activation, and re-pulls on window focus (skipped while an overlay is open).

**Tech Stack:** Supabase (Postgres + RLS), React 18, Zustand, TypeScript, Vitest.

**Note for the human:** This builds and unit-tests against a mocked Supabase. To run it live you must (a) apply migration `0006` to your Supabase project, and (b) build with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set and be a `cloud_active` user. See Task 1 + the docs task.

---

## File Structure

- **Create** `supabase/migrations/0006_events_sync_columns.sql` — `end_date`, `day_overrides`, `calendar_urls`, `is_task`.
- **Modify** `src/data/supabaseRepository.ts` — full field mapping + snapshot-diff `saveAll`. **Test** `src/data/supabaseRepository.test.ts`.
- **Modify** `src/data/createRepository.ts` — `isCloudMode()`; runtime cloud selection; remove `getBackend`/`Backend`/dead sync `createRepository`. **Test** `src/data/cloudMode.test.ts`.
- **Modify** `src/app/store.ts` — `refresh()` + `seedFrom()`. **Test** in `src/app/store.test.ts`.
- **Modify** `src/App.tsx` — re-init on session/`cloudActive`; activation seed; focus-refresh; "Cloud sync on" cue.
- **Modify** docs: roadmap, `BILLING_SETUP.md`, `.env.example`.

---

## Task 1: Schema migration `0006`

**Files:**
- Create: `supabase/migrations/0006_events_sync_columns.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_events_sync_columns.sql`:

```sql
-- Migration 0006: columns so every CalendarEvent field round-trips to the cloud —
-- spans (end_date), categories (type), per-day overrides, tasks, and (optional)
-- calendar routing. (show_in_upcoming is added by 0005.) Apply via the Supabase
-- SQL editor or `supabase db push`.
alter table public.events add column if not exists end_date      text;
alter table public.events add column if not exists type          text;
alter table public.events add column if not exists day_overrides jsonb;
alter table public.events add column if not exists calendar_urls text[];
alter table public.events add column if not exists is_task       boolean;
```

- [ ] **Step 2: Sanity-check**

No DB in CI. Visually confirm four `add column if not exists` lines with the right
types. `date` is intentionally left `text not null` (tasks store `date = ''`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_events_sync_columns.sql
git commit -m "feat(cloud): migration 0005 — event columns for spans/overrides/tasks"
```

---

## Task 2: `SupabaseRepository` — full mapping + snapshot-diff sync

**Files:**
- Modify: `src/data/supabaseRepository.ts` (replace whole file)
- Test: `src/data/supabaseRepository.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/data/supabaseRepository.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '../core/types';

// A chainable fake of the supabase client that records upsert/delete calls.
const calls = { upserts: [] as unknown[][], deletes: [] as { ids?: string[] }[] };
let rows: Record<string, unknown>[] = [];

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from() {
      return {
        select: async () => ({ data: rows, error: null }),
        upsert(r: unknown[]) {
          calls.upserts.push(r);
          return Promise.resolve({ error: null });
        },
        delete() {
          const op: { ids?: string[] } = {};
          calls.deletes.push(op);
          const chain = {
            eq: () => chain,
            in: (_col: string, ids: string[]) => {
              op.ids = ids;
              return Promise.resolve({ error: null });
            },
            then: (res: (v: { error: null }) => void) => res({ error: null }),
          };
          return chain;
        },
      };
    },
  };
}
vi.mock('./supabaseClient', () => ({ getSupabase: () => makeClient() }));

import { SupabaseRepository } from './supabaseRepository';

const evA: CalendarEvent = { id: 'a', title: 'A', date: '2026-06-01', recurrence: null, createdAt: '', updatedAt: 't1' };
const evB: CalendarEvent = { id: 'b', title: 'B', date: '', isTask: true, recurrence: null, createdAt: '', updatedAt: 't1' };

describe('SupabaseRepository snapshot-diff', () => {
  beforeEach(() => {
    calls.upserts = [];
    calls.deletes = [];
    rows = [];
  });

  it('round-trips all fields incl. tasks/spans/overrides', async () => {
    const full: CalendarEvent = {
      id: 'x', title: 'X', date: '2026-06-01', endDate: '2026-06-03', type: 'holiday',
      dayOverrides: { '2026-06-02': { time: '09:00' } }, isTask: undefined,
      time: '10:00', tz: 'UTC', recurrence: { unit: 'week', interval: 1 },
      exdates: ['2026-06-08'], color: '#fff', cosmetic: 'aurora',
      showOnMinimap: false, showInUpcoming: true, calendarUrls: ['u'],
      reminders: [{ value: 5, unit: 'minutes' }], createdAt: 'c', updatedAt: 'u',
    };
    const repo = new SupabaseRepository();
    await repo.saveAll([full]);
    const row = calls.upserts[0][0] as Record<string, unknown>;
    expect(row.end_date).toBe('2026-06-03');
    expect(row.type).toBe('holiday');
    expect(row.day_overrides).toEqual({ '2026-06-02': { time: '09:00' } });
    expect(row.show_in_upcoming).toBe(true);
    expect(row.calendar_urls).toEqual(['u']);
    // Reading it back maps snake_case → camelCase.
    rows = [row];
    const { events } = await new SupabaseRepository().load();
    expect(events[0].endDate).toBe('2026-06-03');
    expect(events[0].type).toBe('holiday');
    expect(events[0].showInUpcoming).toBe(true);
    expect(events[0].calendarUrls).toEqual(['u']);
  });

  it('upserts only changed rows and never deletes unseen rows', async () => {
    rows = [{ id: 'a', user_id: 'u1', title: 'A', date: '2026-06-01', created_at: '', updated_at: 't1' }];
    const repo = new SupabaseRepository();
    await repo.load(); // snapshot = { a@t1 }
    // Save a list with a (unchanged) + b (new). Another device's row 'z' is NOT in our list.
    calls.upserts = [];
    await repo.saveAll([{ ...evA }, { ...evB }]);
    // Only 'b' is new/changed → upserted; 'a' unchanged → not upserted.
    const upsertedIds = (calls.upserts[0] as Record<string, unknown>[]).map((r) => r.id);
    expect(upsertedIds).toEqual(['b']);
    // No deletes: nothing left the snapshot.
    expect(calls.deletes.every((d) => !d.ids || d.ids.length === 0)).toBe(true);
  });

  it('deletes an id that left the snapshot (a real local delete)', async () => {
    rows = [{ id: 'a', user_id: 'u1', title: 'A', date: '2026-06-01', created_at: '', updated_at: 't1' }];
    const repo = new SupabaseRepository();
    await repo.load(); // snapshot = { a }
    await repo.saveAll([]); // 'a' removed locally
    expect(calls.deletes.some((d) => d.ids?.includes('a'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/supabaseRepository.test.ts`
Expected: FAIL (no field mapping / no snapshot-diff yet).

- [ ] **Step 3: Replace `src/data/supabaseRepository.ts`**

```ts
import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent, Recurrence, EventReminder, DayOverride } from '../core/types';
import { getSupabase } from './supabaseClient';

const TABLE = 'events';

/** A row in the Supabase `events` table (snake_case columns). */
interface EventRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  type: string | null;
  time: string | null;
  tz: string | null;
  recurrence: Recurrence | null;
  exdates: string[] | null;
  day_overrides: Record<string, DayOverride> | null;
  color: string | null;
  cosmetic: string | null;
  show_on_minimap: boolean | null;
  show_in_upcoming: boolean | null;
  calendar_urls: string[] | null;
  is_task: boolean | null;
  reminders: EventReminder[] | null;
  created_at: string;
  updated_at: string;
}

function fromRow(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    endDate: r.end_date ?? undefined,
    type: r.type ?? undefined,
    time: r.time ?? undefined,
    tz: r.tz ?? undefined,
    description: r.description ?? undefined,
    recurrence: r.recurrence ?? null,
    exdates: r.exdates ?? undefined,
    dayOverrides: r.day_overrides ?? undefined,
    color: r.color ?? undefined,
    cosmetic: r.cosmetic ?? undefined,
    showOnMinimap: r.show_on_minimap ?? undefined,
    showInUpcoming: r.show_in_upcoming ?? undefined,
    calendarUrls: r.calendar_urls ?? undefined,
    isTask: r.is_task ? true : undefined,
    reminders: r.reminders ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow(e: CalendarEvent, userId: string): EventRow {
  return {
    id: e.id,
    user_id: userId,
    title: e.title,
    description: e.description ?? null,
    date: e.date,
    end_date: e.endDate ?? null,
    type: e.type ?? null,
    time: e.time ?? null,
    tz: e.tz ?? null,
    recurrence: e.recurrence ?? null,
    exdates: e.exdates ?? null,
    day_overrides: e.dayOverrides ?? null,
    color: e.color ?? null,
    cosmetic: e.cosmetic ?? null,
    show_on_minimap: e.showOnMinimap ?? null,
    show_in_upcoming: e.showInUpcoming ?? null,
    calendar_urls: e.calendarUrls ?? null,
    is_task: e.isTask ?? null,
    reminders: e.reminders ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/**
 * Cloud adapter: events live in Postgres, scoped to the signed-in user by RLS
 * (`user_id = auth.uid()`). Multi-device-safe: it keeps a snapshot of the rows
 * it last loaded/saved, and on `saveAll` upserts only rows changed on THIS device
 * and deletes only ids that left its own snapshot — never rows it has not seen
 * (so another device's additions are preserved). Conflicts are last-writer-wins.
 */
export class SupabaseRepository implements EventRepository {
  readonly handlesTasks = true;
  private snapshot = new Map<string, CalendarEvent>();

  async load(): Promise<LoadResult> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*');
    if (error) {
      return { events: [], warning: `Failed to load events: ${error.message}` };
    }
    const events = ((data ?? []) as EventRow[]).map(fromRow);
    this.snapshot = new Map(events.map((e) => [e.id, e]));
    return { events };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const supabase = getSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Not signed in');

    // Upsert only rows new or changed on this device (vs the last-loaded snapshot).
    const changed = events.filter((e) => {
      const prev = this.snapshot.get(e.id);
      return !prev || prev.updatedAt !== e.updatedAt;
    });
    if (changed.length > 0) {
      const { error } = await supabase
        .from(TABLE)
        .upsert(changed.map((e) => toRow(e, user.id)), { onConflict: 'id' });
      if (error) throw error;
    }

    // Delete only ids that were in our snapshot and are now gone (a real local
    // delete). Ids we have never loaded (another device's rows) are left alone.
    const present = new Set(events.map((e) => e.id));
    const removed = [...this.snapshot.keys()].filter((id) => !present.has(id));
    if (removed.length > 0) {
      const { error } = await supabase.from(TABLE).delete().eq('user_id', user.id).in('id', removed);
      if (error) throw error;
    }

    this.snapshot = new Map(events.map((e) => [e.id, e]));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/supabaseRepository.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/supabaseRepository.ts src/data/supabaseRepository.test.ts
git commit -m "feat(cloud): snapshot-diff SupabaseRepository + full field mapping"
```

---

## Task 3: Runtime cloud-mode selection (`isCloudMode`), retire `VITE_BACKEND`

**Files:**
- Modify: `src/data/createRepository.ts`
- Test: `src/data/cloudMode.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/data/cloudMode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let configured = true;
let session: unknown = { user: { id: 'u1' } };
let cloudActive = true;
vi.mock('./supabaseClient', () => ({ isSupabaseConfigured: () => configured }));
vi.mock('../auth/authStore', () => ({ useAuthStore: { getState: () => ({ session }) } }));
vi.mock('../app/entitlementStore', () => ({ useEntitlementStore: { getState: () => ({ cloudActive }) } }));

import { isCloudMode } from './createRepository';

describe('isCloudMode', () => {
  beforeEach(() => { configured = true; session = { user: { id: 'u1' } }; cloudActive = true; });

  it('is true only when configured AND signed in AND cloud_active', () => {
    expect(isCloudMode()).toBe(true);
  });
  it('is false when not configured', () => { configured = false; expect(isCloudMode()).toBe(false); });
  it('is false when signed out', () => { session = null; expect(isCloudMode()).toBe(false); });
  it('is false without an active subscription', () => { cloudActive = false; expect(isCloudMode()).toBe(false); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/cloudMode.test.ts`
Expected: FAIL — `isCloudMode` not exported.

- [ ] **Step 3: Edit `src/data/createRepository.ts`**

Replace the imports block at the top:

```ts
import type { EventRepository } from './repository';
import { JsonFileRepository } from './jsonFileRepository';
import { HttpRepository } from './httpRepository';
import { SupabaseRepository } from './supabaseRepository';
import { isSupabaseConfigured } from './supabaseClient';
import { MultiCalendarRepository, type EventClient } from './multiCalendarRepository';
import { localStorageKv } from './caldav/localStorageKv';
import { TaskAwareRepository } from './taskAwareRepository';
import type { CalDavConfig } from './caldav/types';
import type { CompositeAccount } from './compositeRepository';

export type Backend = 'local' | 'supabase';
```

with:

```ts
import type { EventRepository } from './repository';
import { JsonFileRepository } from './jsonFileRepository';
import { HttpRepository } from './httpRepository';
import { SupabaseRepository } from './supabaseRepository';
import { isSupabaseConfigured } from './supabaseClient';
import { useAuthStore } from '../auth/authStore';
import { useEntitlementStore } from '../app/entitlementStore';
import { MultiCalendarRepository, type EventClient } from './multiCalendarRepository';
import { localStorageKv } from './caldav/localStorageKv';
import { TaskAwareRepository } from './taskAwareRepository';
import type { CalDavConfig } from './caldav/types';
import type { CompositeAccount } from './compositeRepository';
```

Replace the `getBackend` function and the sync `createRepository` function — that is, this whole block:

```ts
/**
 * Which edition we're running:
 * - "supabase" — the paid hosted cloud edition (requires the env vars below).
 * - "local"    — the free, open-source local-only edition (default).
 *
 * Selected at build time via `VITE_BACKEND`. The cloud build also needs
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; if those are missing we
 * fall back to local rather than crashing.
 */
export function getBackend(): Backend {
  return import.meta.env.VITE_BACKEND === 'supabase' && isSupabaseConfigured()
    ? 'supabase'
    : 'local';
}

export function createRepository(): EventRepository {
  if (getBackend() === 'supabase') return new TaskAwareRepository(new SupabaseRepository());
  // Local edition: a JSON file on disk in the Tauri desktop app, the local
  // sync server (with localStorage fallback) in the browser.
  return new TaskAwareRepository(isTauri() ? new JsonFileRepository() : new HttpRepository());
}
```

with:

```ts
/**
 * Cloud mode is decided at RUNTIME by entitlement, not a build flag: the hosted
 * backend must be configured, the user signed in, and their Cloud subscription
 * active. Otherwise the app is local-first.
 */
export function isCloudMode(): boolean {
  return (
    isSupabaseConfigured() &&
    !!useAuthStore.getState().session &&
    useEntitlementStore.getState().cloudActive
  );
}
```

Then in `createRepositoryAsync`, replace the first line:

```ts
  if (getBackend() === 'supabase') return new TaskAwareRepository(new SupabaseRepository());
```

with:

```ts
  // Cloud mode: Supabase is the sole event store (iCloud/Google paused).
  if (isCloudMode()) return new TaskAwareRepository(new SupabaseRepository());
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/data/cloudMode.test.ts` → expected PASS (4 tests).
Run: `npx tsc --noEmit` → expected: no errors. (Confirms the removed `getBackend`/`createRepository`/`Backend` aren't referenced anywhere else — they aren't in `src`; only `createRepositoryAsync` and `repositoryForAccount` are used.)

- [ ] **Step 5: Commit**

```bash
git add src/data/createRepository.ts src/data/cloudMode.test.ts
git commit -m "feat(cloud): runtime cloud-mode by entitlement; retire VITE_BACKEND"
```

---

## Task 4: Store `refresh()` + `seedFrom()`

**Files:**
- Modify: `src/app/store.ts`
- Test: `src/app/store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/app/store.test.ts` (inside the top-level describe area; it already imports `useCalendarStore` and `MemoryRepository`):

```ts
describe('cloud refresh / seed', () => {
  const evA = { id: 'a', title: 'A', date: '2026-06-01', recurrence: null, createdAt: '', updatedAt: 't1' };
  const evB = { id: 'b', title: 'B', date: '2026-06-02', recurrence: null, createdAt: '', updatedAt: 't1' };

  it('refresh() pulls the latest events from the repository', async () => {
    let server = [evA];
    const repo = { load: async () => ({ events: [...server] }), saveAll: async () => {} };
    await useCalendarStore.getState().init(repo);
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual(['a']);
    server = [evA, evB]; // another device added evB
    await useCalendarStore.getState().refresh();
    expect(useCalendarStore.getState().events.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('seedFrom() sets events, persists them, and records no undo', async () => {
    const saved: unknown[] = [];
    const repo = { load: async () => ({ events: [] }), saveAll: async (e: unknown[]) => { saved.push(...e); } };
    await useCalendarStore.getState().init(repo);
    await useCalendarStore.getState().seedFrom([evA]);
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual(['a']);
    expect((saved as { id: string }[]).map((e) => e.id)).toEqual(['a']);
    expect(useCalendarStore.getState().canUndo).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/store.test.ts`
Expected: FAIL — `refresh`/`seedFrom` not defined.

- [ ] **Step 3: Add to `src/app/store.ts`**

In the `CalendarState` interface, after `commitCurrentState(): Promise<void>;`, add:

```ts
  /** Re-load events from the repository (e.g. another device's changes on focus).
   *  Resets the undo baseline to the loaded state. */
  refresh(): Promise<void>;
  /** Seed an empty backend with the given events (first Cloud activation). Does
   *  not record an undo step. */
  seedFrom(events: CalendarEvent[]): Promise<void>;
```

In the store object, add these methods next to `commitCurrentState`:

```ts
    async refresh() {
      if (!repository) return;
      const { events } = await repository.load();
      const sig = (l: CalendarEvent[]) => l.map((e) => `${e.id}:${e.updatedAt}`).sort().join('|');
      if (sig(events) === sig(get().events)) return;
      undoStack = [];
      redoStack = [];
      lastPersisted = events;
      set({ events, canUndo: false, canRedo: false });
    },

    async seedFrom(events) {
      set({ events });
      await save(events, false);
      undoStack = [];
      redoStack = [];
      set({ canUndo: false, canRedo: false });
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/store.test.ts`
Expected: PASS (all prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/store.ts src/app/store.test.ts
git commit -m "feat(cloud): store refresh() + seedFrom() for cloud sync"
```

---

## Task 5: App wiring — re-init, seed, focus-refresh, cue

**Files:**
- Modify: `src/App.tsx`

(No unit test — App effects are integration; the logic they call is unit-tested in Tasks 2–4. Verified by typecheck + the controller's browser smoke.)

- [ ] **Step 1: Add imports**

In `src/App.tsx`, add (next to the other store imports):

```ts
import { useUiStore } from './app/uiStore';
import { isCloudMode } from './data/createRepository';
```

(`useEntitlementStore`, `useAuthStore`, `useCalendarStore`, `useConnectionStore`, `createRepositoryAsync`, `isSupabaseConfigured` are already imported.)

- [ ] **Step 2: Read `cloudActive` + a stable session id**

After the existing `const session = useAuthStore((s) => s.session);` line, add:

```ts
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const sessionId = session?.user.id ?? null;
```

- [ ] **Step 3: Replace the repository-init effect**

Replace this effect:

```tsx
  useEffect(() => {
    let active = true;
    void (async () => {
      const repo = await createRepositoryAsync();
      if (active) await useCalendarStore.getState().init(repo);
    })();
    return () => {
      active = false;
    };
  }, [connUser, connCalendarsStr, connGoogleUser, connGoogleCalendarsStr]);
```

with:

```tsx
  // Re-initialise the repository when a connected account, the signed-in user, or
  // the Cloud subscription changes. Entering Cloud mode with an empty cloud seeds
  // it from the user's local events so their calendar is intact.
  useEffect(() => {
    let active = true;
    void (async () => {
      const enteringCloud = isCloudMode();
      const localBefore = useCalendarStore.getState().events;
      const repo = await createRepositoryAsync();
      if (!active) return;
      await useCalendarStore.getState().init(repo);
      if (!active) return;
      if (enteringCloud) {
        const cloudEmpty = useCalendarStore.getState().events.length === 0;
        if (cloudEmpty && localBefore.length > 0) {
          await useCalendarStore.getState().seedFrom(localBefore);
        }
        useCalendarStore.getState().notify('Cloud sync on');
      }
    })();
    return () => {
      active = false;
    };
  }, [connUser, connCalendarsStr, connGoogleUser, connGoogleCalendarsStr, sessionId, cloudActive]);
```

- [ ] **Step 4: Add the focus-refresh effect**

Immediately after the effect from Step 3, add:

```tsx
  // In Cloud mode, re-pull on window focus so another device's changes appear —
  // but never while an editor/overlay is open (don't disrupt an in-progress edit).
  useEffect(() => {
    if (!isCloudMode()) return;
    const onFocus = () => {
      const ui = useUiStore.getState();
      const overlayOpen = Boolean(
        ui.quickEntry || ui.editor || ui.create || ui.taskEditor || ui.span ||
        ui.spanDay || ui.specialDayEditor || ui.categoryEditor || ui.dayBackground,
      );
      if (overlayOpen) return;
      void useCalendarStore.getState().refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [sessionId, cloudActive]);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(cloud): re-init on entitlement change, activation seed, focus refresh"
```

---

## Task 6: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`
- Modify: `docs/BILLING_SETUP.md`
- Modify: `.env.example`

- [ ] **Step 1: Update the strategy progress section**

In `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`, replace the P3 progress line:

```markdown
- **P3 — cloud sync ($2/mo):** ⏳ not started. Drives repo selection off
  `cloud_active`, per-record sync of events + categories + settings, retires the
  legacy `VITE_BACKEND` switch.
```

with:

```markdown
- **P3a — cloud *events* sync:** ✅ shipped to `main`. Runtime cloud mode by
  `cloud_active`; snapshot-diff multi-device-safe sync; first-activation seed;
  `VITE_BACKEND` retired. Requires migration `0006` + a built Cloud edition.
- **P3b — cloud categories + settings sync:** ⏳ not started.
- **P3c — realtime + day-background images + iCloud-as-mirror:** ⏳ not started.
```

- [ ] **Step 2: Update `docs/BILLING_SETUP.md`**

In `docs/BILLING_SETUP.md`, under "## 1. Supabase", change step 1 from:

```markdown
1. Apply the migration: `supabase db push` (creates `public.profiles` + RLS + signup trigger).
```

to:

```markdown
1. Apply the migrations: `supabase db push` — `0004` (profiles + RLS + signup
   trigger) and `0005` (event columns for spans/overrides/tasks). Cloud event sync
   needs `0005`.
```

And add a line at the end of "## 3. Client build":

```markdown

Cloud sync activates at runtime for signed-in users whose subscription is active
(`cloud_active`) — there is no `VITE_BACKEND` flag. iCloud/Google connections pause
while Cloud mode is on.
```

- [ ] **Step 3: Update `.env.example`**

In `.env.example`, replace the `VITE_BACKEND` block:

```
# Switch to the cloud edition. Anything other than "supabase" = local edition.
VITE_BACKEND=supabase
```

with:

```
# (VITE_BACKEND is retired — Cloud mode now activates at runtime for signed-in
#  users with an active subscription. Set the Supabase vars below to enable
#  accounts + Cloud.)
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-business-model-strategy-design.md docs/BILLING_SETUP.md .env.example
git commit -m "docs: P3a progress; migration 0005 + runtime cloud mode"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all pass (prior 378 + Task 2 (3) + Task 3 (4) + Task 4 (2) = 387).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Local-mode smoke (no regression)**

Run `npm run dev` (no Supabase env). Confirm the app still loads/saves events
locally exactly as before — `isCloudMode()` is false, so nothing cloud-related runs.

- [ ] **Step 4: (Human, live) Cloud smoke**

After applying migration `0006` and building with `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` set, signed in as a `cloud_active` user: events created on
one device appear on another after focus; a first-time subscriber's local events
seed the cloud; deleting on one device removes it on the other.

---

## Self-Review

**Spec coverage (against `2026-06-26-p3a-cloud-events-sync-design.md`):**
- Runtime cloud mode by entitlement; retire `VITE_BACKEND` → Task 3. ✓
- Snapshot-diff multi-device-safe sync → Task 2. ✓
- Pull on open + focus (overlay-guarded) → Task 5 (focus effect) + store `refresh` (Task 4). ✓
- First-activation auto-seed → Task 5 (effect) + store `seedFrom` (Task 4). ✓
- Schema `0005` + full field mapping → Task 1 + Task 2. ✓
- iCloud/Google paused in cloud mode → Task 3 (`createRepositoryAsync` returns Supabase before the composite path). ✓
- Security (RLS/anon key; no creds committed) → unchanged RLS; `.env.example` placeholders (Task 6). ✓
- Reliability (optimistic save/rollback; idempotent seed) → existing `save()`; seed guarded by `cloudEmpty`. ✓
- Docs updated → Task 6. ✓

**Placeholder scan:** No TBD/TODO; complete code in every step; commands have expected output. The live cloud smoke (Task 7 Step 4) is a human step, explicitly flagged — the in-repo code is fully built and unit-tested with a mocked Supabase.

**Type consistency:** `isCloudMode` (Task 3) used in Task 5. `refresh`/`seedFrom` (Task 4) used in Task 5. `SupabaseRepository` snapshot/mapping (Task 2) — `EventRow` columns match migration `0006` (Task 1) and `fromRow`/`toRow` cover every `CalendarEvent` field. `cloudActive`/`session` read consistently from `useEntitlementStore`/`useAuthStore`.
