import type { CalendarEvent } from '../../core/types';
import { storeHolds, type Baseline, type ReconcileResult, type StoreMeta } from './types';

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
      // Tasks never go to CalDAV; a store may also decline events it does not
      // own (another account's shared calendar). See `storeHolds`.
      if (!storeHolds(s, canonical)) continue;
      targets[s.id].push(canonical);
    }
  }

  return { merged, targets };
}
