import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchEntitlements = vi.fn();
vi.mock('../data/entitlements', () => ({
  NO_ENTITLEMENTS: { cosmeticsUnlocked: false, cloudActive: false },
  fetchEntitlements: (s: unknown) => fetchEntitlements(s),
}));
vi.mock('../auth/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { user: { id: 'u1' } } }) },
}));

import { useEntitlementStore } from './entitlementStore';

describe('entitlementStore', () => {
  beforeEach(() => {
    fetchEntitlements.mockReset();
    useEntitlementStore.setState({ cosmeticsUnlocked: false, cloudActive: false, loaded: false });
  });

  it('defaults to all-false and not loaded', () => {
    const s = useEntitlementStore.getState();
    expect(s.cosmeticsUnlocked).toBe(false);
    expect(s.cloudActive).toBe(false);
    expect(s.loaded).toBe(false);
  });

  it('refresh() pulls entitlements for the current session and marks loaded', async () => {
    fetchEntitlements.mockResolvedValue({ cosmeticsUnlocked: true, cloudActive: true });
    await useEntitlementStore.getState().refresh();
    const s = useEntitlementStore.getState();
    expect(s.cosmeticsUnlocked).toBe(true);
    expect(s.cloudActive).toBe(true);
    expect(s.loaded).toBe(true);
  });
});
