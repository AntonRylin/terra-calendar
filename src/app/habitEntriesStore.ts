import { create } from 'zustand';
import { isCloudMode } from '../data/createRepository';
import { pushHabitEntries, pullHabitEntries } from '../data/cloudHabits';
import { useSettingsStore } from './settingsStore';

const STORAGE_KEY = 'open-calendar.habit-entries';

/** JSON of the last entries object pushed to the cloud — skips redundant pushes. */
let lastPushedHabitEntries = '';

/** Longest text note a day can hold — keeps the whole-blob storage (and the
 *  subscriber cloud row) bounded even after years of daily entries. */
export const MAX_TEXT_ENTRY_LENGTH = 500;

/** One recorded day of a habit tab. `v` is a boolean (check tabs), string
 *  (text tabs), or number (number tabs). `null` is a cleared tombstone: it
 *  stays in the record so a clear wins last-writer-wins merges against an
 *  older value from another device instead of being resurrected. */
export interface HabitEntry {
  v: boolean | string | number | null;
  updatedAt: string; // ISO
}

/** All recorded days, keyed by tab id then by "YYYY-MM-DD". */
export type HabitEntries = Record<string, Record<string, HabitEntry>>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize a raw stored blob into current-shape HabitEntries, dropping
 *  anything malformed so old clients never crash on newer/corrupt data. */
export function normalizeEntries(raw: unknown): HabitEntries {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: HabitEntries = {};
  for (const [tabId, days] of Object.entries(raw as Record<string, unknown>)) {
    if (!days || typeof days !== 'object' || Array.isArray(days)) continue;
    const normDays: Record<string, HabitEntry> = {};
    for (const [date, entry] of Object.entries(days as Record<string, unknown>)) {
      if (!DATE_KEY.test(date) || !entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      let v = e.v;
      if (typeof v === 'string') {
        v = v.slice(0, MAX_TEXT_ENTRY_LENGTH);
      } else if (typeof v === 'number') {
        if (!Number.isFinite(v)) continue;
      } else if (typeof v !== 'boolean' && v !== null) {
        continue;
      }
      normDays[date] = {
        v: v as HabitEntry['v'],
        updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : '',
      };
    }
    if (Object.keys(normDays).length > 0) out[tabId] = normDays;
  }
  return out;
}

/** Merge two entry sets per (tabId, date), keeping the newer `updatedAt`
 *  (last-writer-wins; ties favor cloud, matching mergeSpecialDaysByDate).
 *  Tombstones participate, so a clear propagates across devices. */
export function mergeHabitEntries(local: HabitEntries, cloud: HabitEntries): HabitEntries {
  const out: HabitEntries = {};
  for (const [tabId, days] of Object.entries(local)) out[tabId] = { ...days };
  for (const [tabId, days] of Object.entries(cloud)) {
    const target = (out[tabId] ??= {});
    for (const [date, entry] of Object.entries(days)) {
      const existing = target[date];
      if (!existing || (entry.updatedAt ?? '') >= (existing.updatedAt ?? '')) {
        target[date] = entry;
      }
    }
  }
  return out;
}

interface HabitEntriesState {
  entries: HabitEntries;
  init(): void;
  /** Record a day's value for a tab (boolean/text/number by tab kind). */
  setEntry(tabId: string, date: string, v: boolean | string | number): void;
  /** Clear a day's value, leaving a tombstone so the clear syncs. */
  clearEntry(tabId: string, date: string): void;
  /** Drop every recorded day of a deleted tab. */
  deleteTabEntries(tabId: string): void;
  commit(): void;
}

export const useHabitEntriesStore = create<HabitEntriesState>((set, get) => ({
  entries: {},
  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        set({ entries: normalizeEntries(JSON.parse(saved)) });
      } catch (e) {
        console.error('Failed to parse habit entries:', e);
      }
    }
  },
  setEntry(tabId, date, v) {
    const value = typeof v === 'string' ? v.slice(0, MAX_TEXT_ENTRY_LENGTH) : v;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    const entries = { ...get().entries };
    entries[tabId] = {
      ...entries[tabId],
      [date]: { v: value, updatedAt: new Date().toISOString() },
    };
    set({ entries });
    get().commit();
  },
  clearEntry(tabId, date) {
    const days = get().entries[tabId];
    if (!days?.[date]) return;
    const entries = {
      ...get().entries,
      [tabId]: { ...days, [date]: { v: null, updatedAt: new Date().toISOString() } },
    };
    set({ entries });
    get().commit();
  },
  deleteTabEntries(tabId) {
    if (!get().entries[tabId]) return;
    const entries = { ...get().entries };
    delete entries[tabId];
    set({ entries });
    get().commit();
  },
  commit() {
    const entries = get().entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    // Subscribers also mirror the whole object to the cloud. Skip redundant
    // pushes (e.g. a no-op clear) by comparing against the last pushed JSON.
    if (isCloudMode()) {
      const json = JSON.stringify(entries);
      if (json !== lastPushedHabitEntries) {
        lastPushedHabitEntries = json;
        void pushHabitEntries(entries);
      }
    }
  },
}));

/**
 * Prune entry subtrees whose tab no longer exists in the settings. Only safe to
 * run after both settings and entries have hydrated (i.e. from the cloud-sync
 * flow) — never on a plain local load, where settings may arrive later.
 */
function pruneOrphanedTabs(entries: HabitEntries): HabitEntries {
  const known = new Set(useSettingsStore.getState().habitTabs.map((t) => t.id));
  const out: HabitEntries = {};
  for (const [tabId, days] of Object.entries(entries)) {
    if (known.has(tabId)) out[tabId] = days;
  }
  return out;
}

/**
 * Pull the subscriber's cloud habit entries, merge per-(tabId,date)
 * last-writer-wins with the local set, prune entries for deleted tabs, then
 * push the merged result back. An empty cloud is seeded from local. No-op
 * outside cloud mode. Call on cloud activation.
 */
export async function hydrateHabitEntriesFromCloud(): Promise<void> {
  if (!isCloudMode()) return;
  const raw = await pullHabitEntries();
  const local = useHabitEntriesStore.getState().entries;
  if (raw) {
    const cloud = normalizeEntries(raw);
    const merged = pruneOrphanedTabs(mergeHabitEntries(local, cloud));
    useHabitEntriesStore.setState({ entries: merged });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    // Push the merged set back so this device's local-only entries reach the
    // cloud immediately (not just on the next local edit).
    lastPushedHabitEntries = JSON.stringify(merged);
    await pushHabitEntries(merged);
  } else {
    // Empty cloud: seed it from local.
    lastPushedHabitEntries = JSON.stringify(local);
    await pushHabitEntries(local);
  }
}
