import { describe, it, expect } from 'vitest';
import { parseMultistatus, parseCalendarList, CalDavClient } from './caldavClient';
import type { DavResponse } from './types';

const MS = `<?xml version="1.0"?>
<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/cal/e1.ics</href>
    <propstat><prop>
      <getetag>"v1"</getetag>
      <c:calendar-data>BEGIN:VCALENDAR
UID:e1
END:VCALENDAR</c:calendar-data>
    </prop></propstat>
  </response>
</multistatus>`;

describe('parseMultistatus', () => {
  it('extracts href, etag and calendar-data per response', () => {
    const rows = parseMultistatus(MS);
    expect(rows).toHaveLength(1);
    expect(rows[0].href).toBe('/cal/e1.ics');
    expect(rows[0].etag).toBe('"v1"');
    expect(rows[0].ics).toContain('UID:e1');
  });
});

function fakeTransport(routes: Array<{ match: (m: string, u: string) => boolean; res: DavResponse }>) {
  const calls: Array<{ method: string; url: string; body?: string; headers?: Record<string, string> }> = [];
  const t = async (req: { method: string; url: string; body?: string; headers?: Record<string, string> }) => {
    calls.push(req);
    const route = routes.find((r) => r.match(req.method, req.url));
    if (!route) return { status: 404, headers: {}, body: '' };
    return route.res;
  };
  return { t, calls };
}

describe('CalDavClient.listEvents', () => {
  it('REPORTs the calendar and returns parsed resources', async () => {
    const ms = `<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <response><href>/cal/e1.ics</href><propstat><prop>
        <getetag>"v1"</getetag>
        <c:calendar-data>BEGIN:VCALENDAR\nUID:e1\nEND:VCALENDAR</c:calendar-data>
      </prop></propstat></response></multistatus>`;
    const { t, calls } = fakeTransport([
      { match: (m) => m === 'REPORT', res: { status: 207, headers: {}, body: ms } },
    ]);
    const client = new CalDavClient(t, {
      serverUrl: 'https://caldav.icloud.com', username: 'me', calendarUrl: '/cal/',
    });
    const rows = await client.listEvents();
    expect(rows[0].href).toBe('/cal/e1.ics');
    expect(calls[0].method).toBe('REPORT');
  });
});

describe('CalDavClient.putEvent / deleteEvent', () => {
  it('PUTs to <calendar>/<uid>.ics and returns the new etag', async () => {
    const { t, calls } = fakeTransport([
      { match: (m) => m === 'PUT', res: { status: 201, headers: { etag: '"v2"' }, body: '' } },
    ]);
    const client = new CalDavClient(t, {
      serverUrl: 'https://caldav.icloud.com', username: 'me', calendarUrl: '/cal/',
    });
    const etag = await client.putEvent('uid9', 'BEGIN:VCALENDAR', undefined);
    expect(calls[0].url).toContain('/cal/uid9.ics');
    expect(calls[0].headers?.['If-None-Match']).toBe('*');
    expect(etag).toBe('"v2"');
  });

  it('DELETEs with If-Match', async () => {
    const { t, calls } = fakeTransport([
      { match: (m) => m === 'DELETE', res: { status: 204, headers: {}, body: '' } },
    ]);
    const client = new CalDavClient(t, {
      serverUrl: 'https://caldav.icloud.com', username: 'me', calendarUrl: '/cal/',
    });
    await client.deleteEvent('/cal/uid9.ics', '"v2"');
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].headers?.['If-Match']).toBe('"v2"');
  });
});

