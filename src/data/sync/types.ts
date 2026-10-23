import type { CalendarEvent } from '../../core/types';
import { isTaskEvent } from '../../core/tasks';

/** A sync store is `local` (JSON file / browser), `caldav` (one iCloud or Google
 *  account), or `supabase` (cloud). Kind drives task routing + the tie-breaker. */
export type StoreKind = 'local' | 'caldav' | 'supabase';

/** Identifies one store in a reconcile pass. */
export interface StoreMeta {
  id: string;
  kind: StoreKind;
  /** Whether this store will actually persist `event` when handed the full set.
   *  Stores legitimately decline events — a CalDAV account will not take another
   *  account's shared-calendar events, and the cloud will not take events the
   *  user does not own. Absent = takes everything.
   *
   *  The baseline MUST agree with this predicate. It records which stores hold
   *  which events, and a store recorded as holding an event it silently dropped
   *  reads as a deletion on the next pass — which then propagates and deletes
   *  the event for real, on its owner's server. */
  holds?(event: CalendarEvent): boolean;
}

/** The single rule for "does this store take this event?" — used both when
 *  computing write targets and when writing the baseline, so the two can never
 *  disagree. Tasks are dateless and never belong on a CalDAV server. */
export function storeHolds(store: StoreMeta, event: CalendarEvent): boolean {
  if (store.kind === 'caldav' && isTaskEvent(event)) return false;
  return store.holds ? store.holds(event) : true;
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
