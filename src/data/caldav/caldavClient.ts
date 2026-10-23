import type { CalDavConfig, DavTransport, RemoteResource } from './types';

/** Local-name lookup that ignores XML namespaces (servers vary in prefixes). */
function pick(el: Element, local: string): Element | null {
  for (const child of Array.from(el.getElementsByTagName('*'))) {
    if (child.localName === local) return child;
  }
  return null;
}
function pickAll(doc: Document | Element, local: string): Element[] {
  return Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === local);
}

/** A calendar collection discovered on the server. */
export interface CalendarInfo {
  /** Absolute URL of the calendar collection. */
  url: string;
  displayName: string;
  /** The server reported a privilege set WITHOUT write access — never PUT or
   *  DELETE here. A server that reports no privileges at all is treated as
   *  writable (see {@link parseCalendarList}). */
  readOnly: boolean;
  /** `DAV:owner` names a principal other than the connected account, i.e. this
   *  calendar is shared with the user rather than owned by them. */
  shared: boolean;
  /** The owner principal href, when the server reports one (for UI labels). */
  owner?: string;
}

function originOf(url: string): string {
  const m = url.match(/^(https?:\/\/[^/]+)/);
  return m ? m[1] : '';
}

function resolveHref(baseUrl: string, href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return originOf(baseUrl) + (href.startsWith('/') ? href : '/' + href);
}

/** `<current-user-principal><href>…</href>` → the principal href. */
export function parseCurrentUserPrincipal(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const el = pickAll(doc, 'current-user-principal')[0];
  return el ? (pick(el, 'href')?.textContent?.trim() ?? null) : null;
}

/** `<calendar-home-set><href>…</href>` → the (usually absolute) home URL. */
export function parseCalendarHome(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const el = pickAll(doc, 'calendar-home-set')[0];
  return el ? (pick(el, 'href')?.textContent?.trim() ?? null) : null;
}

/** Principal hrefs are compared by path so an absolute `owner` and a relative
 *  `current-user-principal` (servers mix the two freely) still match. */
function samePrincipal(a: string, b: string): boolean {
  const path = (href: string) => {
    const withoutOrigin = href.replace(/^https?:\/\/[^/]+/, '');
    return withoutOrigin.replace(/\/+$/, '');
  };
  return path(a) !== '' && path(a) === path(b);
}

/**
 * Write access from a `DAV:current-user-privilege-set`.
 *
 * Returns `true` when the element is ABSENT: not every server reports
 * privileges, and treating silence as read-only would stop writes working for
 * accounts that sync fine today. Only an explicitly returned privilege set with
 * no write privilege marks a calendar read-only.
 */
function writableFrom(resp: Element): boolean {
  const privSet = pick(resp, 'current-user-privilege-set');
  if (!privSet) return true; // not reported → assume owned/writable (status quo)
  return pickAll(privSet, 'privilege').some((p) =>
    Array.from(p.getElementsByTagName('*')).some((el) =>
      el.localName === 'write' || el.localName === 'write-content' || el.localName === 'all',
    ),
  );
}

/**
 * VEVENT-capable calendar collections from a Depth:1 listing of the home.
 *
 * `principalHref` is the connected account's own principal. When given, a
 * calendar whose `DAV:owner` is a DIFFERENT principal is reported as `shared` —
 * that is how a calendar a family member shared with the user is told apart
 * from one the user owns. Omitting it (or a server that reports no owner) yields
 * `shared: false`, i.e. exactly the pre-sharing behavior.
 */
export function parseCalendarList(
  xml: string,
  baseUrl: string,
  principalHref?: string,
): CalendarInfo[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: CalendarInfo[] = [];
  for (const resp of pickAll(doc, 'response')) {
    const href = pick(resp, 'href')?.textContent?.trim();
    if (!href) continue;
    // Must be an actual calendar collection (excludes the home itself).
    const resType = pick(resp, 'resourcetype');
    const isCalendar = resType ? pickAll(resType, 'calendar').length > 0 : false;
    if (!isCalendar) continue;
    // Must support VEVENT (excludes VTODO-only reminder lists).
    const compSet = pick(resp, 'supported-calendar-component-set');
    const supportsEvents = compSet
      ? pickAll(compSet, 'comp').some((c) => c.getAttribute('name') === 'VEVENT')
      : false;
    if (!supportsEvents) continue;
    const displayName = pick(resp, 'displayname')?.textContent?.trim() || href;
    const ownerEl = pick(resp, 'owner');
    const owner = ownerEl ? pick(ownerEl, 'href')?.textContent?.trim() : undefined;
    out.push({
      url: resolveHref(baseUrl, href),
      displayName,
      readOnly: !writableFrom(resp),
      shared: Boolean(owner && principalHref && !samePrincipal(owner, principalHref)),
      owner: owner || undefined,
    });
  }
  return out;
}

export function parseMultistatus(xml: string): RemoteResource[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return pickAll(doc, 'response').map((resp) => {
    const href = pick(resp, 'href')?.textContent?.trim() ?? '';
    const etag = pick(resp, 'getetag')?.textContent?.trim() ?? '';
    const ics = pick(resp, 'calendar-data')?.textContent ?? '';
    return { href, etag, ics };
  });
}

