# P3d — Unified Sync Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile `local + iCloud + Google + Supabase` into one logical calendar — create anywhere → everywhere; delete anywhere → everywhere; edit → propagates (newest-wins, Supabase breaks ties) — for all users, with Supabase added only for paid subscribers.

**Architecture:** A pure, exhaustively-tested `reconcile()` function is the heart. A thin `UnifiedRepository` (implements `EventRepository`) reads every store, runs `reconcile()` against a persisted per-device baseline, writes each store back to its computed target (each underlying repo already diffs internally), persists the new baseline, and returns the merged set. A `CalDavAccountStore` wraps each CalDAV account so every event lands in that account's default calendar (tasks excluded). `createRepositoryAsync` assembles the active store set from connection + entitlement. Remote writes are best-effort; the local store is the durable anchor.

**Tech Stack:** TypeScript, Zustand, Vitest. Existing repos: `JsonFileRepository`/`HttpRepository` (local), `MultiCalendarRepository` (one CalDAV account), `SupabaseRepository` (cloud), `TaskAwareRepository` (keeps dateless tasks local).

**Highest-risk slice in the project — a reconcile bug can delete real calendar events.** Therefore: `reconcile` is built test-first with full case coverage *before* any wiring; all remote reads/writes are best-effort so one flaky provider can neither corrupt the set nor masquerade as a deletion; the local store + baseline are written first and are the durable fallback.

---

## File Structure

All new code lives under `src/data/sync/` (one focused module per file):

- **Create** `src/data/sync/types.ts` — shared types (`StoreKind`, `StoreMeta`, `BaselineEntry`, `Baseline`, `ReconcileResult`).
- **Create** `src/data/sync/baseline.ts` (+ test) — load/save the persisted baseline (localStorage).
- **Create** `src/data/sync/reconcile.ts` (+ test) — the pure reconcile algorithm. **The heart.**
- **Create** `src/data/sync/calDavAccountStore.ts` (+ test) — wrap one CalDAV account as a sync store.
- **Create** `src/data/sync/unifiedRepository.ts` (+ test) — compose stores, drive reconcile, persist baseline.
- **Create** `src/data/sync/README.md` — architecture doc (the algorithm, invariants, failure modes).
- **Modify** `src/data/createRepository.ts` (+ test update) — assemble stores + return `UnifiedRepository`.
- **Modify** docs: business-plan roadmap, `supabase/README.md`.

---

## Task 1: Sync types + baseline persistence

**Files:**
- Create: `src/data/sync/types.ts`
- Create: `src/data/sync/baseline.ts`
- Test: `src/data/sync/baseline.test.ts`

- [ ] **Step 1: Create `src/data/sync/types.ts`**

```ts
import type { CalendarEvent } from '../../core/types';

/** A sync store is `local` (JSON file / browser), `caldav` (one iCloud or Google
 *  account), or `supabase` (cloud). Kind drives task routing + the tie-breaker. */
export type StoreKind = 'local' | 'caldav' | 'supabase';

/** Identifies one store in a reconcile pass. */
export interface StoreMeta {
  id: string;
  kind: StoreKind;
}

/** What the baseline remembers about one event from the last successful sync: the
 *  `updatedAt` it had, and which store ids held it. Per-store presence is what
 *  makes deletion detection safe across store connect/disconnect. */
export interface BaselineEntry {
  updatedAt: string;
  stores: string[];
}

/** eventId → BaselineEntry. The last-synced snapshot, persisted per device. */
export type Baseline = Record<string, BaselineEntry>;

export interface ReconcileResult {
  /** The unified event set the app should show. */
  merged: CalendarEvent[];
  /** storeId → the events that store should contain after this sync. */
  targets: Record<string, CalendarEvent[]>;
}

// NB: the new baseline is built by UnifiedRepository AFTER writing, from what each
// store actually persisted — not here — so a failed write can never later look
// like a deletion. `reconcile` stays a pure read→targets function.
```

- [ ] **Step 2: Write the failing test** — `src/data/sync/baseline.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadBaseline, saveBaseline } from './baseline';

describe('sync baseline', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a baseline', () => {
    saveBaseline({ a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } });
    expect(loadBaseline()).toEqual({ a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } });
  });

  it('returns {} when absent', () => {
    expect(loadBaseline()).toEqual({});
  });

  it('returns {} when corrupt', () => {
    localStorage.setItem('open-calendar.sync.baseline', '{not json');
    expect(loadBaseline()).toEqual({});
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/data/sync/baseline.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Create `src/data/sync/baseline.ts`**

```ts
import type { Baseline } from './types';

const KEY = 'open-calendar.sync.baseline';

/** Read the persisted sync baseline (empty if absent/corrupt). Losing it is SAFE:
 *  the next reconcile then treats every store as first-sync (union, no deletions
 *  inferred), so a lost baseline costs at most a missed deletion, never data. */
