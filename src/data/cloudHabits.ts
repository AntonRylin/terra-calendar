import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const TABLE = 'user_habit_entries';

/** Upsert the whole habit-entries object to the signed-in user's row.
 *  Best-effort: localStorage remains the source of truth, so failures are
 *  swallowed. */
export async function pushHabitEntries(data: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from(TABLE)
      .upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {
    // ignore — habit entries are already saved locally
  }
}

/** The user's cloud habit-entries object, or null if none / unavailable. */
export async function pullHabitEntries(): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('data').maybeSingle();
    if (error || !data) return null;
    const obj = (data as { data: unknown }).data;
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
