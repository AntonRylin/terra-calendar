/**
 * Save a text file to a location the user picks.
 *
 * Three routes, best first:
 *   1. Desktop (Tauri) — the native "Save as" dialog via the `save_text_file`
 *      command, which writes to the chosen path itself.
 *   2. Browsers with the File System Access API (Chrome/Edge) —
 *      `showSaveFilePicker`, same "choose where" experience.
 *   3. Anything else — a plain download, which lands wherever the browser puts
 *      downloads. Last resort only: not knowing where the file went is exactly
 *      the problem this module exists to fix.
 */

export type SaveTextFileResult =
  /** Written. `path` is set when we know it (desktop), the file name otherwise. */
  | { status: 'saved'; path?: string }
  /** The user dismissed the picker — not an error, and not worth a toast. */
  | { status: 'cancelled' }
  /** No picker available; the file went to the browser's download folder. */
  | { status: 'downloaded'; name: string };

export interface SaveTextFileOptions {
  /** Suggested file name, extension included. */
  defaultName: string;
  contents: string;
  /** MIME type for the download fallback / picker filter. */
  mimeType?: string;
  /** Human-readable name for the file type in the picker ("JSON file"). */
  typeLabel?: string;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1) : 'txt';
}

/** True for the "user closed the picker" errors, which must not surface as failures. */
function isAbort(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError');
}

type SaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<{
  name: string;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}>;

export async function saveTextFile(opts: SaveTextFileOptions): Promise<SaveTextFileResult> {
  const { defaultName, contents } = opts;
  const mimeType = opts.mimeType ?? 'application/json';
  const typeLabel = opts.typeLabel ?? 'JSON file';

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string | null>('save_text_file', {
        defaultName,
        contents,
        filterName: typeLabel,
        extension: extensionOf(defaultName),
      });
      return path ? { status: 'saved', path } : { status: 'cancelled' };
    } catch {
      // Older desktop build without the command — fall through to the download.
    }
  }

  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: defaultName,
        types: [{ description: typeLabel, accept: { [mimeType]: [`.${extensionOf(defaultName)}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return { status: 'saved', path: handle.name };
    } catch (e) {
      if (isAbort(e)) return { status: 'cancelled' };
      // Picker blocked (sandboxed frame, insecure context) — fall through.
    }
  }

  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { status: 'downloaded', name: defaultName };
}
