import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent } from '../core/types';
import { isTaskEvent } from '../core/tasks';
import { loadTasks, saveTasks } from './taskStore';

/**
 * Wraps a repository so dateless tasks persist locally when the underlying
 * backend can't sync them (CalDAV / local file). When the underlying repo
 * `handlesTasks` (Supabase), tasks pass straight through. Promotion falls out
 * for free: once a task gets a date it's no longer a task, so the next saveAll
 * routes it to the inner repo and drops it from the local store.
 */
export class TaskAwareRepository implements EventRepository {
  constructor(private readonly inner: EventRepository) {}

  async load(): Promise<LoadResult> {
    const result = await this.inner.load();
    if (this.inner.handlesTasks) return result;
    const tasks = await loadTasks();
    return { ...result, events: [...result.events, ...tasks] };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    if (this.inner.handlesTasks) {
      await this.inner.saveAll(events);
      return;
    }
    await saveTasks(events.filter(isTaskEvent));
    await this.inner.saveAll(events.filter((e) => !isTaskEvent(e)));
  }
}
