import { create } from 'zustand';
import type { Share, ShareDetail, ShareRole, ShareScopeMode } from '../data/sharing/types';
import {
  createShare,
  deleteShare,
  listOwnedShares,
  updateShare,
} from '../data/sharing/sharesApi';

interface ShareState {
  /** Shares this user owns (the ones they hand out). */
  shares: Share[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  create(input: {
    name: string;
    scopeMode: ShareScopeMode;
    categories: string[];
    detail: ShareDetail;
    role: ShareRole;
  }): Promise<Share | null>;
  update(id: string, patch: Partial<Share>): Promise<void>;
  revoke(id: string): Promise<void>;
  /** Drop a renamed category from every share that listed it, so a rename can
   *  never silently stop sharing (or start sharing the wrong events). */
  renameCategory(oldName: string, newName: string): Promise<void>;
  clear(): void;
}

export const useShareStore = create<ShareState>((set, get) => ({
  shares: [],
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true });
    try {
      set({ shares: await listOwnedShares(), loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  async create(input) {
    try {
      const share = await createShare(input);
      set({ shares: [share, ...get().shares], error: null });
      return share;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  async update(id, patch) {
    const before = get().shares;
    set({ shares: before.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    try {
      await updateShare(id, patch);
    } catch (err) {
      set({ shares: before, error: (err as Error).message });
    }
  },

  async revoke(id) {
    const before = get().shares;
    set({ shares: before.filter((s) => s.id !== id) });
    try {
      await deleteShare(id);
    } catch (err) {
      set({ shares: before, error: (err as Error).message });
    }
  },

  async renameCategory(oldName, newName) {
    // Categories are matched by NAME in a share's scope (`event.type` is a bare
    // string). Without this, renaming a category leaves the share pointing at a
    // name nothing carries any more — it silently stops sharing, and starts
    // sharing the wrong events if that name is ever reused.
    const affected = get().shares.filter(
      (s) => s.scopeMode === 'categories' && s.categories.includes(oldName),
    );
    for (const share of affected) {
      const categories = share.categories.map((c) => (c === oldName ? newName : c));
      await get().update(share.id, { categories });
    }
  },

  clear() {
    set({ shares: [], error: null });
  },
}));
