import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** True when both Supabase env vars are present at build time. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/**
 * Lazily-created singleton Supabase client. Throws if the env vars are missing,
 * so call sites must guard with `isSupabaseConfigured()` (the backend selector
 * in `createRepository` already does).
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      );
    }
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
