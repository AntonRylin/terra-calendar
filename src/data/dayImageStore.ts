const DB_NAME = 'open-calendar';
const STORE = 'day-images';
const urlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** A day background's bytes. The blob is a WebP still, a GIF, or a short muted
 *  video clip — its own `type` says which, and the day's ref records it too. */
export interface StoredImage { blob: Blob; w: number; h: number }

/** Store a media blob under `id` (or a fresh one); returns the ref to persist on
 *  the day. Passing an explicit id is used when restoring a cloud image. */
export async function putImage(blob: Blob, w: number, h: number, id: string = crypto.randomUUID()): Promise<{ id: string; w: number; h: number }> {
  await tx('readwrite', (s) => s.put({ blob, w, h } satisfies StoredImage, id));
  return { id, w, h };
}

/** A cached object URL for an image id, or null if it isn't stored. */
export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = (await tx<StoredImage | undefined>('readonly', (s) => s.get(id))) ?? null;
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export async function hasImage(id: string): Promise<boolean> {
  const count = await tx<number>('readonly', (s) => s.count(id));
  return count > 0;
}

export async function deleteImage(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
  await tx('readwrite', (s) => s.delete(id));
}

/** Every stored image id. */
export async function listImageIds(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  return keys.filter((k): k is string => typeof k === 'string');
}
