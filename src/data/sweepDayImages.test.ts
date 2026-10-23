import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpecialDay } from '../app/specialDaysStore';

let cloudOn = false;
const listImageIds = vi.fn(async () => [] as string[]);
const deleteImage = vi.fn(async (_id: string) => {});
const deleteDayImage = vi.fn(async (_id: string) => {});

vi.mock('./createRepository', () => ({ isCloudMode: () => cloudOn }));
vi.mock('./cloudDayImages', () => ({ deleteDayImage: (id: string) => deleteDayImage(id) }));
vi.mock('./dayImageStore', () => ({
  listImageIds: () => listImageIds(),
  deleteImage: (id: string) => deleteImage(id),
}));

import { sweepUnreferencedImages } from './sweepDayImages';

function day(date: string, imageId?: string): SpecialDay {
  return {
    id: `sd-${date}`,
    date,
    cosmetic: '',
    animations: [],
    emoji: '',
    recurrence: 'none',
    image: imageId ? { kind: 'upload', id: imageId, w: 1, h: 1 } : undefined,
  };
}

describe('sweepUnreferencedImages', () => {
  beforeEach(() => {
    cloudOn = false;
    listImageIds.mockReset().mockResolvedValue([]);
    deleteImage.mockClear();
    deleteDayImage.mockClear();
  });

  it('deletes only the images no day references', async () => {
    listImageIds.mockResolvedValue(['keep', 'orphan-1', 'orphan-2']);
    const removed = await sweepUnreferencedImages([day('2026-01-01', 'keep')]);
    expect(removed).toBe(2);
    expect(deleteImage.mock.calls.map((c) => c[0]).sort()).toEqual(['orphan-1', 'orphan-2']);
  });

  it('keeps images referenced by url refs too, not just uploads', async () => {
    listImageIds.mockResolvedValue(['scene-dawn']);
    const withUrl: SpecialDay = {
      ...day('2026-01-01'),
      image: { kind: 'url', id: 'scene-dawn', src: 'https://x/y.png', w: 1, h: 1 },
    };
    expect(await sweepUnreferencedImages([withUrl])).toBe(0);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('removes everything when no day is styled', async () => {
    listImageIds.mockResolvedValue(['a', 'b']);
    expect(await sweepUnreferencedImages([])).toBe(2);
  });

  it('leaves the cloud bucket alone in local mode', async () => {
    listImageIds.mockResolvedValue(['orphan']);
    await sweepUnreferencedImages([]);
    expect(deleteImage).toHaveBeenCalledWith('orphan');
    expect(deleteDayImage).not.toHaveBeenCalled();
  });

  it('also drops the bucket object in cloud mode', async () => {
    cloudOn = true;
    listImageIds.mockResolvedValue(['orphan']);
    await sweepUnreferencedImages([]);
    expect(deleteDayImage).toHaveBeenCalledWith('orphan');
  });
});
