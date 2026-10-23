import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ from }),
}));

import { fetchEntitlements, NO_ENTITLEMENTS } from './entitlements';

const session = { user: { id: 'user-1' } } as unknown as Session;

describe('fetchEntitlements', () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    from.mockClear();
    localStorage.clear();
  });

  it('returns all-false when there is no session', async () => {
    expect(await fetchEntitlements(null)).toEqual(NO_ENTITLEMENTS);
    expect(from).not.toHaveBeenCalled();
  });

  it('maps the profile row to entitlements', async () => {
    maybeSingle.mockResolvedValue({ data: { cosmetics_unlocked: true, cloud_active: false }, error: null });
    expect(await fetchEntitlements(session)).toEqual({ cosmeticsUnlocked: true, cloudActive: false });
    expect(from).toHaveBeenCalledWith('profiles');
  });

  it('returns all-false on error with no prior cache', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchEntitlements(session)).toEqual(NO_ENTITLEMENTS);
  });

  it('falls back to the last-known entitlements when the fetch fails (offline)', async () => {
    maybeSingle.mockResolvedValue({ data: { cosmetics_unlocked: true, cloud_active: true }, error: null });
    await fetchEntitlements(session); // seeds the cache
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    expect(await fetchEntitlements(session)).toEqual({ cosmeticsUnlocked: true, cloudActive: true });
  });

  it('a missing row is authoritative: clears the cache, no offline grace', async () => {
    maybeSingle.mockResolvedValue({ data: { cosmetics_unlocked: true, cloud_active: true }, error: null });
    await fetchEntitlements(session);
    maybeSingle.mockResolvedValue({ data: null, error: null }); // row gone
    expect(await fetchEntitlements(session)).toEqual(NO_ENTITLEMENTS);
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    expect(await fetchEntitlements(session)).toEqual(NO_ENTITLEMENTS); // cache was overwritten
  });

  it('the cache is per-user', async () => {
    maybeSingle.mockResolvedValue({ data: { cosmetics_unlocked: true, cloud_active: true }, error: null });
    await fetchEntitlements(session); // caches for user-1
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });
    const other = { user: { id: 'user-2' } } as unknown as Session;
    expect(await fetchEntitlements(other)).toEqual(NO_ENTITLEMENTS);
  });
});
