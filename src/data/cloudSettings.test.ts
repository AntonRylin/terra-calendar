import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn(async (_row: Record<string, unknown>, _opts?: unknown) => ({ error: null }));
const maybeSingle = vi.fn();
const getUser = vi.fn(async () => ({ data: { user: { id: 'u1' } } }));
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getUser },
    from: () => ({ upsert, select: () => ({ maybeSingle }) }),
  }),
}));

import { pushSettings, pullSettings } from './cloudSettings';

describe('cloudSettings', () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
    getUser.mockClear();
  });

  it('pushSettings upserts the blob under the user id', async () => {
    await pushSettings({ theme: 'dark' });
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.data).toEqual({ theme: 'dark' });
    expect(typeof row.updated_at).toBe('string');
  });

  it('pullSettings returns the row data, or null when none', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { data: { theme: 'dark' } }, error: null });
    expect(await pullSettings()).toEqual({ theme: 'dark' });
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await pullSettings()).toBeNull();
  });
});
