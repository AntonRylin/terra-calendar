import { describe, it, expect, vi, beforeEach } from 'vitest';

let configured = true;
let session: unknown = { user: { id: 'u1' } };
let cloudActive = true;
vi.mock('./supabaseClient', () => ({ isSupabaseConfigured: () => configured }));
vi.mock('../auth/authStore', () => ({ useAuthStore: { getState: () => ({ session }) } }));
vi.mock('../app/entitlementStore', () => ({ useEntitlementStore: { getState: () => ({ cloudActive }) } }));

import { isCloudMode } from './createRepository';

describe('isCloudMode', () => {
  beforeEach(() => { configured = true; session = { user: { id: 'u1' } }; cloudActive = true; });

  it('is true only when configured AND signed in AND cloud_active', () => {
    expect(isCloudMode()).toBe(true);
  });
  it('is false when not configured', () => { configured = false; expect(isCloudMode()).toBe(false); });
  it('is false when signed out', () => { session = null; expect(isCloudMode()).toBe(false); });
  it('is false without an active subscription', () => { cloudActive = false; expect(isCloudMode()).toBe(false); });
});
