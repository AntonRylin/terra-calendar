import { describe, it, expect, vi, beforeEach } from 'vitest';

let cloudOn = true;
const pushSettings = vi.fn(async (_d: Record<string, unknown>) => {});
const pullSettings = vi.fn(async () => null as Record<string, unknown> | null);
vi.mock('../data/createRepository', () => ({ isCloudMode: () => cloudOn }));
vi.mock('../data/cloudSettings', () => ({
  pushSettings: (d: Record<string, unknown>) => pushSettings(d),
  pullSettings: () => pullSettings(),
}));
vi.mock('../data/settingsFile', () => ({
  settingsFileAvailable: () => false,
  readSettingsFile: async () => null,
  writeSettingsFile: async () => {},
}));

import { useSettingsStore, syncableSettings, hydrateSettingsFromCloud } from './settingsStore';

describe('cloud settings sync', () => {
  beforeEach(() => {
    cloudOn = true;
    pushSettings.mockClear();
    pullSettings.mockReset();
    localStorage.clear();
    useSettingsStore.setState({ categories: {}, theme: 'light', sidebarWidth: 30, minimapSize: 100 });
  });

  it('syncableSettings includes preferences/categories and excludes device-local sizing', () => {
    const s = syncableSettings(useSettingsStore.getState());
    expect(s).toHaveProperty('theme');
    expect(s).toHaveProperty('categories');
    expect(s).not.toHaveProperty('sidebarWidth');
    expect(s).not.toHaveProperty('sidebarSplit');
    expect(s).not.toHaveProperty('minimapSize');
    expect(s).not.toHaveProperty('fontScale');
    expect(s).not.toHaveProperty('tileScale');
  });

  it('hydrate merges cloud preferences but keeps device-local; empty cloud seeds', async () => {
    // Existing cloud row → applied over current, device-local untouched.
    pullSettings.mockResolvedValueOnce({ theme: 'dark', categories: { Work: { type: 'color', value: '#f00' } } });
    useSettingsStore.setState({ sidebarWidth: 42 });
    await hydrateSettingsFromCloud();
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().categories.Work).toEqual({ type: 'color', value: '#f00' });
    expect(useSettingsStore.getState().sidebarWidth).toBe(42); // device-local preserved

    // Empty cloud → seed from current.
    pullSettings.mockResolvedValueOnce(null);
    pushSettings.mockClear();
    await hydrateSettingsFromCloud();
    expect(pushSettings).toHaveBeenCalledTimes(1);
    expect(pushSettings.mock.calls[0][0]).not.toHaveProperty('sidebarWidth');
  });

  it('does nothing in local mode', async () => {
    cloudOn = false;
    await hydrateSettingsFromCloud();
    expect(pullSettings).not.toHaveBeenCalled();
  });
});
