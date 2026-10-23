/**
 * Durable persistence for app settings (theme, minimap, and — importantly —
 * category cosmetics) in the desktop edition.
 *
 * Settings normally live in WebView `localStorage`, which is instant and
 * synchronous but gets wiped by clear-cache, a fresh WebView profile, or a
 * reinstall that resets the WebView data dir. Events never had this problem
 * because they're written to `events.json` on disk (see JsonFileRepository).
 * This module gives settings the same durable home — a `settings.json` next to
 * `events.json` in the app-data directory — so category gradients/cosmetics
 * survive across reinstalls instead of resetting to defaults.
 *
 * On the web build (no Tauri) every function is a no-op and `localStorage`
 * remains the only store. The Tauri FS plugin is imported lazily inside the
 * guard so the web bundle never pulls it in.
 */

const FILE = 'settings.json';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Whether a durable on-disk settings file is available (desktop only). */
export function settingsFileAvailable(): boolean {
  return isTauri();
}

/** The raw JSON text of the on-disk settings file, or null if absent/unavailable. */
export async function readSettingsFile(): Promise<string | null> {
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

/** Best-effort mirror of the settings JSON to disk; no-op off desktop. */
export async function writeSettingsFile(json: string): Promise<void> {
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
