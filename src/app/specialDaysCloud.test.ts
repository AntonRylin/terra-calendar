import { describe, it, expect, vi, beforeEach } from 'vitest';

let cloudOn = true;
const pushSpecialDays = vi.fn(async (_d: unknown[]) => {});
const pullSpecialDays = vi.fn(async () => null as unknown[] | null);
const downloadDayImage = vi.fn(async (_id: string) => null as Blob | null);
const putImage = vi.fn(async (_b: Blob, _w: number, _h: number) => ({ id: 'x', w: 0, h: 0 }));
const hasImage = vi.fn(async (_id: string) => false);
const listImageIds = vi.fn(async () => [] as string[]);
const deleteImage = vi.fn(async (_id: string) => {});
const deleteDayImage = vi.fn(async (_id: string) => {});
vi.mock('../data/createRepository', () => ({ isCloudMode: () => cloudOn }));
vi.mock('../data/cloudSpecialDays', () => ({
  pushSpecialDays: (d: unknown[]) => pushSpecialDays(d),
  pullSpecialDays: () => pullSpecialDays(),
}));
vi.mock('../data/cloudDayImages', () => ({
  downloadDayImage: (id: string) => downloadDayImage(id),
  deleteDayImage: (id: string) => deleteDayImage(id),
}));
vi.mock('../data/dayImageStore', () => ({
  putImage: (b: Blob, w: number, h: number) => putImage(b, w, h),
  hasImage: (id: string) => hasImage(id),
  getImageUrl: async () => null,
  deleteImage: (id: string) => deleteImage(id),
  listImageIds: () => listImageIds(),
}));

import { useSpecialDaysStore, hydrateDayBackgroundsFromCloud } from './specialDaysStore';

describe('cloud day-background sync', () => {
  beforeEach(() => {
    cloudOn = true;
    pushSpecialDays.mockClear();
    pullSpecialDays.mockReset();
    downloadDayImage.mockReset().mockResolvedValue(null);
    putImage.mockClear();
    hasImage.mockReset().mockResolvedValue(false);
    listImageIds.mockReset().mockResolvedValue([]);
    deleteImage.mockClear();
    deleteDayImage.mockClear();
    localStorage.clear();
    useSpecialDaysStore.setState({ specialDays: [] });
  });

  it('commit pushes the array in cloud mode', () => {
    useSpecialDaysStore.setState({ specialDays: [{ id: 'a', date: '2026-01-01', cosmetic: '', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' }] });
    useSpecialDaysStore.getState().commit();
    expect(pushSpecialDays).toHaveBeenCalledTimes(1);
    expect((pushSpecialDays.mock.calls[0][0] as unknown[]).length).toBe(1);
  });

  it('hydrate merges per-day by updatedAt (newer wins, union of dates)', async () => {
    // local: day A old, day B only-local
    useSpecialDaysStore.setState({ specialDays: [
      { id: 'a', date: '2026-01-01', cosmetic: 'old', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', date: '2026-02-02', cosmetic: 'localonly', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
    ] });
    // cloud: day A newer, day C only-cloud
    pullSpecialDays.mockResolvedValueOnce([
      { id: 'a', date: '2026-01-01', cosmetic: 'new', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'c', date: '2026-03-03', cosmetic: 'cloudonly', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    await hydrateDayBackgroundsFromCloud();
    const days = useSpecialDaysStore.getState().specialDays;
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.cosmetic]));
    expect(byDate['2026-01-01']).toBe('new');       // cloud newer wins
    expect(byDate['2026-02-02']).toBe('localonly'); // local-only kept
    expect(byDate['2026-03-03']).toBe('cloudonly'); // cloud-only added
  });

  it('hydrate downloads upload images missing locally', async () => {
    hasImage.mockResolvedValue(false);
    downloadDayImage.mockResolvedValue(new Blob(['x'], { type: 'image/webp' }));
    pullSpecialDays.mockResolvedValueOnce([
      { id: 'a', date: '2026-01-01', cosmetic: '', animations: [], emoji: '', recurrence: 'none',
        image: { kind: 'upload', id: 'img1', w: 1, h: 1 }, updatedAt: '2026-06-01T00:00:00Z' },
    ]);
    await hydrateDayBackgroundsFromCloud();
    expect(downloadDayImage).toHaveBeenCalledWith('img1');
    expect(putImage).toHaveBeenCalledTimes(1);
  });

  it('empty cloud seeds from local', async () => {
    useSpecialDaysStore.setState({ specialDays: [
      { id: 'a', date: '2026-01-01', cosmetic: '', animations: [], emoji: '', recurrence: 'none', updatedAt: '2026-01-01T00:00:00Z' },
    ] });
    pullSpecialDays.mockResolvedValueOnce(null);
    await hydrateDayBackgroundsFromCloud();
    expect(pushSpecialDays).toHaveBeenCalledTimes(1);
  });

  it('does nothing in local mode', async () => {
    cloudOn = false;
    await hydrateDayBackgroundsFromCloud();
    expect(pullSpecialDays).not.toHaveBeenCalled();
  });
});
