import { describe, it, expect, vi, beforeEach } from 'vitest';

let cloudOn = true;
const pushHabitEntries = vi.fn(async (_d: Record<string, unknown>) => {});
const pullHabitEntries = vi.fn(async () => null as Record<string, unknown> | null);
vi.mock('../data/createRepository', () => ({ isCloudMode: () => cloudOn }));
vi.mock('../data/cloudHabits', () => ({
  pushHabitEntries: (d: Record<string, unknown>) => pushHabitEntries(d),
  pullHabitEntries: () => pullHabitEntries(),
}));

import { useHabitEntriesStore, hydrateHabitEntriesFromCloud } from './habitEntriesStore';
import { useSettingsStore, type HabitTab } from './settingsStore';

const at = (h: number) => `2026-07-12T${String(h).padStart(2, '0')}:00:00.000Z`;
const tabs: HabitTab[] = [
  { id: 'gym', name: 'Gym', icon: 'dumbbell', kind: 'check' },
  { id: 'money', name: 'Money', icon: 'dollar', kind: 'number' },
];

describe('cloud habit-entries sync', () => {
  beforeEach(() => {
    cloudOn = true;
    pushHabitEntries.mockClear();
    pullHabitEntries.mockReset();
    localStorage.clear();
    useHabitEntriesStore.setState({ entries: {} });
    useSettingsStore.setState({ habitTabs: tabs });
  });

  it('commit pushes the object in cloud mode and dedupes identical pushes', () => {
    useHabitEntriesStore.getState().setEntry('gym', '2026-01-01', true);
    expect(pushHabitEntries).toHaveBeenCalledTimes(1);
    // Committing again with unchanged content should not push a second time.
    useHabitEntriesStore.getState().commit();
    expect(pushHabitEntries).toHaveBeenCalledTimes(1);
  });

  it('does not push outside cloud mode', () => {
    cloudOn = false;
    useHabitEntriesStore.getState().setEntry('gym', '2026-01-01', true);
    expect(pushHabitEntries).not.toHaveBeenCalled();
  });

  it('hydrate merges per (tab,date) by updatedAt and re-pushes', async () => {
    useHabitEntriesStore.setState({
      entries: {
        gym: { '2026-01-01': { v: true, updatedAt: at(1) } },     // will lose to cloud
        money: { '2026-02-02': { v: 5, updatedAt: at(1) } },      // local-only kept
      },
    });
    pullHabitEntries.mockResolvedValueOnce({
      gym: { '2026-01-01': { v: false, updatedAt: at(5) }, '2026-03-03': { v: true, updatedAt: at(1) } },
    });
    await hydrateHabitEntriesFromCloud();
    const e = useHabitEntriesStore.getState().entries;
    expect(e.gym['2026-01-01'].v).toBe(false);   // cloud newer wins
    expect(e.gym['2026-03-03'].v).toBe(true);     // cloud-only added
    expect(e.money['2026-02-02'].v).toBe(5);      // local-only kept
    expect(pushHabitEntries).toHaveBeenCalled();  // merged set pushed back
  });

  it('prunes entries whose tab no longer exists in settings', async () => {
    useSettingsStore.setState({ habitTabs: [tabs[0]] }); // only 'gym' remains
    useHabitEntriesStore.setState({ entries: { gym: { '2026-01-01': { v: true, updatedAt: at(1) } } } });
    pullHabitEntries.mockResolvedValueOnce({
      deleted: { '2026-01-01': { v: 'orphan', updatedAt: at(9) } },
    });
    await hydrateHabitEntriesFromCloud();
    const e = useHabitEntriesStore.getState().entries;
    expect(e.gym).toBeDefined();
    expect(e.deleted).toBeUndefined();
  });

  it('empty cloud seeds from local', async () => {
    useHabitEntriesStore.setState({ entries: { gym: { '2026-01-01': { v: true, updatedAt: at(1) } } } });
    pullHabitEntries.mockResolvedValueOnce(null);
    await hydrateHabitEntriesFromCloud();
    expect(pushHabitEntries).toHaveBeenCalledTimes(1);
  });

  it('does nothing in local mode', async () => {
    cloudOn = false;
    await hydrateHabitEntriesFromCloud();
    expect(pullHabitEntries).not.toHaveBeenCalled();
  });
});
