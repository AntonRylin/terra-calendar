/**
 * Google OAuth 2.0 helpers for the desktop (installed-app) flow.
 *
 * We use the Authorization Code flow with PKCE and a loopback redirect — the
 * recommended flow for installed apps, which needs **no client secret**. The
 * loopback listener that captures the redirect lives in Rust (the `google_oauth`
 * Tauri command); everything here is pure/IO-light so it unit-tests without a
 * browser. All network calls go through an injected `OAuthHttp` so tests can
 * supply a fake and the desktop app can supply Tauri's native (CORS-free) HTTP.
 */

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** CalDAV read/write, plus the identity scopes we need to learn the account
 *  email (shown in Settings and used as the cache/keychain key). */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar openid email';

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
}

/** Minimal HTTP POST (form-encoded) used for token requests. Injected so this
 *  module is testable and so the app can route through Tauri's native HTTP. */
export type OAuthHttp = (
  url: string,
  form: Record<string, string>,
) => Promise<{ status: number; body: string }>;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE pair: a random `verifier` and its S256 `challenge`. */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** An opaque value echoed back on the redirect to defend against CSRF. */
export function randomState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Read the `email` claim from an ID token without verifying the signature —
 *  it came straight from Google's token endpoint over TLS, so for display/keying
 *  purposes that's enough. Returns null if absent or unparseable. */
export function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(decodeURIComponent(escape(atob(padded)))) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

async function postToken(http: OAuthHttp, form: Record<string, string>): Promise<TokenResponse> {
  const res = await http(TOKEN_ENDPOINT, form);
  let parsed: Partial<TokenResponse> & { error?: string; error_description?: string };
  try {
    parsed = JSON.parse(res.body);
  } catch {
    parsed = {};
  }
  if (res.status < 200 || res.status >= 300 || parsed.error || !parsed.access_token) {
    const detail = parsed.error_description || parsed.error || res.body || 'unknown error';
    throw new Error(`Google token request failed (HTTP ${res.status}): ${detail}`);
  }
  return parsed as TokenResponse;
}

/** Exchange an authorization `code` (+ PKCE verifier) for tokens. */
export function exchangeCode(
  http: OAuthHttp,
  params: { code: string; verifier: string; redirectUri: string; clientId: string },
): Promise<TokenResponse> {
  return postToken(http, {
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.verifier,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });
}

/** Trade a long-lived refresh token for a fresh access token. */
export function refreshAccessToken(
  http: OAuthHttp,
  params: { refreshToken: string; clientId: string },
): Promise<TokenResponse> {
  return postToken(http, {
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
}
