import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { baseMime, extForMime, MEDIA_EXTENSIONS } from '../core/media';

const BUCKET = 'day-backgrounds';

/** The signed-in user's folder in the bucket, or null if not available. */
async function folderFor(): Promise<string | null> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return user.id;
}

/** The object path for a media id. The extension follows the stored mime so the
 *  bucket's per-type rules apply; refs with no mime are WebP stills, which is
 *  how every object written before motion backgrounds was named. */
async function pathFor(id: string, mime?: string): Promise<string | null> {
  const folder = await folderFor();
  return folder ? `${folder}/${id}.${extForMime(mime)}` : null;
}

/** Upload day-background bytes to the user's bucket folder. Best-effort (the
 *  local IndexedDB copy is the source of truth), so failures are swallowed. */
export async function uploadDayImage(id: string, blob: Blob, mime?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const type = baseMime(mime ?? blob.type) || 'image/webp';
    const path = await pathFor(id, type);
    if (!path) return;
    await getSupabase().storage.from(BUCKET).upload(path, blob, {
      contentType: type,
      upsert: true,
    });
  } catch {
    // ignore — media is already stored locally
  }
}

/** Download day-background bytes from the bucket, or null if missing. */
export async function downloadDayImage(id: string, mime?: string): Promise<Blob | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const path = await pathFor(id, mime);
    if (!path) return null;
    const { data, error } = await getSupabase().storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/** Delete a day background from the bucket. Best-effort, and extension-blind:
 *  the orphan sweep only knows ids, so every extension the app can write is
 *  removed at once (missing objects are a no-op). */
export async function deleteDayImage(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const folder = await folderFor();
    if (!folder) return;
    await getSupabase().storage
      .from(BUCKET)
      .remove(MEDIA_EXTENSIONS.map((ext) => `${folder}/${id}.${ext}`));
  } catch {
    // ignore
  }
}
