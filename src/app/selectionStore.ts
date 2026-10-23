import { create } from 'zustand';

/**
 * Cross-surface multi-select for bulk actions (delete). Lives outside any single
 * panel so the same selection spans the Upcoming list and the month grid.
 * Selection is keyed by event id (the definition), so every occurrence of a
 * recurring event shows selected together.
 */
interface SelectionState {
  active: boolean;
  /**
   * How the active selection was started:
   * - 'tap'   — the "Select events" toggle button; a plain click toggles cards.
   * - 'quick' — shift+click; a plain click clears the selection and navigates.
   */
  source: 'tap' | 'quick' | null;
  selected: Set<string>;
  enter(): void;
  enterQuick(): void;
  exit(): void;
  toggle(id: string): void;
  selectMany(ids: string[]): void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  active: false,
  source: null,
  selected: new Set(),

  enter: () => set({ active: true, source: 'tap', selected: new Set() }),
  enterQuick: () => set({ active: true, source: 'quick', selected: new Set() }),
  exit: () => set({ active: false, source: null, selected: new Set() }),

  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),

  selectMany: (ids) => set({ selected: new Set(ids) }),
}));
