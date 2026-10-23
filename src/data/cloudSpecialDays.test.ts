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

import { pushSpecialDays, pullSpecialDays } from './cloudSpecialDays';

describe('cloudSpecialDays', () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
    getUser.mockClear();
  });

  it('pushSpecialDays upserts the array under the user id', async () => {
    await pushSpecialDays([{ id: 'a', date: '2026-01-01' }]);
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.data).toEqual([{ id: 'a', date: '2026-01-01' }]);
    expect(typeof row.updated_at).toBe('string');
  });

  it('pullSpecialDays returns the row data array, or null when none', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { data: [{ id: 'a' }] }, error: null });
    expect(await pullSpecialDays()).toEqual([{ id: 'a' }]);
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await pullSpecialDays()).toBeNull();
  });
});
