import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const TABLE = 'user_special_days';

/** Upsert the whole special-days array to the signed-in user's row. Best-effort:
 *  localStorage remains the source of truth, so failures are swallowed. */
export async function pushSpecialDays(data: unknown[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    // ignore — special days are already saved locally
  }
}

/** The user's cloud special-days array, or null if none / unavailable. */
export async function pullSpecialDays(): Promise<unknown[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('data').maybeSingle();
    if (error || !data) return null;
    const arr = (data as { data: unknown }).data;
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