describe('CalDavClient.discover', () => {
  // Sanitised versions of real iCloud PROPFIND responses (fake account id).
  const principalXml = `<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop>
    <current-user-principal><href>/9999/principal/</href></current-user-principal>
    </prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
  const homeXml = `<multistatus xmlns="DAV:"><response><href>/9999/principal/</href><propstat><prop>
    <calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">https://p9-caldav.icloud.com/9999/calendars/</href></calendar-home-set>
    </prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
  const listXml = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <response><href>/9999/calendars/</href><propstat><prop><displayname>Home collection</displayname>
      <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></prop></propstat></response>
    <response><href>/9999/calendars/home/</href><propstat><prop><displayname>Main</displayname>
      <resourcetype><collection/><C:calendar/></resourcetype>
      <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></prop></propstat></response>
    <response><href>/9999/calendars/reminders/</href><propstat><prop><displayname>Reminders</displayname>
      <resourcetype><collection/><C:calendar/></resourcetype>
      <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></prop></propstat></response>
    <response><href>/9999/calendars/work/</href><propstat><prop><displayname>Work</displayname>
      <resourcetype><collection/><C:calendar/></resourcetype>
      <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></prop></propstat></response>
  </multistatus>`;

  function discoveryTransport() {
    return async (req: { method: string; url: string; body?: string }) => {
      const body = req.body ?? '';
      if (body.includes('current-user-principal')) return { status: 207, headers: {}, body: principalXml };
      if (body.includes('calendar-home-set')) return { status: 207, headers: {}, body: homeXml };
      if (body.includes('supported-calendar-component-set')) return { status: 207, headers: {}, body: listXml };
      return { status: 404, headers: {}, body: '' };
    };
  }

  it('chains principal -> home -> list and returns only VEVENT calendars', async () => {
    const client = new CalDavClient(discoveryTransport(), {
      serverUrl: 'https://caldav.icloud.com', username: 'me',
    });
    const cals = await client.discover();
    expect(cals.map((c) => c.displayName)).toEqual(['Main', 'Work']); // not the home, not VTODO
    expect(cals[0].url).toBe('https://p9-caldav.icloud.com/9999/calendars/home/');
  });

  it('treats calendars with no reported owner or privileges as owned and writable', async () => {
    // Servers that omit both props must keep behaving exactly as before sharing
    // support existed — otherwise working accounts would stop accepting writes.
    const client = new CalDavClient(discoveryTransport(), {
      serverUrl: 'https://caldav.icloud.com', username: 'me',
    });
    const cals = await client.discover();
    expect(cals.every((c) => !c.shared && !c.readOnly)).toBe(true);
  });
});

describe('parseCalendarList — shared and read-only calendars', () => {
  const PRINCIPAL = '/9999/principal/';

  /** One `<response>` for a VEVENT calendar, with optional owner/privileges. */
  function calendar(name: string, extra = ''): string {
    return `<response><href>/9999/calendars/${name}/</href><propstat><prop>
      <displayname>${name}</displayname>
      <resourcetype><collection/><C:calendar/></resourcetype>
      <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
      ${extra}</prop></propstat></response>`;
  }
  const wrap = (inner: string) =>
    `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${inner}</multistatus>`;
  const privileges = (...names: string[]) =>
    `<current-user-privilege-set>${names
      .map((n) => `<privilege><${n}/></privilege>`)
      .join('')}</current-user-privilege-set>`;
  const owner = (href: string) => `<owner><href>${href}</href></owner>`;

  const parse = (xml: string) =>
    parseCalendarList(xml, 'https://p9-caldav.icloud.com/9999/calendars/', PRINCIPAL);

  it('flags a calendar owned by another principal as shared', () => {
    const [cal] = parse(wrap(calendar('family', owner('/1234/principal/'))));
    expect(cal.shared).toBe(true);
    expect(cal.owner).toBe('/1234/principal/');
  });

  it('does not flag the user\'s own calendar as shared', () => {
    const [cal] = parse(wrap(calendar('mine', owner(PRINCIPAL))));
    expect(cal.shared).toBe(false);
  });

  it('matches an absolute owner href against a relative principal', () => {
    // Servers mix absolute and relative hrefs freely; a naive string compare
    // would report the user's own calendar as shared with them.
    const [cal] = parse(
      wrap(calendar('mine', owner('https://p9-caldav.icloud.com/9999/principal'))),
    );
    expect(cal.shared).toBe(false);
  });

  it('marks a calendar read-only when the privilege set has no write', () => {
    const [cal] = parse(wrap(calendar('family', privileges('read'))));
    expect(cal.readOnly).toBe(true);
  });

  it.each(['write', 'write-content', 'all'])('accepts %s as write access', (priv) => {
    const [cal] = parse(wrap(calendar('family', privileges('read', priv))));
    expect(cal.readOnly).toBe(false);
  });

  it('assumes writable when the server reports no privilege set at all', () => {
    const [cal] = parse(wrap(calendar('mine')));
    expect(cal.readOnly).toBe(false);
  });

  it('reports a read-only share as both shared and read-only', () => {
    const [cal] = parse(
      wrap(calendar('family', owner('/1234/principal/') + privileges('read'))),
    );
    expect(cal).toMatchObject({ shared: true, readOnly: true });
  });

  it('leaves everything unshared when no principal is supplied', () => {
    const cals = parseCalendarList(
      wrap(calendar('family', owner('/1234/principal/'))),
      'https://p9-caldav.icloud.com/9999/calendars/',
    );
    expect(cals[0].shared).toBe(false);
  });
});
