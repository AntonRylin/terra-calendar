import { describe, it, expect, vi } from 'vitest';

// Force the unconfigured path regardless of the developer's .env.local (Vitest
// loads it, so real VITE_SUPABASE_* values would otherwise leak into the test):
// isSupabaseConfigured() is false and init() must not touch getSupabase()
// (which throws when unconfigured).
vi.mock('../data/supabaseClient', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => {
    throw new Error('Supabase is not configured.');
  },
}));

import { useAuthStore } from './authStore';

describe('authStore', () => {
  it('init() is a safe no-op when Supabase is not configured', () => {
    const unsubscribe = useAuthStore.getState().init();
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().session).toBeNull();
    expect(typeof unsubscribe).toBe('function');
    // Calling the returned unsubscribe must not throw.
    expect(() => unsubscribe()).not.toThrow();
  });
});
