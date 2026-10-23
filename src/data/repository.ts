import type { CalendarEvent } from '../core/types';

export interface LoadResult {
  events: CalendarEvent[];
  /** Set when stored data was corrupt: a backup was made and we started fresh. */
  warning?: string;
}

/**
 * The persistence boundary. The store holds canonical state in memory and
 * persists the full list on every change — simple and plenty fast for a
 * personal calendar. Future adapters (SQLite, Google sync) implement this
 * same interface without touching any UI code.
 */
export interface EventRepository {
  load(): Promise<LoadResult>;
  saveAll(events: CalendarEvent[]): Promise<void>;
  /** True if this backend can persist dateless tasks itself (Supabase). When
   *  false/absent (CalDAV, local JSON file), tasks are kept in a local store. */
  handlesTasks?: boolean;
}
