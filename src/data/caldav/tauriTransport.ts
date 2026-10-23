import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { DavTransport } from './types';

/**
 * DavTransport over Tauri's native HTTP (reqwest under the hood, so no browser
 * CORS and full support for CalDAV verbs like PROPFIND/REPORT).
 *
 * `auth` is the full `Authorization` header value — for iCloud that's
 * `'Basic ' + btoa(`${appleId}:${appSpecificPassword}`)`.
 */
export function createTauriTransport(auth: string): DavTransport {
  const fetchWithAuth = async (
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: string,
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
    const res = await tauriFetch(url, {
      method,
      headers: {
        'User-Agent': 'macOS/14.4 (23E214) CalendarAgent/940',
        Authorization: auth,
        ...(headers ?? {}),
      },
      body,
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, url).toString();
        const originalHost = new URL(url).hostname;
        const nextHost = new URL(nextUrl).hostname;
        
        // Retain Authorization header only if redirecting to an iCloud domain or same host space
        if (
          nextHost.endsWith('.icloud.com') ||
          nextHost.endsWith(originalHost) ||
          originalHost.endsWith(nextHost)
        ) {
          return fetchWithAuth(method, nextUrl, headers, body);
        }
      }
    }

    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    return { status: res.status, headers: outHeaders, body: await res.text() };
  };

  return ({ method, url, headers, body }) => fetchWithAuth(method, url, headers, body);
}

/**
 * TASK 13 SPIKE — run this once from the Tauri devtools console to confirm the
 * HTTP plugin lets custom CalDAV verbs through to iCloud:
 *
 *   const m = await import('/src/data/caldav/tauriTransport.ts');
 *   await m.icloudSpike('you@icloud.com', 'xxxx-xxxx-xxxx-xxxx');
 *
 * Expected: { status: 207, body: '...<current-user-principal>...' }.
 * If status is 0/401/405 or the verb is rejected, report it back — we switch
 * the transport to a Rust reqwest command.
 */
export async function icloudSpike(
  appleId: string,
  appPassword: string,
): Promise<{ status: number; body: string }> {
  const auth = 'Basic ' + btoa(`${appleId}:${appPassword}`);
  const transport = createTauriTransport(auth);
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
  const res = await transport({
    method: 'PROPFIND',
    url: 'https://caldav.icloud.com/',
    headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
    body,
  });
  return { status: res.status, body: res.body };
}

/**
 * TASK 13 SPIKE (verbose) — diagnoses a 401 by exposing whether iCloud is
 * redirecting (which makes the client drop the Authorization header) and
 * whether it's issuing a Basic auth challenge.
 */
export async function icloudSpikeVerbose(
  appleId: string,
  appPassword: string,
): Promise<Record<string, unknown>> {
  const auth = 'Basic ' + btoa(`${appleId}:${appPassword}`);
  const req = {
    method: 'PROPFIND',
    headers: {
      Authorization: auth,
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
  };
  const out: Record<string, unknown> = {};

  // 1) Auto-follow redirects (default). Shows the final host + status.
  const res = await tauriFetch('https://caldav.icloud.com/', req);
  out.followStatus = res.status;
  out.followUrl = res.url;
  out.wwwAuthenticate = res.headers.get('www-authenticate');
  out.followBody = (await res.text()).slice(0, 600);

  // 2) Manual redirect — reveals a redirect that strips the auth header.
  try {
    const res2 = await tauriFetch('https://caldav.icloud.com/', { ...req, redirect: 'manual' });
    out.manualStatus = res2.status;
    out.location = res2.headers.get('location');
  } catch (e) {
    out.manualError = String(e);
  }

  return out;
}
