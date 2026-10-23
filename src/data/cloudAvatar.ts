import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const BUCKET = 'avatars';
/** One object per user, replaced in place — the identity URL is stored in the
 *  auth user's metadata, so a fixed name keeps the folder tidy. */
const FILE = 'avatar.webp';

/** The signed-in user's avatar object path, or null if not available. */
async function ownPath(): Promise<string | null> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser();
  return user ? `${user.id}/${FILE}` : null;
}

/**
 * Upload the WebP avatar blob to the user's folder and return its public URL,
 * cache-busted so a replacement is picked up immediately (the object name is
 * stable, so the URL would otherwise be cached). Returns null when unconfigured,
 * signed out, or on failure — the caller keeps the local data-URL mirror.
 */
export async function uploadAvatar(blob: Blob): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const path = await ownPath();
    if (!path) return null;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/webp', upsert: true });
    if (error) return null;
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return `${publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}

/** Decode a WebP data URL and upload it as the user's avatar (used when a local
 *  profile's picture is migrated to the cloud on first sign-in). */
export async function uploadAvatarFromDataUrl(dataUrl: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return await uploadAvatar(blob);
  } catch {
    return null;
  }
}

/** Delete the user's avatar object. Best-effort. */
export async function deleteAvatar(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const path = await ownPath();
    if (!path) return;
    await getSupabase().storage.from(BUCKET).remove([path]);
  } catch {
    // ignore — metadata is cleared regardless
  }
}