export function loadBaseline(): Baseline {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Baseline;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBaseline(baseline: Baseline): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(baseline));
  } catch {
    // ignore — see loadBaseline: a lost baseline is non-destructive
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/sync/baseline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/sync/types.ts src/data/sync/baseline.ts src/data/sync/baseline.test.ts
git commit -m "feat(sync): baseline types + persistence"
```

---

## Task 2: `reconcile()` — the pure engine

**Files:**
- Create: `src/data/sync/reconcile.ts`
- Test: `src/data/sync/reconcile.test.ts`

- [ ] **Step 1: Write the failing test** — `src/data/sync/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '../../core/types';
import { reconcile } from './reconcile';
import type { Baseline, StoreMeta } from './types';

const ev = (id: string, updatedAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-01-01', updatedAt, ...extra,
});
const LOCAL: StoreMeta = { id: 'local', kind: 'local' };
const APPLE: StoreMeta = { id: 'apple', kind: 'caldav' };
const SUPA: StoreMeta = { id: 'supabase', kind: 'supabase' };

describe('reconcile', () => {
  it('propagates a new event to every store and the baseline', () => {
    const r = reconcile({}, { local: [ev('a', '2026-01-01T00:00:00Z')], apple: [] }, [LOCAL, APPLE], null);
    expect(r.merged.map((e) => e.id)).toEqual(['a']);
    expect(r.targets.local.map((e) => e.id)).toEqual(['a']);
    expect(r.targets.apple.map((e) => e.id)).toEqual(['a']);
  });

  it('deletes everywhere when a baseline event vanished from an active store', () => {
    const baseline: Baseline = { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'apple'] } };
    // present in local, gone from apple → user deleted it in apple
    const r = reconcile(baseline, { local: [ev('a', '2026-01-01T00:00:00Z')], apple: [] }, [LOCAL, APPLE], null);
    expect(r.merged).toEqual([]);
    expect(r.targets.local).toEqual([]);
    expect(r.targets.apple).toEqual([]);
  });

  it('does NOT delete when the missing store is inactive (disconnected)', () => {
    const baseline: Baseline = { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'apple'] } };
    // apple is not in the active store list this pass → its absence is not a deletion
    const r = reconcile(baseline, { local: [ev('a', '2026-01-01T00:00:00Z')] }, [LOCAL], null);
    expect(r.merged.map((e) => e.id)).toEqual(['a']);
  });

  it('first sync (empty baseline) never infers a deletion', () => {
    const r = reconcile({}, { local: [], apple: [ev('a', '2026-01-01T00:00:00Z')] }, [LOCAL, APPLE], null);
    expect(r.merged.map((e) => e.id)).toEqual(['a']);
    expect(r.targets.local.map((e) => e.id)).toEqual(['a']);
  });

  it('newest updatedAt wins on conflict', () => {
    const r = reconcile(
      { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } },
      { local: [ev('a', '2026-02-01T00:00:00Z', { title: 'newer-local' })],
        supabase: [ev('a', '2026-01-01T00:00:00Z', { title: 'older-supa' })] },
      [LOCAL, SUPA], 'supabase',
    );
    expect(r.merged[0].title).toBe('newer-local');
  });

  it('Supabase breaks an exact updatedAt tie', () => {
    const r = reconcile(
      { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } },
      { local: [ev('a', '2026-01-01T00:00:00Z', { title: 'local' })],
        supabase: [ev('a', '2026-01-01T00:00:00Z', { title: 'supa' })] },
      [LOCAL, SUPA], 'supabase',
    );
    expect(r.merged[0].title).toBe('supa');
  });

  it('never sends tasks to a CalDAV store, but keeps them in local/supabase', () => {
    const r = reconcile({}, { local: [ev('t', '2026-01-01T00:00:00Z', { isTask: true })], apple: [], supabase: [] },
      [LOCAL, APPLE, SUPA], 'supabase');
    expect(r.targets.apple).toEqual([]);
    expect(r.targets.local.map((e) => e.id)).toEqual(['t']);
    expect(r.targets.supabase.map((e) => e.id)).toEqual(['t']);
  });

  it('drops a baseline event that is gone from every active store', () => {
    const baseline: Baseline = { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local'] } };
    const r = reconcile(baseline, { local: [], apple: [] }, [LOCAL, APPLE], null);
    expect(r.merged).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/sync/reconcile.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/sync/reconcile.ts`**

```ts
import type { CalendarEvent } from '../../core/types';
import { isTaskEvent } from '../../core/tasks';
import type { Baseline, ReconcileResult, StoreMeta } from './types';

/** Canonical copy of an event: newest `updatedAt` wins; the Supabase copy breaks
 *  exact ties. Order-independent. */
function pickCanonical(
  copies: { storeId: string; event: CalendarEvent }[],
  supabaseId: string | null,
): CalendarEvent {
  const maxUpdated = copies.reduce(
    (m, c) => (c.event.updatedAt > m ? c.event.updatedAt : m),
    copies[0].event.updatedAt,
  );
  const top = copies.filter((c) => c.event.updatedAt === maxUpdated);
  const supa = supabaseId ? top.find((c) => c.storeId === supabaseId) : undefined;
  return (supa ?? top[0]).event;
}

/**
 * Reconcile per-store reads against the baseline into one unified calendar. Pure —
 * no I/O. See `src/data/sync/README.md` for the full algorithm and invariants.
 *
 * Per event id (over baseline ids ∪ all read ids):
 *  - **Delete-wins:** if the baseline recorded the event in a store that is active
 *    now but no longer has it → the user deleted it there → drop it everywhere.
 *  - **Otherwise live:** canonical = newest `updatedAt` (Supabase breaks ties);
 *    every active store gets it (propagation), except CalDAV stores never receive
 *    tasks. First sync (empty baseline) can never infer a deletion.
 */
export function reconcile(
  baseline: Baseline,
  reads: Record<string, CalendarEvent[]>,
  stores: StoreMeta[],
  supabaseId: string | null,
): ReconcileResult {
  const activeIds = new Set(stores.map((s) => s.id));
  const index: Record<string, Map<string, CalendarEvent>> = {};
  for (const s of stores) index[s.id] = new Map((reads[s.id] ?? []).map((e) => [e.id, e]));

  const allIds = new Set<string>();
  for (const id of Object.keys(baseline)) allIds.add(id);
  for (const s of stores) for (const e of reads[s.id] ?? []) allIds.add(e.id);

  const merged: CalendarEvent[] = [];
  const targets: Record<string, CalendarEvent[]> = {};
  for (const s of stores) targets[s.id] = [];

  for (const id of allIds) {
    const base = baseline[id];

    // Delete-wins: synced to an active store that no longer has it.
    const deleted = !!base && base.stores.some((sid) => activeIds.has(sid) && !index[sid].has(id));
    if (deleted) continue;

    const copies: { storeId: string; event: CalendarEvent }[] = [];
    for (const s of stores) {
      const ev = index[s.id].get(id);
      if (ev) copies.push({ storeId: s.id, event: ev });
    }
    if (copies.length === 0) continue; // in baseline, gone everywhere, not flagged → drop

    const canonical = pickCanonical(copies, supabaseId);
    merged.push(canonical);

    for (const s of stores) {
      if (s.kind === 'caldav' && isTaskEvent(canonical)) continue; // tasks never go to CalDAV
      targets[s.id].push(canonical);
    }
  }

  return { merged, targets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/sync/reconcile.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/sync/reconcile.ts src/data/sync/reconcile.test.ts
git commit -m "feat(sync): pure reconcile engine (delete-wins, newest-wins, task-aware)"
```

---

## Task 3: `CalDavAccountStore`

**Files:**
- Create: `src/data/sync/calDavAccountStore.ts`
- Test: `src/data/sync/calDavAccountStore.test.ts`

- [ ] **Step 1: Write the failing test** — `src/data/sync/calDavAccountStore.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { CalendarEvent } from '../../core/types';
import type { EventRepository } from '../repository';
import { CalDavAccountStore } from './calDavAccountStore';

const ev = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-01-01', updatedAt: '2026-01-01T00:00:00Z', ...extra,
});

function fakeInner() {
  const saved: CalendarEvent[][] = [];
  const repo: EventRepository = {
    load: vi.fn(async () => ({ events: [] })),
    saveAll: vi.fn(async (events: CalendarEvent[]) => { saved.push(events); }),
  };
  return { repo, saved };
}

describe('CalDavAccountStore', () => {
  it('assigns the account default to events not already in this account', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    await store.saveAll([ev('a')]); // no calendarUrls → gets default
    expect(saved[0][0].calendarUrls).toEqual(['ic/cal1']);
  });

  it('keeps an event placed in one of this account calendars', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1', 'ic/cal2']), 'ic/cal1');
    await store.saveAll([ev('a', { calendarUrls: ['ic/cal2', 'g/other'] })]);
    expect(saved[0][0].calendarUrls).toEqual(['ic/cal2']); // foreign url dropped, own kept
  });

  it('never writes tasks to CalDAV', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    await store.saveAll([ev('a'), ev('t', { isTask: true })]);
    expect(saved[0].map((e) => e.id)).toEqual(['a']);
  });

  it('delegates load', async () => {
    const { repo } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    await store.load();
    expect(repo.load).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/sync/calDavAccountStore.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/sync/calDavAccountStore.ts`**

```ts
import type { EventRepository, LoadResult } from '../repository';
import type { CalendarEvent } from '../../core/types';
import { isTaskEvent } from '../../core/tasks';

/**
 * Wraps one CalDAV account's repository as a unified-sync store. On write it scopes
 * each event to THIS account: keep the event's calendars that belong here, else
 * assign this account's default calendar — so every synced event lands in this
 * account (its default) unless already placed in one of its calendars. Tasks
 * (dateless) are never written to CalDAV. Reads pass straight through.
 */
export class CalDavAccountStore implements EventRepository {
  constructor(
    private readonly inner: EventRepository,
    private readonly accountCalendars: Set<string>,
    private readonly defaultUrl: string,
  ) {}

  load(): Promise<LoadResult> {
    return this.inner.load();
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const projected = events
      .filter((e) => !isTaskEvent(e))
      .map((e) => {
        const own = (e.calendarUrls ?? []).filter((u) => this.accountCalendars.has(u));
        return { ...e, calendarUrls: own.length > 0 ? own : [this.defaultUrl] };
      });
    await this.inner.saveAll(projected);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/sync/calDavAccountStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/sync/calDavAccountStore.ts src/data/sync/calDavAccountStore.test.ts
git commit -m "feat(sync): CalDavAccountStore (per-account default + task exclusion)"
```

---

## Task 4: `UnifiedRepository`

**Files:**
- Create: `src/data/sync/unifiedRepository.ts`
- Test: `src/data/sync/unifiedRepository.test.ts`

- [ ] **Step 1: Write the failing test** — `src/data/sync/unifiedRepository.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '../../core/types';
import type { EventRepository } from '../repository';
import { UnifiedRepository, type SyncStore } from './unifiedRepository';

const ev = (id: string, updatedAt = '2026-01-01T00:00:00Z', extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-01-01', updatedAt, ...extra,
});

function memStore(id: string, kind: SyncStore['kind'], initial: CalendarEvent[] = [], opts: { failLoad?: boolean; failSave?: boolean } = {}): SyncStore & { contents: CalendarEvent[] } {
  const state = { contents: initial };
  const repo: EventRepository = {
    load: vi.fn(async () => { if (opts.failLoad) throw new Error('offline'); return { events: [...state.contents] }; }),
    saveAll: vi.fn(async (events: CalendarEvent[]) => { if (opts.failSave) throw new Error('write fail'); state.contents = [...events]; }),
  };
  return { id, kind, repo, get contents() { return state.contents; } };
}

describe('UnifiedRepository', () => {
  beforeEach(() => localStorage.clear());

  it('load merges stores and propagates to each (first sync)', async () => {
    const local = memStore('local', 'local', []);
    const apple = memStore('apple', 'caldav', [ev('a')]);
    const repo = new UnifiedRepository([local, apple], 'local', null);
    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['a']);
    expect(local.contents.map((e) => e.id)).toEqual(['a']); // propagated into local
  });

  it('propagates a delete: gone from apple (in baseline) → removed from local', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const apple = memStore('apple', 'caldav', [ev('a')]);
    const repo = new UnifiedRepository([local, apple], 'local', null);
    await repo.load();                       // baseline now has a in [local, apple]
    apple.contents.splice(0, 1);             // user deletes a in iCloud
    const { events } = await repo.load();
    expect(events).toEqual([]);
    expect(local.contents).toEqual([]);      // delete propagated to local
  });

  it('a failed remote read is skipped, never a deletion', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const apple = memStore('apple', 'caldav', [ev('a')], { failLoad: true });
    const repo = new UnifiedRepository([local, apple], 'local', null);
    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['a']); // a survives despite apple offline
  });

  it('a failed remote WRITE is not later mistaken for a deletion', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const supa = memStore('supabase', 'supabase', [], { failSave: true }); // propagation to supabase fails
    const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
    await repo.load();                        // tries a→supabase, fails; baseline must NOT record supabase
    const { events } = await repo.load();     // a must survive (not seen as deleted-from-supabase)
    expect(events.map((e) => e.id)).toEqual(['a']);
  });

  it('saveAll writes to every store; CalDAV gets no tasks', async () => {
    const local = memStore('local', 'local', []);
    const apple = memStore('apple', 'caldav', []);
    const supa = memStore('supabase', 'supabase', []);
    const repo = new UnifiedRepository([local, apple, supa], 'local', 'supabase');
    await repo.saveAll([ev('a'), ev('t', '2026-01-01T00:00:00Z', { isTask: true })]);
    expect(local.contents.map((e) => e.id).sort()).toEqual(['a', 't']);
    expect(supa.contents.map((e) => e.id).sort()).toEqual(['a', 't']);
    expect(apple.contents.map((e) => e.id)).toEqual(['a']); // task excluded
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/sync/unifiedRepository.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/sync/unifiedRepository.ts`**

```ts
import type { EventRepository, LoadResult } from '../repository';
import type { CalendarEvent } from '../../core/types';
import { reconcile } from './reconcile';
import { loadBaseline, saveBaseline } from './baseline';
import type { Baseline, StoreKind, StoreMeta } from './types';

/** One store the unified repository reconciles over. */
export interface SyncStore {
  id: string;
  kind: StoreKind;
  repo: EventRepository;
}

/** Cheap content signature for "did this store change?" — id + updatedAt is enough
 *  because every content edit bumps updatedAt (same rule the calendar store uses). */
function signature(events: CalendarEvent[]): string {
  return events.map((e) => `${e.id}:${e.updatedAt}`).sort().join('|');
}

/**
 * Reconciles several stores (local + iCloud/Google + Supabase) into one logical
 * calendar. See `src/data/sync/README.md`.
 *
 * - `load()` reads every store, reconciles against the persisted baseline, writes
 *   each store back to its target (each repo diffs internally → minimal
 *   create/update/delete), persists the new baseline, returns the merged set. A
 *   store that fails to read is skipped for that pass so its baseline events are
 *   never mistaken for deletions; the local store is the anchor (failure aborts).
 * - `saveAll()` writes the user's edits to every store (CalDAV gets no tasks) and
 *   rewrites the baseline from the saved set. Remote writes are best-effort.
 */
export class UnifiedRepository implements EventRepository {
  readonly handlesTasks = true; // local + Supabase persist tasks; CalDAV is filtered out

  constructor(
    private readonly stores: SyncStore[],
    private readonly localId: string,
    private readonly supabaseId: string | null,
  ) {}

  async load(): Promise<LoadResult> {
    const reads: Record<string, CalendarEvent[]> = {};
    const active: SyncStore[] = [];
    let warning: string | undefined;

    for (const s of this.stores) {
      try {
        const res = await s.repo.load();
        reads[s.id] = res.events;
        active.push(s);
        warning ??= res.warning;
      } catch (err) {
        if (s.id === this.localId) throw err; // local is the durable anchor — abort
        // remote read failed → exclude this store this pass (no false deletions)
      }
    }

    const meta: StoreMeta[] = active.map((s) => ({ id: s.id, kind: s.kind }));
    const { merged, targets } = reconcile(loadBaseline(), reads, meta, this.supabaseId);

    // Write each store to its target, recording what each store ACTUALLY holds
    // afterwards: the target on success/skip, the prior read on failure. The
    // baseline is built from this — so a failed write is never later read as a
    // deletion (the store simply isn't recorded as holding the event yet).
    const post: Record<string, Set<string>> = {};
    await Promise.all(
      active.map(async (s) => {
        const target = targets[s.id] ?? [];
        const read = reads[s.id] ?? [];
        if (signature(target) === signature(read)) { post[s.id] = new Set(read.map((e) => e.id)); return; }
        try {
          await s.repo.saveAll(target);
          post[s.id] = new Set(target.map((e) => e.id));
        } catch (err) {
          if (s.id === this.localId) throw err; // local must persist
          post[s.id] = new Set(read.map((e) => e.id)); // write failed → still holds old read
        }
      }),
    );

    const newBaseline: Baseline = {};
    for (const e of merged) {
      newBaseline[e.id] = {
        updatedAt: e.updatedAt,
        stores: active.filter((s) => post[s.id]?.has(e.id)).map((s) => s.id),
      };
    }
    saveBaseline(newBaseline);
    return { events: merged, warning };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const succeeded = new Set<string>();
    await Promise.all(
      this.stores.map(async (s) => {
        const target = s.kind === 'caldav' ? events.filter((e) => !e.isTask) : events;
        try {
          await s.repo.saveAll(target);
          succeeded.add(s.id);
        } catch (err) {
          if (s.id === this.localId) throw err; // local must succeed
          // remote write best-effort; the next load() reconciles it back
        }
      }),
    );

    // Record only stores that ACTUALLY persisted the event — a failed remote write
    // must not later be read as a deletion.
    const newBaseline: Baseline = {};
    for (const e of events) {
      newBaseline[e.id] = {
        updatedAt: e.updatedAt,
        stores: this.stores
          .filter((s) => succeeded.has(s.id) && !(s.kind === 'caldav' && e.isTask))
          .map((s) => s.id),
      };
    }
    saveBaseline(newBaseline);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/sync/unifiedRepository.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/sync/unifiedRepository.ts src/data/sync/unifiedRepository.test.ts
git commit -m "feat(sync): UnifiedRepository (reconcile-driven multi-store sync)"
```

---

## Task 5: Assemble stores in `createRepository`

**Files:**
- Modify: `src/data/createRepository.ts`
- Test: `src/data/createRepository.unified.test.ts` (create)

This replaces the `if (isCloudMode()) return SupabaseRepository`-only branch and the
`CompositeRepository` branch with a single store-assembly path that always includes
**local**, adds a `CalDavAccountStore` per connected account, and adds **Supabase**
in cloud mode — all wrapped in `UnifiedRepository`.

- [ ] **Step 1: Add imports** to the top of `src/data/createRepository.ts` (after the existing imports):

```ts
import { UnifiedRepository, type SyncStore } from './sync/unifiedRepository';
import { CalDavAccountStore } from './sync/calDavAccountStore';
```

- [ ] **Step 2: Add a per-account default-calendar helper** (right after `calendarUrlSet`):

```ts
/** This account's default write calendar: the connection store's default that
 *  belongs to the account, else the account's first enabled calendar. */
function accountDefaultUrl(config: CalDavConfig, defaults: string[]): string {
  const own = calendarUrlSet(config);
  return defaults.find((u) => own.has(u)) ?? [...own][0] ?? '';
}
```

- [ ] **Step 3: Extract CalDAV account-store assembly.** Add this function (replacing the inline account loop logic), above `createRepositoryAsync`:

```ts
/** Build a {@link CalDavAccountStore} for each connected, reachable account
 *  (Apple and/or Google). Desktop only — returns [] on web or when nothing is
 *  connected. Failures to build one account skip it and keep the others. */
async function buildCalDavStores(): Promise<SyncStore[]> {
  if (!isTauri()) return [];
  const { useConnectionStore } = await import('../app/connectionStore');
  const conn = useConnectionStore.getState();
  if (!conn.isConnected()) return [];

  const defaults = conn.defaultCalendarUrls();
  const stores: SyncStore[] = [];

  if (conn.caldav) {
    const { credentials } = await import('./caldav/credentials');
    const password = await credentials.get(conn.caldav.username);
    if (password) {
      try {
        const { buildAppleAccount } = await import('./caldav/connect');
        const { client, config } = await buildAppleAccount(conn.caldav.username, password, conn.caldav);
        if (config.calendars && (!conn.caldav.calendars || conn.caldav.calendars.length === 0)) {
          useConnectionStore.getState().setCalDav(config);
        }
        stores.push({
          id: `apple:${conn.caldav.username}`,
          kind: 'caldav',
          repo: new CalDavAccountStore(
            repositoryForAccount(client, `apple:${conn.caldav.username}`, config),
            calendarUrlSet(config),
            accountDefaultUrl(config, defaults),
          ),
        });
      } catch {
        // discovery/auth failed → skip this account
      }
    }
  }

  if (conn.google) {
    try {
      const { buildGoogleAccount } = await import('./google/connect');
      const { client, config } = await buildGoogleAccount(conn.google.username, conn.google);
      if (config.calendars && (!conn.google.calendars || conn.google.calendars.length === 0)) {
        useConnectionStore.getState().setGoogle(config);
      }
      stores.push({
        id: `google:${conn.google.username}`,
        kind: 'caldav',
        repo: new CalDavAccountStore(
          repositoryForAccount(client, `google:${conn.google.username}`, config),
          calendarUrlSet(config),
          accountDefaultUrl(config, defaults),
        ),
      });
    } catch {
      // token/keychain unavailable → skip this account
    }
  }

  return stores;
}
```

- [ ] **Step 4: Replace `createRepositoryAsync`'s body** with store assembly:

Replace the entire `export async function createRepositoryAsync(): Promise<EventRepository> { ... }` (currently lines ~55–115) with:

```ts
/**
 * Assemble the active sync stores from connection + entitlement and reconcile them
 * behind one {@link UnifiedRepository}: **local is always present**; each connected
 * CalDAV account (Apple/Google, desktop) is a store; **Supabase** is added in cloud
 * mode. Every event then syncs across all active stores (see src/data/sync).
 */
export async function createRepositoryAsync(): Promise<EventRepository> {
  const local: SyncStore = {
    id: 'local',
    kind: 'local',
    repo: new TaskAwareRepository(isTauri() ? new JsonFileRepository() : new HttpRepository()),
  };

  const stores: SyncStore[] = [local, ...(await buildCalDavStores())];

  let supabaseId: string | null = null;
  if (isCloudMode()) {
    supabaseId = 'supabase';
    stores.push({ id: supabaseId, kind: 'supabase', repo: new SupabaseRepository() });
  }

  return new UnifiedRepository(stores, 'local', supabaseId);
}
```

- [ ] **Step 5: Remove now-unused imports.** If `MultiCalendarRepository`, `CompositeRepository`, or `CompositeAccount` are no longer referenced after Step 4, delete their imports. (`repositoryForAccount` is still used by `buildCalDavStores`; `MultiCalendarRepository` is still used as its return type — keep those. `CompositeRepository`/`CompositeAccount` are no longer used — remove the dynamic `import('./compositeRepository')` was inline, and the top `import type { CompositeAccount }`.)

Run: `npx tsc --noEmit` and remove whatever it flags as unused.

- [ ] **Step 6: Write an integration test** — `src/data/createRepository.unified.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let configured = true;
let session: unknown = { user: { id: 'u1' } };
let cloudActive = true;
vi.mock('./supabaseClient', () => ({ isSupabaseConfigured: () => configured }));
vi.mock('../auth/authStore', () => ({ useAuthStore: { getState: () => ({ session }) } }));
vi.mock('../app/entitlementStore', () => ({ useEntitlementStore: { getState: () => ({ cloudActive }) } }));
// No Tauri global → buildCalDavStores returns [] (web path), so we test the
// local + Supabase composition deterministically.

import { createRepositoryAsync, isCloudMode } from './createRepository';
import { UnifiedRepository } from './sync/unifiedRepository';

describe('createRepositoryAsync — unified', () => {
  beforeEach(() => { configured = true; session = { user: { id: 'u1' } }; cloudActive = true; });

  it('returns a UnifiedRepository in cloud mode', async () => {
    expect(isCloudMode()).toBe(true);
    const repo = await createRepositoryAsync();
    expect(repo).toBeInstanceOf(UnifiedRepository);
    expect(repo.handlesTasks).toBe(true);
  });

  it('returns a UnifiedRepository in local mode too', async () => {
    cloudActive = false;
    const repo = await createRepositoryAsync();
    expect(repo).toBeInstanceOf(UnifiedRepository);
  });
});
```

- [ ] **Step 7: Update/remove the old cloud-mode repository test.** If `src/data/cloudMode.test.ts` (or any test) asserts `createRepositoryAsync` returns a `SupabaseRepository` or `TaskAwareRepository` wrapping Supabase in cloud mode, update that expectation to `UnifiedRepository`. Run the whole data suite to find breakage:

Run: `npx vitest run src/data`
Fix any test that encoded the old "cloud = Supabase-only" contract by asserting `UnifiedRepository` instead.

- [ ] **Step 8: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/data/createRepository.ts src/data/createRepository.unified.test.ts src/data/cloudMode.test.ts
git commit -m "feat(sync): assemble local+CalDAV+Supabase stores behind UnifiedRepository"
```

---

## Task 6: Architecture doc + roadmap

**Files:**
- Create: `src/data/sync/README.md`
- Modify: `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`
- Modify: `supabase/README.md`

- [ ] **Step 1: Write `src/data/sync/README.md`**

````markdown
# Unified sync engine (`src/data/sync`)

Reconciles **local + iCloud + Google + Supabase** into one logical calendar: an
event created, edited, or deleted in any store converges to the same state in all
of them. Applies to every user; Supabase is an extra store added for paid
subscribers (full cosmetic fidelity + cross-device sync without a calendar account).

## Pieces

| File | Responsibility |
|---|---|
| `types.ts` | `StoreKind`, `StoreMeta`, `Baseline`, `ReconcileResult`. |
| `reconcile.ts` | **Pure** algorithm: reads + baseline → merged set, per-store targets, new baseline. |
| `baseline.ts` | Persist the per-device baseline (localStorage). |
| `calDavAccountStore.ts` | Wrap one CalDAV account as a store (default-calendar routing, no tasks). |
| `unifiedRepository.ts` | Read all stores → `reconcile` → write targets → persist baseline. |

## The baseline (why it exists)

A single snapshot can't tell "deleted in iCloud" from "not yet created in iCloud" —
both look like *present in A, absent from B*. So each device persists a **baseline**:
per event, the `updatedAt` last synced and **which stores held it**. Deletion =
*an event the baseline recorded in a store that is active now but no longer has it.*

Losing the baseline is **safe**: the next sync sees an empty baseline, treats every
store as first-sync (union, no deletions inferred), and rebuilds it. Worst case is a
missed deletion (an event reappears), never data loss.

## Rules

- **Delete-wins:** a deletion in any active store removes the event everywhere.
- **Conflict:** newest `updatedAt` wins; the Supabase copy breaks exact ties.
- **Tasks** (dateless) live in local + Supabase only — never written to CalDAV.
- **First sync** (empty baseline) never infers a deletion.
- **Connect/disconnect safe:** a store not in the active set is ignored (no
  deletions); a newly connected store's events are treated as creations.

## Failure handling (no data loss)

- A store that **fails to read** is excluded from that pass — its baseline events
  are never mistaken for deletions.
- The **local** store is the durable anchor: a local read/write failure aborts the
  pass; remote read/write failures are best-effort and retried next sync.
- Each underlying repo diffs internally, so writing a target only issues the
  minimal create/update/delete.

## Store sets by tier

```
[ local ] + [ iCloud? ] + [ Google? ] + [ Supabase? (paid) ]
```

Local is always present. iCloud/Google are added when connected (desktop).
Supabase is added when `isCloudMode()` (signed in + active subscription).
````

- [ ] **Step 2: Update the roadmap** in `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md` — replace:

```markdown
- **P3d — realtime + iCloud-as-mirror:** ⏳ not started (split out of P3c).
```

with:

```markdown
- **P3d — unified sync engine:** ✅ shipped to `main`. local + iCloud + Google +
  Supabase reconcile into one calendar (create/edit/delete propagate; delete-wins;
  newest-wins, Supabase breaks ties) via a per-device baseline. Replaces the old
  "cloud = Supabase-only" path; applies to all tiers (Supabase added for paid). See
  `src/data/sync/README.md`.
- **P3e — realtime:** ⏳ not started — live propagation on top of the unified engine.
```

- [ ] **Step 3: Note the model in `supabase/README.md`** — under "How it fits the codebase", replace the `createRepository.ts` bullet:

```markdown
- `src/data/createRepository.ts` — picks the adapter at runtime: Supabase when
  signed in with an active Cloud subscription (`isCloudMode()`), else local.
```

with:

```markdown
- `src/data/createRepository.ts` — assembles the active sync stores (local always;
  iCloud/Google when connected; Supabase in cloud mode) behind
  `src/data/sync/UnifiedRepository`, which reconciles them into one calendar.
```

- [ ] **Step 4: Commit**

```bash
git add src/data/sync/README.md docs/superpowers/specs/2026-06-23-business-model-strategy-design.md supabase/README.md
git commit -m "docs: P3d unified sync engine — architecture doc + roadmap"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all pass. New tests: Task 1 (3) + Task 2 (8) + Task 3 (4) + Task 4 (5) + Task 5 (2) = 22 added (minus any old cloud-mode assertions rewritten in place).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Local-mode smoke**

`npm run dev` with no Supabase env and no connected calendar → events persist via
the local store exactly as before (`UnifiedRepository` over `[local]` alone). Create,
edit, delete an event; reload → state intact.

- [ ] **Step 4: (Human, live) Multi-store smoke**

Connect iCloud + Google: create an event → it appears in both Apple and Google
Calendar; delete it in Apple Calendar → after a reload it's gone from Google and the
app. As a `cloud_active` user, the same event is also in Supabase (visible on another
signed-in device); with no calendar connected, events still sync via Supabase alone.

---

## Self-Review

**Spec coverage (against `2026-06-27-p3d-unified-sync-engine-design.md`):**
- Store model (local always + iCloud/Google + Supabase paid) → Task 5 assembly. ✓
- Baseline (per-device, updatedAt + stores) → Task 1 + used in Tasks 2/4. ✓
- `reconcile` pure (delete-wins, newest+Supabase-tie, first-sync, connect/disconnect, task-exclusion) → Task 2 + tests. ✓
- `UnifiedRepository` (read all → reconcile → write targets → persist baseline; best-effort remotes; local anchor) → Task 4. ✓
- Per-account default-calendar routing + no tasks to CalDAV → Task 3 `CalDavAccountStore`. ✓
- Remove "cloud = Supabase-only" branch → Task 5 Step 4. ✓
- Cosmetics unchanged (event cosmetics ride CalDAV via the event; categories/settings/day-bg untouched) → no code here touches them. ✓
- Reliability/risk (pure-function TDD, best-effort writes, read-failure ≠ deletion) → Tasks 2 + 4 + README. ✓
- Docs (architecture README, roadmap, supabase/README) → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete; commands have expected output. The multi-store live smoke is a flagged human step (in-repo logic is unit-tested with fakes).

**Type consistency:**
- `StoreMeta { id, kind }` / `Baseline` / `ReconcileResult` (Task 1) are consumed identically in `reconcile` (Task 2) and `UnifiedRepository` (Task 4).
- `SyncStore { id, kind, repo }` (Task 4) is what `buildCalDavStores` and `createRepositoryAsync` build (Task 5).
- `reconcile(baseline, reads, stores, supabaseId)` signature matches its call in `UnifiedRepository.load`.
- `CalDavAccountStore(inner, accountCalendars, defaultUrl)` (Task 3) matches its construction in `buildCalDavStores` (Task 5).
- `isTaskEvent` (existing `src/core/tasks`) used consistently; `handlesTasks = true` on `UnifiedRepository` so the app doesn't double-wrap task handling (the local store's `TaskAwareRepository` and Supabase handle tasks; CalDAV is filtered).

**Note for the implementer:** Task 5 removes the old cloud-mode branch — run the full `src/data` suite (Step 7) to catch any test that encoded "cloud = Supabase-only" and update it to expect `UnifiedRepository`.

**Two non-negotiable safety tests in Task 4** (do not skip — they guard against real data loss):
- *failed remote **read*** → the store is excluded that pass, so its baseline events are never seen as deletions.
- *failed remote **write*** → the baseline records only stores that actually persisted, so the next sync doesn't read the absent event as a deletion and propagate it. The baseline is built **after** writes from real outcomes, never from `reconcile`'s optimistic view — that's why `reconcile` returns only `{ merged, targets }`.
