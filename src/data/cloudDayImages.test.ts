import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn(async (_path: string, _blob: Blob, _opts?: unknown) => ({ error: null }));
const download = vi.fn(async (_path: string) => ({ data: null as Blob | null, error: null as unknown }));
const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1' } } }));
const from = vi.fn(() => ({ upload, download, remove }));
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: { getUser }, storage: { from } }),
}));

import { uploadDayImage, downloadDayImage, deleteDayImage } from './cloudDayImages';

describe('cloudDayImages', () => {
  beforeEach(() => {
    upload.mockClear();
    download.mockClear();
    remove.mockClear();
    getUser.mockClear();
    from.mockClear();
  });

  it('uploadDayImage writes to {uid}/{id}.webp in the day-backgrounds bucket', async () => {
    await uploadDayImage('img1', new Blob(['x'], { type: 'image/webp' }));
    expect(from).toHaveBeenCalledWith('day-backgrounds');
    expect(upload.mock.calls[0][0]).toBe('u1/img1.webp');
  });

  it('names a clip after its own type, and sends it as the content type', async () => {
    await uploadDayImage('clip1', new Blob(['x'], { type: 'video/webm' }), 'video/webm;codecs=vp9');
    expect(upload.mock.calls[0][0]).toBe('u1/clip1.webm');
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'video/webm', upsert: true });
  });

  it('downloadDayImage returns the blob, or null when absent', async () => {
    const blob = new Blob(['y'], { type: 'image/webp' });
    download.mockResolvedValueOnce({ data: blob, error: null });
    expect(await downloadDayImage('img1')).toBe(blob);
    download.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    expect(await downloadDayImage('img1')).toBeNull();
  });

  it('downloadDayImage looks under the ref mime’s extension', async () => {
    await downloadDayImage('clip1', 'video/mp4');
    expect(download.mock.calls[0][0]).toBe('u1/clip1.mp4');
  });

  it('deleteDayImage removes every extension an id could have been stored as', async () => {
    // The orphan sweep works from ids alone and has no mime to go on, so a
    // clip left behind by an undone edit has to be reachable without one.
    await deleteDayImage('img1');
    expect(remove).toHaveBeenCalledWith(['u1/img1.webp', 'u1/img1.gif', 'u1/img1.webm', 'u1/img1.mp4']);
  });
});
