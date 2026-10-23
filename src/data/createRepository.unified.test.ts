import { describe, it, expect, vi, beforeEach } from 'vitest';

let configured = true;
let session: unknown = { user: { id: 'u1' } };
let cloudActive = true;
vi.mock('./supabaseClient', () => ({ isSupabaseConfigured: () => configured }));
vi.mock('../auth/authStore', () => ({ useAuthStore: { getState: () => ({ session }) } }));
vi.mock('../app/entitlementStore', () => ({ useEntitlementStore: { getState: () => ({ cloudActive }) } }));
// No Tauri global → buildCalDavStores returns [] (web path), so we test the
// local + Supabase composition deterministically.

import { createRepositoryAsync, isCloudMode } from './createRepository';
import { UnifiedRepository } from './sync/unifiedRepository';

describe('createRepositoryAsync — unified', () => {
  beforeEach(() => { configured = true; session = { user: { id: 'u1' } }; cloudActive = true; });

  it('returns a UnifiedRepository in cloud mode', async () => {
    expect(isCloudMode()).toBe(true);
    const repo = await createRepositoryAsync();
    expect(repo).toBeInstanceOf(UnifiedRepository);
    expect(repo.handlesTasks).toBe(true);
  });

  it('returns a UnifiedRepository in local mode too', async () => {
    cloudActive = false;
    const repo = await createRepositoryAsync();
    expect(repo).toBeInstanceOf(UnifiedRepository);
  });
});
