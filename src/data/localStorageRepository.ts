import type { CalendarEvent } from '../core/types';
import type { EventRepository, LoadResult } from './repository';
import { parseStore, serializeStore } from './storeFile';

export const STORAGE_KEY = 'open-calendar.store';
export const BACKUP_KEY = 'open-calendar.store.bak';

/** Browser adapter — used in `npm run dev` outside the Tauri shell. */
export class LocalStorageRepository implements EventRepository {
  async load(): Promise<LoadResult> {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) return { events: [] };
    const parsed = parseStore(text);
    if (parsed.ok) return { events: parsed.events };
    localStorage.setItem(BACKUP_KEY, text);
    localStorage.removeItem(STORAGE_KEY);
    return {
      events: [],
      warning: `Stored data was unreadable (${parsed.error}). A backup was kept; starting fresh.`,
    };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    localStorage.setItem(STORAGE_KEY, serializeStore(events));
  }
}
