/**
 * Durable persistence for the local user profile (name + avatar) in the desktop
 * edition — a sibling of {@link ./settingsFile}.
 *
 * The profile normally lives in WebView `localStorage`, which is instant but gets
 * wiped by clear-cache, a fresh WebView profile, or a reinstall. This module gives
 * it the same durable home as settings and events: a `profile.json` in the
 * app-data directory, so a chosen name and avatar survive across reinstalls.
 *
 * On the web build (no Tauri) every function is a no-op and `localStorage` remains
 * the only store. The Tauri FS plugin is imported lazily inside the guard so the
 * web bundle never pulls it in.
 */

const FILE = 'profile.json';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Whether a durable on-disk profile file is available (desktop only). */
export function profileFileAvailable(): boolean {
  return isTauri();
}

/** The raw JSON text of the on-disk profile file, or null if absent/unavailable. */
export async function readProfileFile(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { BaseDirectory, exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: BaseDirectory.AppData };
    if (!(await exists(FILE, opts))) return null;
    return await readTextFile(FILE, opts);
  } catch {
    // Unreadable/permission issue → fall back to localStorage silently.
    return null;
  }
}

/** Best-effort mirror of the profile JSON to disk; no-op off desktop. */
export async function writeProfileFile(json: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { BaseDirectory, exists, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: BaseDirectory.AppData };
    if (!(await exists('', opts))) await mkdir('', { ...opts, recursive: true });
    await writeTextFile(FILE, json, opts);
  } catch {
    // localStorage remains the working copy; the disk mirror is best-effort.
  }
}
