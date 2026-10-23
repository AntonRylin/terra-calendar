import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn(async (_path: string, _blob: Blob, _opts?: unknown) => ({ error: null as unknown }));
const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
const getPublicUrl = vi.fn((path: string) => ({
  data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/avatars/${path}` },
}));
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1' } } }));
const from = vi.fn(() => ({ upload, remove, getPublicUrl }));
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: { getUser }, storage: { from } }),
}));

import { uploadAvatar, deleteAvatar } from './cloudAvatar';

describe('cloudAvatar', () => {
  beforeEach(() => {
    upload.mockClear();
    remove.mockClear();
    getPublicUrl.mockClear();
    getUser.mockClear();
    from.mockClear();
  });

  it('uploadAvatar writes {uid}/avatar.webp and returns a cache-busted public URL', async () => {
    const url = await uploadAvatar(new Blob(['x'], { type: 'image/webp' }));
    expect(from).toHaveBeenCalledWith('avatars');
    expect(upload.mock.calls[0][0]).toBe('u1/avatar.webp');
    expect(url).toMatch(
      /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/avatars\/u1\/avatar\.webp\?v=\d+$/,
    );
  });

  it('uploadAvatar returns null when the upload fails', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'nope' } });
    expect(await uploadAvatar(new Blob(['x'], { type: 'image/webp' }))).toBeNull();
  });

  it('deleteAvatar removes {uid}/avatar.webp', async () => {
    await deleteAvatar();
    expect(remove).toHaveBeenCalledWith(['u1/avatar.webp']);
  });
});
