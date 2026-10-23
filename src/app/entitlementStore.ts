import { create } from 'zustand';
import { fetchEntitlements, NO_ENTITLEMENTS, type Entitlements } from '../data/entitlements';
import { useAuthStore } from '../auth/authStore';

interface EntitlementState extends Entitlements {
  /** True once a fetch has resolved at least once (so UI can tell unknown from false). */
  loaded: boolean;
  /** Re-fetch entitlements for the current auth session. */
  refresh(): Promise<void>;
}

export const useEntitlementStore = create<EntitlementState>((set) => ({
  ...NO_ENTITLEMENTS,
  loaded: false,
  async refresh() {
    const session = useAuthStore.getState().session;
    const ent = await fetchEntitlements(session);
    set({ ...ent, loaded: true });
  },
}));
