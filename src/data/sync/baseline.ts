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
