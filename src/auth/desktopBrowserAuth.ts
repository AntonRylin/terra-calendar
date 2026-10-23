import { getSupabase, isSupabaseConfigured } from '../data/supabaseClient';

/**
 * Browser-based sign-in for the desktop app.
 *
 * Flow: the app opens the hosted web app in the SYSTEM browser with
 * `?desktop=1`. The user signs in (or already is), and the page offers an
 * "Open the desktop app" button pointing at
 * `opencalendar://auth/callback#access_token=…&refresh_token=…` (see
 * AuthGate). The OS routes that URL to this app via the deep-link plugin
 * (single-instance forwards it when the app is already running), and we adopt
 * the session. Credentials are never typed into the webview.
 */

const DEFAULT_WEB_APP_URL = 'https://antonrylin.github.io/terra-calendar/app/';

function webAppUrl(): string {
  return import.meta.env.VITE_WEB_APP_URL || DEFAULT_WEB_APP_URL;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Open the hosted sign-in page in the system browser. Desktop only. */
export async function startBrowserSignIn(): Promise<{ error?: string }> {
  if (!isTauri()) return { error: 'Browser sign-in is only for the desktop app.' };
  const base = webAppUrl();
  const url = `${base}${base.includes('?') ? '&' : '?'}desktop=1`;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external', { url });
    return {};
  } catch (e) {
    return { error: String(e) };
  }
}

/** Adopt a session from an opencalendar://auth/callback deep link. */
async function handleAuthUrls(urls: string[]): Promise<void> {
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== 'opencalendar:') continue;
    // Tokens travel in the fragment (never sent to any server by the browser).
    const params = new URLSearchParams(url.hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) continue;
    await getSupabase().auth.setSession({ access_token, refresh_token });
  }
}

/**
 * Start listening for sign-in deep links (including one the app was launched
 * with). Call once on desktop startup; returns an unsubscribe.
 */
export async function initDesktopAuthDeepLink(): Promise<() => void> {
  if (!isTauri() || !isSupabaseConfigured()) return () => {};
  const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  return onOpenUrl((urls) => void handleAuthUrls(urls));
}
