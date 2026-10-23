import { create } from 'zustand';
import type { CalendarEvent } from '../core/types';

/** An event picked up by "Copy", waiting for a slot to be pasted into. Held in
 *  memory only: copying is a gesture within one sitting, not something to
 *  restore days later. */
export interface CopiedEvent {
  event: CalendarEvent;
  /** The occurrence that was copied — a recurring event pastes as a one-off. */
  occurrenceDate: string;
}

interface ClipboardState {
  copied: CopiedEvent | null;
  copy(event: CalendarEvent, occurrenceDate: string): void;
  clear(): void;
}

export const useEventClipboard = create<ClipboardState>((set) => ({
  copied: null,
  copy: (event, occurrenceDate) => set({ copied: { event, occurrenceDate } }),
  clear: () => set({ copied: null }),
}));
