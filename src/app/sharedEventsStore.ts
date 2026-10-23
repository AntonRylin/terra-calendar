import { create } from 'zustand';
import type { CalendarEvent } from '../core/types';
import { fetchSharedEvents, updateSharedEvent, type SharedEventPatch } from '../data/sharing/sharesApi';

interface SharedEventsState {
  /** Events other people share with this user. Read-only unless the share
   *  grants the editor role. */
  events: CalendarEvent[];
  loading: boolean;
  /** Set when the last refresh failed, so the UI can say the shared calendars
   *  are stale rather than silently showing nothing. */
  error: string | null;
  refresh(): Promise<void>;
  /** Apply an editor's change to the owner's calendar, optimistically. */
  edit(id: string, patch: SharedEventPatch): Promise<boolean>;
  clear(): void;
}

/**
 * Events received from other people's shares.
 *
 * A SIBLING of the calendar store, never part of it and never a sync store. The
 * sync engine writes every store it knows about to the local file and to the
 * user's connected iCloud/Google accounts; routing someone else's calendar
 * through it would copy their events into the user's own accounts, and
 * delete-wins would let a viewer delete the owner's events for everyone.
 *
 * The two sets are merged for display only — see `useVisibleEvents`.
 */
export const useSharedEventsStore = create<SharedEventsState>((set, get) => ({
  events: [],
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true });
    try {
      const events = await fetchSharedEvents();
      set({ events, loading: false, error: null });
    } catch (err) {
      // Keep the last good set: a failed refresh should leave the family
      // calendar on screen, not blank it.
      set({ loading: false, error: (err as Error).message });
    }
  },

  async edit(id, patch) {
    const before = get().events;
    const now = new Date().toISOString();
    set({
      events: before.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now } : e)),
    });
    try {
      await updateSharedEvent(id, patch);
      return true;
    } catch (err) {
      set({ events: before, error: (err as Error).message });
      return false;
    }
  },

  clear() {
    set({ events: [], error: null });
  },
}));
