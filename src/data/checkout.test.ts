import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: { getSession }, functions: { invoke } }),
}));

import { startCheckout } from './checkout';

describe('startCheckout', () => {
  beforeEach(() => {
    invoke.mockReset();
    getSession.mockReset();
    // jsdom: make location.href assignable without navigating.
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('errors when not signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const result = await startCheckout('cosmetics');
    expect(result.error).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes create-checkout with the kind and redirects to the returned url', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/abc' }, error: null });
    const result = await startCheckout('cloud');
    expect(result.error).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('create-checkout', { body: { kind: 'cloud' } });
    expect(window.location.href).toBe('https://checkout.stripe.com/abc');
  });

  it('surfaces a function error', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    invoke.mockResolvedValue({ data: null, error: { message: 'no price configured' } });
    const result = await startCheckout('cosmetics');
    expect(result.error).toContain('no price configured');
  });
});
