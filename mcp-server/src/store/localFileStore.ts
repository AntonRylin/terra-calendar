import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { CalendarEvent } from '../core/types.js';
import type { CalendarStore } from './store.js';

/** Resolve the events.json path used by the Tauri desktop app. */
function getStorePath(): string {
  if (process.env.OPEN_CALENDAR_STORE_PATH) {
    return process.env.OPEN_CALENDAR_STORE_PATH;
  }

  const home = os.homedir();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

    const candidates = [
      // Sandboxed location under Claude Desktop
      path.join(localAppData, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Local', 'com.open-calendar.app', 'events.json'),
      // Default Roaming AppData
      path.join(appData, 'com.open-calendar.app', 'events.json'),
      // Default Local AppData
      path.join(localAppData, 'com.open-calendar.app', 'events.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Default fallback
    return candidates[1];
  } else if (process.platform === 'darwin') {
    const candidates = [
      path.join(home, 'Library', 'Application Support', 'com.open-calendar.app', 'events.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  } else {
    // Linux/Unix
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    return path.join(xdgData, 'com.open-calendar.app', 'events.json');
  }
}

/**
 * Local edition store: events live in the desktop app's `events.json`. Each
 * mutation reads the current file, applies the change and writes the whole list
 * back — matching the desktop app's own persistence model.
 */
export class LocalFileStore implements CalendarStore {
  private readonly dbPath: string;

  constructor() {
    this.dbPath = getStorePath();
  }

  async init(): Promise<void> {
    // Nothing to authenticate; the path is resolved lazily on first read.
  }

  describe(): string {
    return `Database: ${this.dbPath}`;
  }

  async list(): Promise<CalendarEvent[]> {
    return this.read();
  }

  async create(event: CalendarEvent): Promise<void> {
    const events = this.read();
    events.push(event);
    this.write(events);
  }

  async update(event: CalendarEvent): Promise<void> {
    const events = this.read();
    const index = events.findIndex((e) => e.id === event.id);
    if (index === -1) {
      throw new Error(`Event with ID ${event.id} not found.`);
    }
    events[index] = event;
    this.write(events);
  }

  async remove(id: string): Promise<boolean> {
    const events = this.read();
    const next = events.filter((e) => e.id !== id);
    if (next.length === events.length) {
      return false;
    }
    this.write(next);
    return true;
  }

  private read(): CalendarEvent[] {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return [];
      }
      const content = fs.readFileSync(this.dbPath, 'utf-8');
      const data = JSON.parse(content);
      if (data && typeof data === 'object' && Array.isArray(data.events)) {
        return data.events as CalendarEvent[];
      }
      return [];
    } catch (error: any) {
      console.error(`Error reading database at ${this.dbPath}:`, error);
      return [];
    }
  }

  private write(events: CalendarEvent[]): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      version: 1,
      events,
    };
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
