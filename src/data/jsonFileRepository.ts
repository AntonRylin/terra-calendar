import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type { CalendarEvent } from '../core/types';
import type { EventRepository, LoadResult } from './repository';
import { parseStore, serializeStore } from './storeFile';

const FILE = 'events.json';
const BACKUP = 'events.json.bak';
const FS_OPTS = { baseDir: BaseDirectory.AppData };

/** Desktop adapter: a human-readable JSON file in the app-data directory. */
export class JsonFileRepository implements EventRepository {
  async load(): Promise<LoadResult> {
    if (!(await exists(FILE, FS_OPTS))) return { events: [] };
    const text = await readTextFile(FILE, FS_OPTS);
    const parsed = parseStore(text);
    if (parsed.ok) return { events: parsed.events };
    await writeTextFile(BACKUP, text, FS_OPTS);
    return {
      events: [],
      warning: `events.json was unreadable (${parsed.error}). A backup was saved as events.json.bak; starting fresh.`,
    };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    if (!(await exists('', FS_OPTS))) {
      await mkdir('', { ...FS_OPTS, recursive: true });
    }
    await writeTextFile(FILE, serializeStore(events), FS_OPTS);
  }
}
