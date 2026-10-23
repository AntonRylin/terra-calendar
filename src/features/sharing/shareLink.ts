/** Query parameter carrying an invite token. */
export const SHARE_TOKEN_PARAM = 'share';

/**
 * The web app's base URL, which is where a share link has to point: the
 * recipient may be on any device, and only the browser build can open a link.
 *
 * Falls back to the current origin so a self-hosted or locally-served build
 * produces links that work against itself.
 */
function webBase(): string {
  const configured = import.meta.env.VITE_WEB_APP_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return window.location.origin + window.location.pathname.replace(/\/+$/, '');
  }
  return '';
}

/** The link an owner sends to invite someone into a share. */
export function shareLinkFor(token: string): string {
  return `${webBase()}/?${SHARE_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/** An invite token present in the current URL, if any. */
export function pendingShareToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.search).get(SHARE_TOKEN_PARAM);
  return token && token.trim() !== '' ? token.trim() : null;
}

/** Drop the token from the address bar once it has been redeemed, so a reload
 *  (or a shared screenshot of the URL) doesn't carry the secret around. */
export function clearShareToken(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_TOKEN_PARAM);
  window.history.replaceState({}, '', url.toString());
}
