import { useCalendarStore } from '../app/store';
import { useConnectionStore } from '../app/connectionStore';

/** The exact phrase the user must type to confirm a full wipe. */
export const DELETE_ALL_PHRASE = 'DELETE ALL MY DATA';

/** What happens to events already synced to connected calendars (Apple/Google). */
export type DeleteAllMode =
  /** Delete events from the connected calendars too, then disconnect and wipe. */
  | 'everywhere'
  /** Disconnect first so the connected calendars keep their events, then wipe locally. */
  | 'local-only';

/** localStorage prefixes that hold this app's data. Auth session keys are
 *  deliberately spared — deleting your data is not deleting your account. */
const LOCAL_KEY_PREFIXES = ['open-calendar', 'upcoming_'];

/** Every localStorage key that belongs to the app (snapshot — safe to remove while iterating over it). */
export function appDataKeys(storage: Pick<Storage, 'length' | 'key'>): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && LOCAL_KEY_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
  }
  return keys;
}

/** Disconnect Apple + Google, forgetting stored credentials/tokens. */
export async function disconnectAllCalendars(): Promise<void> {
  const conn = useConnectionStore.getState();
  if (conn.caldav?.username) {
    try {
      const { credentials } = await import('./caldav/credentials');
      await credentials.remove(conn.caldav.username);
    } catch {
      // Keychain unavailable (web build) — clearing the config below still disconnects.
    }
  }
  if (conn.google?.username) {
    try {
      const { disconnectGoogle } = await import('./google/connect');
      await disconnectGoogle(conn.google.username);
    } catch {
      // Token revocation is best-effort; the config removal is what disconnects.
    }
  }
  conn.disconnectCalDav();
  conn.disconnectGoogle();
}

/** Drop the IndexedDB database holding day-background images. */
function deleteImageDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('open-calendar');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    // An open connection blocks the drop; the reload that follows closes it,
    // after which the browser completes the pending deletion.
    req.onblocked = () => resolve();
  });
}

/**
 * Delete all app data, then reload into a fresh state.
 *
 * `everywhere` first deletes every event through the repository — that fans the
 * deletions out to each connected calendar copy (and, in cloud mode, the cloud)
 * — before disconnecting. `local-only` disconnects first, so the calendars keep
 * everything already synced to them, and only this device is wiped.
 */
export async function deleteAllData(
  mode: DeleteAllMode,
  reload: () => void = () => location.reload(),
): Promise<void> {
  if (mode === 'everywhere') {
    const store = useCalendarStore.getState();
    const ids = store.events.map((e) => e.id);
    if (ids.length) await store.deleteEvents(ids);
  }
  await disconnectAllCalendars();
  await deleteImageDb();
  for (const k of appDataKeys(localStorage)) localStorage.removeItem(k);
  reload();
}
