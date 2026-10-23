import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { OAuthHttp } from './oauth';

/** Google's CalDAV API base. Standard CalDAV discovery (current-user-principal
 *  → calendar-home-set → calendar list) works from here once authenticated. */
export const GOOGLE_CALDAV_BASE = 'https://apidata.googleusercontent.com/caldav/v2/';

/**
 * Committed default OAuth client ID, so distributed/production builds work for
 * everyone with **zero per-user setup**. Safe to ship: the desktop flow uses
 * PKCE, so there is no client secret to protect.
 *
 * ▶ TO RELEASE: paste your Google Cloud "Desktop app" OAuth client ID here
 *   (looks like "1234-abcd.apps.googleusercontent.com"). For it to work for the
 *   general public — not just Google-console "test users" — the app's OAuth
 *   consent screen must be PUBLISHED and VERIFIED by Google for the sensitive
 *   Calendar scope. See docs/RELEASING.md.
 *
 * Leave empty for local dev and set VITE_GOOGLE_CLIENT_ID in .env.local instead;
 * the env var always overrides this default.
 */
const DEFAULT_GOOGLE_CLIENT_ID =
  '908086533914-vk0bq0ikijbn2255su92n941arrirva6.apps.googleusercontent.com';

/** The OAuth client ID for the installed (desktop) app. With PKCE there is no
 *  client secret, so this is safe to ship in the bundle. The build-time env var
 *  wins; otherwise the committed default above is used. */
export function getGoogleClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID || undefined;
}

export function isGoogleConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

/** OAuthHttp backed by Tauri's native HTTP (no browser CORS). */
export const tauriOAuthHttp: OAuthHttp = async (url, form) => {
  const res = await tauriFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, body: await res.text() };
};
