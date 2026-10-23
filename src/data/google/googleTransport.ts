import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { DavResponse, DavTransport } from '../caldav/types';
import type { TokenProvider } from './tokenProvider';

/** The slice of a fetch `Response` we use — declared so tests can inject a fake
 *  without pulling in Tauri's native HTTP. */
export interface FetchResponse {
  status: number;
  headers: {
    get(name: string): string | null;
    forEach(cb: (value: string, key: string) => void): void;
  };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    redirect?: 'manual' | 'follow';
  },
) => Promise<FetchResponse>;

/** Keep the bearer token only on redirects that stay within Google. */
function authRetained(originalHost: string, nextHost: string): boolean {
  return (
    nextHost === originalHost ||
    nextHost.endsWith('.google.com') ||
    nextHost.endsWith('.googleapis.com') ||
    nextHost.endsWith('.googleusercontent.com')
  );
}

/**
 * A `DavTransport` that authenticates every request with an OAuth bearer token
 * and, on a `401`, refreshes the token once and retries — so a CalDAV sync that
 * outlives the ~1h access-token lifetime keeps working without user action.
 */
export function createGoogleTransport(
  provider: TokenProvider,
  fetchImpl: FetchLike = tauriFetch as unknown as FetchLike,
): DavTransport {
  async function run(
    method: string,
    url: string,
    headers: Record<string, string> | undefined,
    body: string | undefined,
    token: string,
    allowRefresh: boolean,
  ): Promise<DavResponse> {
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(headers ?? {}) },
      body,
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, url).toString();
        if (authRetained(new URL(url).hostname, new URL(nextUrl).hostname)) {
          return run(method, nextUrl, headers, body, token, allowRefresh);
        }
      }
    }

    if (res.status === 401 && allowRefresh) {
      const fresh = await provider.refresh();
      return run(method, url, headers, body, fresh, false);
    }

    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    return { status: res.status, headers: outHeaders, body: await res.text() };
  }

  return async ({ method, url, headers, body }) => {
    const token = await provider.getAccessToken();
    return run(method, url, headers, body, token, true);
  };
}