const CALENDAR_QUERY = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR">
    <c:comp-filter name="VEVENT"/>
  </c:comp-filter></c:filter>
</c:calendar-query>`;

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const origin = base.replace(/\/+$/, '').replace(/(https?:\/\/[^/]+).*/, '$1');
  return origin + (path.startsWith('/') ? path : '/' + path);
}

export class PreconditionFailed extends Error {
  constructor(public readonly ref: string) {
    super(`Precondition failed for ${ref} — the event changed on the server.`);
    this.name = 'PreconditionFailed';
  }
}

export class CalDavClient {
  constructor(private readonly transport: DavTransport, private readonly config: CalDavConfig) {}

  private get calendarUrl(): string {
    if (!this.config.calendarUrl) throw new Error('No calendar selected.');
    return this.config.calendarUrl;
  }

  private async propfind(url: string, depth: 0 | 1, body: string): Promise<string> {
    const res = await this.transport({
      method: 'PROPFIND',
      url,
      headers: { Depth: String(depth), 'Content-Type': 'text/xml; charset=utf-8' },
      body,
    });
    if (res.status !== 207) throw new Error(`PROPFIND ${url} failed: HTTP ${res.status}`);
    return res.body;
  }

  /**
   * Discover the VEVENT calendars for the account: current-user-principal →
   * calendar-home-set → list the home (Depth 1). Returns the calendars the user
   * can pick from in Settings.
   */
  async discover(): Promise<CalendarInfo[]> {
    const principalBody =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<A:propfind xmlns:A="DAV:"><A:prop><A:current-user-principal/></A:prop></A:propfind>';
    const homeBody =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      '<A:prop><C:calendar-home-set/></A:prop></A:propfind>';
    // `owner` + `current-user-privilege-set` are what tell a calendar shared
    // WITH the user apart from one they own, and a read-only share from a
    // writable one. Servers that ignore either prop fall back to "owned and
    // writable", which is the behavior that shipped before sharing support.
    const listBody =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      '<A:prop><A:displayname/><A:resourcetype/><A:owner/>' +
      '<A:current-user-privilege-set/><C:supported-calendar-component-set/></A:prop>' +
      '</A:propfind>';

    const principalXml = await this.propfind(this.config.serverUrl, 0, principalBody);
    const principalHref = parseCurrentUserPrincipal(principalXml);
    if (!principalHref) throw new Error('The server did not return a current-user-principal.');

    const homeXml = await this.propfind(
      resolveHref(this.config.serverUrl, principalHref),
      0,
      homeBody,
    );
    const homeUrl = parseCalendarHome(homeXml);
    if (!homeUrl) throw new Error('The server did not return a calendar-home-set.');

    const listXml = await this.propfind(homeUrl, 1, listBody);
    return parseCalendarList(listXml, homeUrl, principalHref);
  }

  async listEvents(): Promise<RemoteResource[]> {
    return this.listEventsForCalendar(this.calendarUrl);
  }

  async listEventsForCalendar(calendarUrl: string): Promise<RemoteResource[]> {
    const res = await this.transport({
      method: 'REPORT',
      url: joinUrl(this.config.serverUrl, calendarUrl),
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: CALENDAR_QUERY,
    });
    if (res.status !== 207) throw new Error(`Calendar query failed: HTTP ${res.status}`);
    return parseMultistatus(res.body);
  }

  /** PUT a single event. `etag` undefined => create (If-None-Match: *). */
  async putEvent(uid: string, ics: string, etag: string | undefined): Promise<string> {
    const path = this.calendarUrl.replace(/\/+$/, '') + `/${uid}.ics`;
    return this.putEventByPath(path, ics, etag);
  }

  async putEventByPath(path: string, ics: string, etag: string | undefined): Promise<string> {
    const url = joinUrl(this.config.serverUrl, path);
    const headers: Record<string, string> = { 'Content-Type': 'text/calendar; charset=utf-8' };
    if (etag) headers['If-Match'] = etag;
    else headers['If-None-Match'] = '*';
    const res = await this.transport({ method: 'PUT', url, headers, body: ics });
    if (res.status === 412) throw new PreconditionFailed(path);
    if (res.status >= 400) {
      console.error('PUT failed details:', {
        url,
        status: res.status,
        headers: res.headers,
        responseBody: res.body,
      });
      throw new Error(`PUT failed: HTTP ${res.status} - ${res.body || 'No response body'}`);
    }
    return res.headers.etag ?? res.headers.ETag ?? '';
  }

  async putNewEvent(calendarUrl: string, uid: string, ics: string): Promise<{ etag: string; href: string }> {
    const path = calendarUrl.replace(/\/+$/, '') + `/${uid}.ics`;
    const etag = await this.putEventByPath(path, ics, undefined);
    return { etag, href: path };
  }

  async deleteEvent(href: string, etag: string): Promise<void> {
    const res = await this.transport({
      method: 'DELETE',
      url: joinUrl(this.config.serverUrl, href),
      headers: { 'If-Match': etag },
    });
    if (res.status === 412) throw new PreconditionFailed(href);
    if (res.status >= 400 && res.status !== 404) throw new Error(`DELETE failed: HTTP ${res.status}`);
  }
}
