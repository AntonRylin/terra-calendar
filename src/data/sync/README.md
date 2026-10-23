# Unified sync engine (`src/data/sync`)

Reconciles **local + iCloud + Google + Supabase** into one logical calendar: an
event created, edited, or deleted in any store converges to the same state in all
of them. Applies to every user; Supabase is an extra store added for paid
subscribers (full cosmetic fidelity + cross-device sync without a calendar account).

## Pieces

| File | Responsibility |
|---|---|
| `types.ts` | `StoreKind`, `StoreMeta`, `Baseline`, `ReconcileResult`. |
| `reconcile.ts` | **Pure** algorithm: reads + baseline → merged set + per-store targets. |
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

The baseline is always built **after** writing, from what each store actually
persisted — so a failed write is never later read as a deletion.

## Rules

- **Delete-wins:** a deletion in any active store removes the event everywhere.
- **Conflict:** newest `updatedAt` wins; the Supabase copy breaks exact ties.
- **Tasks** (dateless) live in local + Supabase only — never written to CalDAV.
- **First sync** (empty baseline) never infers a deletion.
- **Connect/disconnect safe:** a store not in the active set is ignored (no
  deletions); a newly connected store's events are treated as creations.
- **Shared calendars stay with their owner:** an event that lives only on a
  calendar someone else shared with the user is written back **in place** and is
  never copied into the user's own calendars, their other CalDAV account, or
  Supabase. Read-only shares are never written to at all.

## `storeHolds` — stores may decline events

A store does not have to accept everything it is handed: a CalDAV account rejects
tasks and other accounts' shared events; Supabase rejects events the user does
not own. `storeHolds(store, event)` (in `types.ts`) is the single rule, used by
**both** `reconcile` (to compute write targets) and `UnifiedRepository` (to write
the baseline).

They must agree. The baseline records which stores hold which events, and a store
recorded as holding an event it silently declined reads as *deleted there* on the
next pass — which delete-wins then propagates everywhere, including to the shared
event's owner on their server. `CalDavAccountStore` therefore derives both its
`holds()` and its `saveAll()` projection from one private `project()` method, and
a test asserts the two agree case by case.

## Failure handling (no data loss)

- A store that **fails to read** is excluded from that pass — its baseline events
  are never mistaken for deletions. (Store adapters must **throw** on a failed
  read; returning an empty list would read as "everything deleted here".)
- A store that **fails to write** is not recorded in the baseline for those events,
  so the next sync re-propagates rather than reading a phantom deletion.
- A **pending deletion** keeps its baseline entry: an event deleted while a store
  was unreachable (offline) would otherwise leave the baseline and resurrect from
  that store's surviving copy. The kept entry still lists stores that no longer
  hold the event (local at minimum), so the deletion is re-inferred and
  re-propagated until every store confirms it.
- The **local** store is the durable anchor: a local read/write failure aborts the
  pass; remote failures are best-effort and retried next sync.
- Each underlying repo diffs internally, so writing a target only issues the
  minimal create/update/delete.

## Store sets by tier

```
[ local ] + [ iCloud? ] + [ Google? ] + [ Supabase? (paid) ]
```

Local is always present. iCloud/Google are added when connected (desktop).
Supabase is added when `isCloudMode()` (signed in + active subscription).
Assembled in `src/data/createRepository.ts`.

Sharing sits on top of this without adding a store: calendars shared *with* the
user arrive inside their existing iCloud/Google accounts, flagged `shared` /
`readOnly` by discovery. Sharing *from* the app is a Cloud feature and is
deliberately **not** a sync store — see
`docs/superpowers/specs/2026-08-14-calendar-sharing-design.md`.
