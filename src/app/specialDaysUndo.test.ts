import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../data/createRepository', () => ({ isCloudMode: () => false }));
vi.mock('../data/cloudSpecialDays', () => ({
  pushSpecialDays: async () => {},
  pullSpecialDays: async () => null,
}));
vi.mock('../data/cloudDayImages', () => ({
  downloadDayImage: async () => null,
  deleteDayImage: async () => {},
}));
vi.mock('../data/dayImageStore', () => ({
  putImage: async () => ({ id: 'x', w: 0, h: 0 }),
  hasImage: async () => true,
  getImageUrl: async () => null,
  deleteImage: async () => {},
  listImageIds: async () => [],
}));

import { useSpecialDaysStore, type SpecialDay } from './specialDaysStore';
import { canUndo, canRedo, undoStep, redoStep, resetHistory } from './history';

const STORAGE_KEY = 'open-calendar.special-days';

function day(cosmetic: string): Omit<SpecialDay, 'id' | 'date'> {
  return { cosmetic, animations: [], emoji: '', recurrence: 'none' };
}

/** What the grid would render for a date, by cosmetic. */
function cosmeticOn(date: string): string | undefined {
  return useSpecialDaysStore.getState().specialDays.find((d) => d.date === date)?.cosmetic;
}

describe('day styling undo', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
    useSpecialDaysStore.setState({ specialDays: [] });
    // Settle the "last committed" baseline at empty.
    useSpecialDaysStore.getState().commit();
    resetHistory();
  });

  it('undoes a whole panel session as one step', () => {
    const s = useSpecialDaysStore.getState();
    // A session: several in-memory tweaks, one commit on close.
    s.setSpecialDayInMemory('2026-07-22', day('aurora'));
    s.setSpecialDayInMemory('2026-07-22', { ...day('sunset'), animations: ['snow'] });
    s.commit();

    expect(cosmeticOn('2026-07-22')).toBe('sunset');
    expect(canUndo()).toBe(true);
    return undoStep().then(() => {
      expect(cosmeticOn('2026-07-22')).toBeUndefined();
      expect(canUndo()).toBe(false);
    });
  });

  it('restores a reset day, background and all', async () => {
    const s = useSpecialDaysStore.getState();
    s.setSpecialDayInMemory('2026-07-22', {
      cosmetic: '',
      animations: ['sparkles'],
      emoji: '',
      recurrence: 'yearly',
      image: { kind: 'upload', id: 'img1', w: 4, h: 4 },
    });
    s.commit();

    // "Reset changes" clears everything, then the panel closes and commits.
    useSpecialDaysStore.getState().removeSpecialDayInMemory('2026-07-22');
    useSpecialDaysStore.getState().commit();
    expect(useSpecialDaysStore.getState().specialDays).toHaveLength(0);

    await undoStep();
    const restored = useSpecialDaysStore.getState().specialDays[0];
    expect(restored.animations).toEqual(['sparkles']);
    expect(restored.recurrence).toBe('yearly');
    expect(restored.image).toEqual({ kind: 'upload', id: 'img1', w: 4, h: 4 });
  });

  it('does not record a step when a panel is opened and closed untouched', () => {
    const s = useSpecialDaysStore.getState();
    s.setSpecialDayInMemory('2026-07-22', day('aurora'));
    s.commit();
    resetHistory();

    // Re-opening rewrites the same record with a fresh updatedAt, not an edit.
    useSpecialDaysStore.getState().setSpecialDayInMemory('2026-07-22', day('aurora'));
    useSpecialDaysStore.getState().commit();
    expect(canUndo()).toBe(false);
  });

  it('persists the restored state, not just the in-memory one', async () => {
    const s = useSpecialDaysStore.getState();
    s.setSpecialDayInMemory('2026-07-22', day('aurora'));
    s.commit();
    useSpecialDaysStore.getState().removeSpecialDayInMemory('2026-07-22');
    useSpecialDaysStore.getState().commit();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(0);

    await undoStep();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved).toHaveLength(1);
    expect(saved[0].cosmetic).toBe('aurora');
  });

  it('redoes the change it just undid', async () => {
    const s = useSpecialDaysStore.getState();
    s.setSpecialDayInMemory('2026-07-22', day('aurora'));
    s.commit();

    await undoStep();
    expect(cosmeticOn('2026-07-22')).toBeUndefined();
    expect(canRedo()).toBe(true);

    await redoStep();
    expect(cosmeticOn('2026-07-22')).toBe('aurora');
  });
});

