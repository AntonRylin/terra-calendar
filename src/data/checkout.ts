import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export type CheckoutKind = 'cosmetics' | 'cloud';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Start a Stripe Checkout for a purchase. Calls the `create-checkout` Edge
 * Function (which binds the session to the signed-in user), then sends the
 * user to the returned Stripe Checkout URL — the system browser on desktop
 * (the webview itself must stay on the app), a same-tab navigation on the web.
 * The webhook is the source of truth for entitlement; the app re-fetches
 * entitlements on focus/auth-refresh when the user returns.
 */
export async function startCheckout(kind: CheckoutKind): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) return { error: 'Accounts are not configured.' };
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Sign in first.' };

  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { kind } });
  if (error) return { error: error.message };
  const url = (data as { url?: string } | null)?.url;
  if (!url) return { error: 'Checkout is not available right now.' };
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external', { url });
  } else {
    window.location.href = url;
  }
  return {};
}
