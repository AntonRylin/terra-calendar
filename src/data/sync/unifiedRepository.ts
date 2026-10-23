import type { EventRepository, LoadResult } from '../repository';
import type { CalendarEvent } from '../../core/types';
import { reconcile } from './reconcile';
import { loadBaseline, saveBaseline } from './baseline';
import { storeHolds, type Baseline, type StoreKind, type StoreMeta } from './types';

/** One store the unified repository reconciles over. */
export interface SyncStore {
  id: string;
  kind: StoreKind;
  repo: EventRepository;
  /** See {@link StoreMeta.holds} — events this store will decline to persist. */
  holds?(event: CalendarEvent): boolean;
  onSyncStart?(): void;
  onSyncSuccess?(): void;
  onSyncError?(error: unknown): void;
}

/** The store's identity + acceptance rule, as reconcile and the baseline see it. */
function metaOf(s: SyncStore): StoreMeta {
  return { id: s.id, kind: s.kind, holds: s.holds };
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
 *
 * The baseline is always built AFTER writing, from what each store actually
 * persisted — so a failed write is never later read as a deletion.
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

    // Read every store concurrently — they are independent backends (a local
    // file, one or two CalDAV servers, Supabase), so the pass costs the slowest
    // one rather than the sum. Results are folded back in store order so
    // `active`, the baseline's store lists, and which warning wins stay stable.
    const settled = await Promise.all(
      this.stores.map(async (s) => {
        s.onSyncStart?.();
        try {
          const res = await s.repo.load();
          // CalDAV's offline fallback is a cache, never a fresh server snapshot.
          if (s.kind === 'caldav' && res.warning) throw new Error(res.warning);
          return { s, res, err: null as unknown };
        } catch (err) {
          return { s, res: null, err };
        }
      }),
    );

    for (const { s, res, err } of settled) {
      if (res) {
        reads[s.id] = res.events;
        active.push(s);
        warning ??= res.warning;
      } else {
        s.onSyncError?.(err);
        if (s.id === this.localId) throw err; // local is the durable anchor — abort
        // remote read failed → exclude this store this pass (no false deletions)
        warning ??= 'Sync unavailable — working locally; changes sync when back online.';
      }
    }

    const meta: StoreMeta[] = active.map(metaOf);
    const baseline = loadBaseline();
    const { merged, targets } = reconcile(baseline, reads, meta, this.supabaseId);

    // Write each store to its target, recording what each store ACTUALLY holds
    // afterwards: the target on success/skip, the prior read on failure. The
    // baseline is built from this — so a failed write is never later read as a
    // deletion (the store simply isn't recorded as holding the event yet).
    const post: Record<string, Set<string>> = {};
    await Promise.all(
      active.map(async (s) => {
        const target = targets[s.id] ?? [];
        const read = reads[s.id] ?? [];
        if (signature(target) === signature(read)) {
          post[s.id] = new Set(read.map((e) => e.id));
          s.onSyncSuccess?.();
          return;
        }
        try {
          await s.repo.saveAll(target);
          post[s.id] = new Set(target.map((e) => e.id));
          s.onSyncSuccess?.();
        } catch (err) {
          s.onSyncError?.(err);
          warning ??= 'Sync unavailable — working locally; retry sync in Settings.';
          if (s.id === this.localId) throw err; // local must persist
          post[s.id] = new Set(read.map((e) => e.id)); // write failed → still holds old read
        }
      }),
    );

    const activeIds = new Set(active.map((s) => s.id));
    const newBaseline: Baseline = {};
    for (const e of merged) {
      newBaseline[e.id] = {
        updatedAt: e.updatedAt,
        stores: [
          ...active.filter((s) => post[s.id]?.has(e.id)).map((s) => s.id),
          // An unreachable store still holds its last known copy. Forgetting
          // that membership here loses a subsequent offline deletion's tombstone.
          ...(baseline[e.id]?.stores ?? []).filter((id) =>
            !activeIds.has(id) && this.stores.some((s) => s.id === id)),
        ],
      };
    }

    // Pending deletions must stay in the baseline. If an event reconcile dropped
    // is still physically held by a store (its write failed) — or by a store that
    // couldn't be read this pass — dropping its entry would make that copy look
    // like a brand-new creation later and resurrect it. Keeping the entry (which
    // still lists stores that provably no longer hold the event, local at
    // minimum) lets reconcile re-infer the deletion until every store confirms.
    const mergedIds = new Set(merged.map((e) => e.id));
    for (const [id, entry] of Object.entries(baseline)) {
      if (mergedIds.has(id)) continue;
      const unconfirmed = entry.stores.some(
        (sid) =>
          this.stores.some((s) => s.id === sid) &&
          (!activeIds.has(sid) || post[sid]?.has(id)),
      );
      if (unconfirmed) newBaseline[id] = entry;
    }
    saveBaseline(newBaseline);
    return { events: merged, warning };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const prior = loadBaseline();
    const succeeded = new Set<string>();
    await Promise.all(
      this.stores.map(async (s) => {
        const target = events.filter((e) => storeHolds(metaOf(s), e));
        try {
          await s.repo.saveAll(target);
          succeeded.add(s.id);
        } catch (err) {
          s.onSyncError?.(err);
          if (s.id === this.localId) throw err; // local must succeed
          // remote write best-effort; the next load() reconciles it back
        }
      }),
    );

    // Record only stores that ACTUALLY persisted the event — a failed remote write,
    // or an event the store declined, must not later be read as a deletion.
    const newBaseline: Baseline = {};
    for (const e of events) {
      newBaseline[e.id] = {
        updatedAt: e.updatedAt,
        stores: this.stores
          .filter((s) => succeeded.has(s.id) && storeHolds(metaOf(s), e))
          .map((s) => s.id),
      };
    }

    // Pending deletions (see load): an id we previously synced to a store whose
    // write just failed (e.g. deleted while offline) keeps its baseline entry, so
    // the next load re-infers the deletion from local's absence and propagates it
    // once the store is reachable — instead of resurrecting the store's copy.
    const present = new Set(events.map((e) => e.id));
    for (const [id, entry] of Object.entries(prior)) {
      if (present.has(id)) continue;
      const unconfirmed = entry.stores.some(
        (sid) => this.stores.some((s) => s.id === sid) && !succeeded.has(sid),
      );
      if (unconfirmed) newBaseline[id] = entry;
    }
    saveBaseline(newBaseline);
  }
}
