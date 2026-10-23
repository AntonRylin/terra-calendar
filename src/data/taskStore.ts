import type { CalendarEvent } from '../core/types';

// Local-only persistence for dateless tasks. On desktop, a tasks.json next to
// events.json in the app-data dir; on the web build, localStorage. Used by
// TaskAwareRepository when the active backend can't sync tasks (CalDAV/local).
const FILE = 'tasks.json';
const LS_KEY = 'open-calendar.tasks';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function loadTasks(): Promise<CalendarEvent[]> {
  if (isTauri()) {
    try {
      const { BaseDirectory, exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      const opts = { baseDir: BaseDirectory.AppData };
      if (!(await exists(FILE, opts))) return [];
      const parsed = JSON.parse(await readTextFile(FILE, opts));
      return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
    } catch {
      return [];
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: CalendarEvent[]): Promise<void> {
  const json = JSON.stringify(tasks);
  if (isTauri()) {
    try {
      const { BaseDirectory, exists, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
      const opts = { baseDir: BaseDirectory.AppData };
      if (!(await exists('', opts))) await mkdir('', { ...opts, recursive: true });
      await writeTextFile(FILE, json, opts);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    // ignore — best effort
  }
}
