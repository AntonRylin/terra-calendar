import { useSettingsStore, normalizeHabitTab, type HabitTab } from './settingsStore';
import { useHabitEntriesStore, normalizeEntries, mergeHabitEntries, type HabitEntries } from './habitEntriesStore';

export const HABITS_EXPORT_KIND = 'open-calendar-habits';
export const HABITS_EXPORT_VERSION = 1;

export interface HabitsExport {
  kind: 'open-calendar-habits';
  version: number;
  exportedAt: string;
  habitTabsEnabled: boolean;
  habitTabs: HabitTab[];
  entries: HabitEntries;
}

export type ImportHabitsResult =
  | { ok: true; tabsCount: number; entriesCount: number }
  | { ok: false; error: string };

/**
 * Produce a portable JSON snapshot of the user's habit tabs and all daily logs
 * (checkmarks, notes, and counts).
 */
export function exportHabits(): string {
  const { habitTabs, habitTabsEnabled } = useSettingsStore.getState();
  const { entries } = useHabitEntriesStore.getState();

  const bundle: HabitsExport = {
    kind: HABITS_EXPORT_KIND,
    version: HABITS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    habitTabsEnabled,
    habitTabs,
    entries,
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Apply a habits snapshot produced by {@link exportHabits}. Accepts either the
 * wrapped shape or a bare object containing `habitTabs` and/or `entries`. Merges
 * tabs and day entries with existing local data and persists to storage.
 */
export function importHabits(text: string): ImportHabitsResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'the file is not valid JSON' };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'the file is not an Terra Calendar habits file' };
  }

  const d = data as Record<string, unknown>;
  const isWrapped = d.kind === HABITS_EXPORT_KIND;
  let rawTabs: unknown;
  let rawEntries: unknown;

  if (isWrapped) {
    rawTabs = d.habitTabs;
    rawEntries = d.entries;
  } else if ('habitTabs' in d || 'entries' in d) {
    rawTabs = d.habitTabs;
    rawEntries = d.entries;
  } else {
    return { ok: false, error: 'the file is not an Terra Calendar habits file' };
  }

  const importedTabs: HabitTab[] = Array.isArray(rawTabs)
    ? rawTabs.map(normalizeHabitTab).filter((t): t is HabitTab => t !== null)
    : [];
  const importedEntries: HabitEntries = rawEntries ? normalizeEntries(rawEntries) : {};

  if (importedTabs.length === 0 && Object.keys(importedEntries).length === 0) {
    return { ok: false, error: 'no habits or recorded entries found in the file' };
  }

  if (importedTabs.length > 0) {
    const currentTabs = useSettingsStore.getState().habitTabs;
    const existingIds = new Set(currentTabs.map((t) => t.id));
    const mergedTabs = currentTabs.map((t) => {
      const incoming = importedTabs.find((it) => it.id === t.id);
      return incoming ?? t;
    });
    for (const t of importedTabs) {
      if (!existingIds.has(t.id)) {
        mergedTabs.push(t);
      }
    }
    useSettingsStore.getState().setHabitTabs(mergedTabs);
    useSettingsStore.getState().setHabitTabsEnabled(true);
  }

  if (Object.keys(importedEntries).length > 0) {
    const currentEntries = useHabitEntriesStore.getState().entries;
    const mergedEntries = mergeHabitEntries(currentEntries, importedEntries);
    useHabitEntriesStore.setState({ entries: mergedEntries });
    useHabitEntriesStore.getState().commit();
  }

  const totalEntries = Object.values(importedEntries).reduce(
    (acc, days) => acc + Object.keys(days).length,
    0
  );

  return { ok: true, tabsCount: importedTabs.length, entriesCount: totalEntries };
}
