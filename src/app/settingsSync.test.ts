import { vi, beforeEach, describe, it, expect } from 'vitest';

// Pretend we're on desktop with a durable settings file available.
const readSettingsFile = vi.fn<() => Promise<string | null>>();
const writeSettingsFile = vi.fn(async (_json: string) => {});
vi.mock('../data/settingsFile', () => ({
  settingsFileAvailable: () => true,
  readSettingsFile: () => readSettingsFile(),
  writeSettingsFile: (json: string) => writeSettingsFile(json),
}));

import { useSettingsStore, hydrateSettingsFromDisk, exportSettings, importSettings } from './settingsStore';

const STORAGE_KEY = 'open-calendar.settings';

describe('settings disk hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    readSettingsFile.mockReset();
    writeSettingsFile.mockClear();
    useSettingsStore.setState({ categories: {}, theme: 'light' });
  });

  it('loads category cosmetics from the disk file into the store', async () => {
    readSettingsFile.mockResolvedValue(
      JSON.stringify({
        theme: 'dark',
        categories: {
          Work: { type: 'gradient', value: 'linear-gradient(90deg,#a,#b)', cosmetic: 'sunset' },
        },
      }),
    );

    await hydrateSettingsFromDisk();

    const s = useSettingsStore.getState();
    expect(s.theme).toBe('dark');
    expect(s.categories.Work).toEqual({
      type: 'gradient',
      value: 'linear-gradient(90deg,#a,#b)',
      cosmetic: 'sunset',
    });

    // Mirrored back into localStorage so the next synchronous load matches disk.
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed.categories.Work.cosmetic).toBe('sunset');
  });

  it('seeds the disk file from current settings when none exists yet', async () => {
    readSettingsFile.mockResolvedValue(null);
    useSettingsStore.getState().setCategoryConfig('Home', { type: 'color', value: '#fff' });
    writeSettingsFile.mockClear(); // ignore the persist() write triggered above

    await hydrateSettingsFromDisk();

    expect(writeSettingsFile).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeSettingsFile.mock.calls[0][0]);
    expect(written.categories.Home).toEqual({ type: 'color', value: '#fff' });
  });

  it('keeps existing settings when the disk file is malformed', async () => {
    useSettingsStore.getState().setCategoryConfig('Keep', { type: 'color', value: '#123' });
    readSettingsFile.mockResolvedValue('{ not json');

    await hydrateSettingsFromDisk();

    expect(useSettingsStore.getState().categories.Keep).toEqual({ type: 'color', value: '#123' });
  });
});

describe('settings export / import', () => {
  beforeEach(() => {
    localStorage.clear();
    writeSettingsFile.mockClear();
    useSettingsStore.setState({ categories: {}, theme: 'light', accentColor: '#0a84ff' });
  });

  it('round-trips categories and preferences through export → import', () => {
    const s = useSettingsStore.getState();
    s.setCategoryConfig('Work', { type: 'gradient', value: 'linear-gradient(#a,#b)', cosmetic: 'aurora' });
    s.setTheme('dark');

    const snapshot = exportSettings();
    const parsed = JSON.parse(snapshot);
    expect(parsed.kind).toBe('open-calendar-settings');
    expect(parsed.settings.categories.Work.cosmetic).toBe('aurora');

    // Wipe, then restore from the snapshot.
    useSettingsStore.setState({ categories: {}, theme: 'light' });
    const result = importSettings(snapshot);

    expect(result).toEqual({ ok: true });
    const restored = useSettingsStore.getState();
    expect(restored.theme).toBe('dark');
    expect(restored.categories.Work).toEqual({ type: 'gradient', value: 'linear-gradient(#a,#b)', cosmetic: 'aurora' });
    // Import persists to both mirrors.
    expect(writeSettingsFile).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).categories.Work.cosmetic).toBe('aurora');
  });

  it('accepts a bare settings object (e.g. a raw localStorage value)', () => {
    const result = importSettings(JSON.stringify({ categories: { Gym: { type: 'color', value: '#0f0' } } }));
    expect(result.ok).toBe(true);
    expect(useSettingsStore.getState().categories.Gym).toEqual({ type: 'color', value: '#0f0' });
  });

  it('rejects non-JSON and unrelated JSON with a reason', () => {
    expect(importSettings('not json at all').ok).toBe(false);
    const unrelated = importSettings(JSON.stringify({ hello: 'world' }));
    expect(unrelated.ok).toBe(false);
    // The store is untouched on a failed import.
    expect(useSettingsStore.getState().categories).toEqual({});
  });
});
