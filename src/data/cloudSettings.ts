import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const TABLE = 'user_settings';

/** Upsert the syncable settings blob to the signed-in user's row. Best-effort:
 *  local mirrors remain the source of truth, so failures are swallowed. */
export async function pushSettings(data: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    // ignore — settings are already saved locally
  }
}

/** The user's cloud settings blob, or null if none / unavailable. (RLS scopes
 *  the select to the user, so there is at most one row.) */
export async function pullSettings(): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('data').maybeSingle();
    if (error || !data) return null;
    return (data as { data: Record<string, unknown> | null }).data ?? null;
  } catch {
    return null;
  }
}
