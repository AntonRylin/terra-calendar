import type { CalendarEvent } from '../core/types';
import type { EventRepository, LoadResult } from './repository';

export class MemoryRepository implements EventRepository {
  constructor(private events: CalendarEvent[] = []) {}

  async load(): Promise<LoadResult> {
    return { events: [...this.events] };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    this.events = [...events];
  }
}
