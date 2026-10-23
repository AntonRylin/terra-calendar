import { exportHabits, importHabits, HABITS_EXPORT_KIND, HABITS_EXPORT_VERSION } from './habitBackup';
import { useSettingsStore, type HabitTab } from './settingsStore';
import { useHabitEntriesStore } from './habitEntriesStore';

describe('habit tracker export and import', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ habitTabs: [], habitTabsEnabled: false });
    useHabitEntriesStore.setState({ entries: {} });
  });

  it('exports habit tabs and daily entries correctly', () => {
    const tabs: HabitTab[] = [
      { id: 'tab-1', name: 'Workout', icon: 'dumbbell', kind: 'check' },
      { id: 'tab-2', name: 'Water', icon: 'droplet', kind: 'number' },
    ];
    useSettingsStore.setState({ habitTabs: tabs, habitTabsEnabled: true });
    useHabitEntriesStore.setState({
      entries: {
        'tab-1': {
          '2026-08-01': { v: true, updatedAt: '2026-08-01T10:00:00.000Z' },
        },
        'tab-2': {
          '2026-08-01': { v: 8, updatedAt: '2026-08-01T12:00:00.000Z' },
        },
      },
    });

    const json = exportHabits();
    const parsed = JSON.parse(json);

    expect(parsed.kind).toBe(HABITS_EXPORT_KIND);
    expect(parsed.version).toBe(HABITS_EXPORT_VERSION);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.habitTabsEnabled).toBe(true);
    expect(parsed.habitTabs).toEqual(tabs);
    expect(parsed.entries['tab-1']['2026-08-01'].v).toBe(true);
    expect(parsed.entries['tab-2']['2026-08-01'].v).toBe(8);
  });

  it('imports a exported habits file and restores tabs and entries', () => {
    const tabs: HabitTab[] = [
      { id: 'tab-run', name: 'Running', icon: 'flame', kind: 'check' },
    ];
    const exportBundle = JSON.stringify({
      kind: HABITS_EXPORT_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      habitTabsEnabled: true,
      habitTabs: tabs,
      entries: {
        'tab-run': {
          '2026-08-10': { v: true, updatedAt: '2026-08-10T08:00:00.000Z' },
          '2026-08-11': { v: true, updatedAt: '2026-08-11T08:00:00.000Z' },
        },
      },
    });

    const res = importHabits(exportBundle);

    expect(res).toEqual({ ok: true, tabsCount: 1, entriesCount: 2 });
    expect(useSettingsStore.getState().habitTabsEnabled).toBe(true);
    expect(useSettingsStore.getState().habitTabs).toEqual(tabs);
    expect(useHabitEntriesStore.getState().entries['tab-run']['2026-08-10'].v).toBe(true);
    expect(useHabitEntriesStore.getState().entries['tab-run']['2026-08-11'].v).toBe(true);
  });

  it('merges imported tabs and entries with existing ones', () => {
    const existingTab: HabitTab = { id: 'tab-1', name: 'Old Read', icon: 'book', kind: 'check' };
    const importedTab1: HabitTab = { id: 'tab-1', name: 'Reading', icon: 'book-open', kind: 'check' };
    const importedTab2: HabitTab = { id: 'tab-2', name: 'Meditation', icon: 'sparkles', kind: 'check' };

    useSettingsStore.setState({ habitTabs: [existingTab], habitTabsEnabled: true });
    useHabitEntriesStore.setState({
      entries: {
        'tab-1': {
          '2026-08-01': { v: true, updatedAt: '2026-08-01T09:00:00.000Z' },
        },
      },
    });

    const exportBundle = JSON.stringify({
      kind: HABITS_EXPORT_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      habitTabs: [importedTab1, importedTab2],
      entries: {
        'tab-1': {
          '2026-08-01': { v: false, updatedAt: '2026-08-01T10:00:00.000Z' }, // newer
          '2026-08-02': { v: true, updatedAt: '2026-08-02T10:00:00.000Z' },
        },
        'tab-2': {
          '2026-08-02': { v: true, updatedAt: '2026-08-02T11:00:00.000Z' },
        },
      },
    });

    const res = importHabits(exportBundle);

    expect(res.ok).toBe(true);
    const finalTabs = useSettingsStore.getState().habitTabs;
    expect(finalTabs).toHaveLength(2);
    expect(finalTabs[0]).toEqual(importedTab1); // updated in place
    expect(finalTabs[1]).toEqual(importedTab2); // appended

    const finalEntries = useHabitEntriesStore.getState().entries;
    expect(finalEntries['tab-1']['2026-08-01'].v).toBe(false);
    expect(finalEntries['tab-1']['2026-08-02'].v).toBe(true);
    expect(finalEntries['tab-2']['2026-08-02'].v).toBe(true);
  });

  it('accepts bare format with habitTabs and entries', () => {
    const bundle = JSON.stringify({
      habitTabs: [{ id: 'tab-x', name: 'Journal', icon: 'pencil', kind: 'text' }],
      entries: {
        'tab-x': {
          '2026-08-05': { v: 'Great day', updatedAt: '2026-08-05T20:00:00.000Z' },
        },
      },
    });

    const res = importHabits(bundle);
    expect(res.ok).toBe(true);
    expect(useSettingsStore.getState().habitTabs[0].name).toBe('Journal');
    expect(useHabitEntriesStore.getState().entries['tab-x']['2026-08-05'].v).toBe('Great day');
  });

  it('rejects invalid JSON or files with no habits/entries', () => {
    expect(importHabits('not valid json')).toEqual({ ok: false, error: 'the file is not valid JSON' });
    expect(importHabits(JSON.stringify({ random: 123 }))).toEqual({
      ok: false,
      error: 'the file is not an Terra Calendar habits file',
    });
    expect(importHabits(JSON.stringify({ kind: HABITS_EXPORT_KIND, habitTabs: [], entries: {} }))).toEqual({
      ok: false,
      error: 'no habits or recorded entries found in the file',
    });
  });
});
