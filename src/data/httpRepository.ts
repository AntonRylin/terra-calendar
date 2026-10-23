import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent } from '../core/types';
import { parseStore, serializeStore } from './storeFile';

export const STORAGE_KEY = 'open-calendar.store';

export class HttpRepository implements EventRepository {
  private url = 'http://localhost:3001/events';

  async load(): Promise<LoadResult> {
    try {
      const res = await fetch(this.url);
      if (!res.ok) throw new Error('Failed to load events');
      const text = await res.text();
      const parsed = parseStore(text);
      if (parsed.ok) return { events: parsed.events };
      return { events: [], warning: `Failed to parse events: ${parsed.error}` };
    } catch (err) {
      console.warn('Sync server not running. Make sure to run "npm run sync" in a separate terminal. Falling back to local storage...', err);
      // Fallback to local storage if sync server is not running
      const text = localStorage.getItem(STORAGE_KEY);
      if (text === null) return { events: [] };
      const parsed = parseStore(text);
      if (parsed.ok) return { events: parsed.events };
      return { events: [] };
    }
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeStore(events),
      });
      if (!res.ok) throw new Error('Failed to save events');
    } catch (err) {
      console.error('Failed to sync events to local server, saving to local storage instead:', err);
      // Fallback to local storage
      localStorage.setItem(STORAGE_KEY, serializeStore(events));
    }
  }
}
