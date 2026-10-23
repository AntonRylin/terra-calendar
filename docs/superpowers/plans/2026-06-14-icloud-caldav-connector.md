# iCloud CalDAV connector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop CalDAV connector (targeting Apple iCloud) behind the existing `EventRepository` interface, selectable at runtime, with a local read cache and two-way CRUD.

**Architecture:** All CalDAV complexity lives in `src/data/caldav/`. The adapter keeps a snapshot of server state and diffs the whole-list `saveAll` into per-event `PUT`/`DELETE`. Outbound iCalendar is hand-rolled (tiny, controlled model); inbound parsing uses `ical.js` (robust against real iCloud data). Transport is injected so the pure logic is unit-testable headlessly and the Tauri native HTTP client is supplied only at the edge.

**Tech Stack:** TypeScript, React, Zustand, Vitest, `ical.js`, Tauri v2 (`tauri-plugin-http`, Rust `keyring` crate).

---

## Verification note

Tasks 1–11 are pure TypeScript and are verified with `npm test` (Vitest) in any environment. Tasks 12–17 touch Tauri native code / UI / the live iCloud account and **must be built and verified on a desktop machine with the Tauri toolchain and a real Apple ID**. They are marked **[DESKTOP]**.

## File structure

| File | Responsibility |
|---|---|
| `src/data/caldav/types.ts` | Shared types: `CalDavConfig`, `DavTransport`, `RemoteResource`, `CalDavSnapshot` |
| `src/data/caldav/icalMapping.ts` | Pure `eventToICS` (hand-rolled) and `icsToEvent` (ical.js) |
| `src/data/caldav/caldavCache.ts` | Snapshot persistence behind an injected key-value store |
| `src/data/caldav/caldavClient.ts` | CalDAV protocol over an injected `DavTransport` |
| `src/data/caldav/caldavRepository.ts` | `EventRepository` impl: cache-first `load`, diffing `saveAll` |
| `src/data/caldav/tauriTransport.ts` | **[DESKTOP]** `DavTransport` backed by `@tauri-apps/plugin-http` |
| `src/app/connectionStore.ts` | Runtime connection choice (`local` \| `caldav`) + config |
| `src/data/createRepository.ts` | (modify) runtime-aware factory |
| `src/App.tsx` | (modify) **[DESKTOP]** wire connection store, re-init on change |
| `src/features/settings/Settings.tsx` | (modify) **[DESKTOP]** connection UI |
| `src-tauri/*` | **[DESKTOP]** http plugin, keychain commands, capabilities |

---

## Task 1: Dependencies and shared types

**Files:**
- Modify: `package.json`
- Create: `src/data/caldav/types.ts`

- [ ] **Step 1: Add ical.js**

Run: `npm install ical.js@^2.1.0`
Expected: `ical.js` appears in `dependencies`.

- [ ] **Step 2: Create the shared types**

Create `src/data/caldav/types.ts`:

```ts
import type { CalendarEvent } from '../../core/types';

/** Connection details for a CalDAV account. Password is NOT here — it lives in
 *  the OS keychain, looked up by `username`. */
export interface CalDavConfig {
  /** Base server URL, e.g. https://caldav.icloud.com */
  serverUrl: string;
  /** Account username (Apple ID email). */
  username: string;
  /** Chosen calendar collection URL, resolved by discovery. */
  calendarUrl?: string;
}

/** A response from the transport layer. */
export interface DavResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Injected HTTP transport. Lets us unit-test with a mock and supply Tauri's
 *  native (CORS-free) HTTP at the edge. */
export type DavTransport = (req: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<DavResponse>;

/** One event resource on the server. */
export interface RemoteResource {
  /** Resource path (href) of the .ics, relative to the origin. */
  href: string;
  etag: string;
  ics: string;
}

/** One snapshot entry: the parsed event plus the server bookkeeping needed to
 *  diff and to issue conditional writes. */
export interface SnapshotEntry {
  event: CalendarEvent;
  href: string;
  etag: string;
}

/** Cached server state for one account. */
export interface CalDavSnapshot {
  syncToken?: string;
  ctag?: string;
  /** Keyed by event id. */
  entries: Record<string, SnapshotEntry>;
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/data/caldav/types.ts
git commit -m "feat(caldav): add ical.js and shared connector types"
```

---

## Task 2: Outbound iCalendar (`eventToICS`)

**Files:**
- Create: `src/data/caldav/icalMapping.ts`
- Test: `src/data/caldav/icalMapping.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/caldav/icalMapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eventToICS } from './icalMapping';
import type { CalendarEvent } from '../../core/types';

const base: CalendarEvent = {
  id: 'abc-123',
  title: 'Lunch, with Sam',
  date: '2026-06-18',
  recurrence: null,
  createdAt: '2026-06-14T08:00:00.000Z',
  updatedAt: '2026-06-14T08:00:00.000Z',
};

describe('eventToICS', () => {
  it('emits an all-day VEVENT with VALUE=DATE and escaped text', () => {
    const ics = eventToICS(base);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:abc-123');
    expect(ics).toContain('SUMMARY:Lunch\\, with Sam');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260618');
    expect(ics).toContain('END:VEVENT');
  });

  it('emits a timed VEVENT with TZID', () => {
    const ics = eventToICS({ ...base, time: '12:30', tz: 'Europe/Berlin' });
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20260618T123000');
  });

  it('emits RRULE, EXDATE, color and the minimap X-prop', () => {
    const ics = eventToICS({
      ...base,
      recurrence: { unit: 'week', interval: 2 },
      exdates: ['2026-07-02'],
      color: '#ff375f',
      showOnMinimap: false,
    });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(ics).toContain('EXDATE;VALUE=DATE:20260702');
    expect(ics).toContain('COLOR:#ff375f');
    expect(ics).toContain('X-OPENCAL-MINIMAP:FALSE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/icalMapping.test.ts`
Expected: FAIL — `eventToICS` not exported.

- [ ] **Step 3: Implement `eventToICS`**

Create `src/data/caldav/icalMapping.ts`:

```ts
import type { CalendarEvent, Recurrence } from '../../core/types';

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Fold to <=75 chars per RFC 5545 (char-based; adequate for our ASCII data). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

function toICSUtc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function rrule(r: Recurrence): string {
  const freq = r.unit === 'week' ? 'WEEKLY' : r.unit === 'month' ? 'MONTHLY' : 'YEARLY';
  const interval = Math.max(1, Math.floor(r.interval) || 1);
  return interval > 1 ? `FREQ=${freq};INTERVAL=${interval}` : `FREQ=${freq}`;
}

export function eventToICS(e: CalendarEvent): string {
  const compact = (d: string) => d.replace(/-/g, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Open Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}`,
    `DTSTAMP:${toICSUtc(e.updatedAt)}`,
    `CREATED:${toICSUtc(e.createdAt)}`,
    `LAST-MODIFIED:${toICSUtc(e.updatedAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);

  if (e.time) {
    const dt = `${compact(e.date)}T${e.time.replace(':', '')}00`;
    lines.push(e.tz ? `DTSTART;TZID=${e.tz}:${dt}` : `DTSTART:${dt}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`);
  }

  if (e.recurrence) lines.push(`RRULE:${rrule(e.recurrence)}`);
  if (e.exdates?.length) {
    lines.push(`EXDATE;VALUE=DATE:${e.exdates.map(compact).join(',')}`);
  }
  if (e.color) lines.push(`COLOR:${e.color}`);
  if (e.showOnMinimap === false) lines.push('X-OPENCAL-MINIMAP:FALSE');

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/icalMapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/icalMapping.ts src/data/caldav/icalMapping.test.ts
git commit -m "feat(caldav): hand-rolled outbound iCalendar serializer"
```

---

## Task 3: Inbound iCalendar (`icsToEvent`)

**Files:**
- Modify: `src/data/caldav/icalMapping.ts`
- Modify: `src/data/caldav/icalMapping.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/data/caldav/icalMapping.test.ts`:

```ts
import { icsToEvent } from './icalMapping';

describe('icsToEvent', () => {
  it('parses an all-day event', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x1', 'SUMMARY:Offsite', 'DTSTART;VALUE=DATE:20260616',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.id).toBe('x1');
    expect(e.title).toBe('Offsite');
    expect(e.date).toBe('2026-06-16');
    expect(e.time).toBeUndefined();
  });

  it('parses a timed recurring event with tz and exdate', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x2', 'SUMMARY:Standup',
      'DTSTART;TZID=Europe/Berlin:20260615T090000',
      'RRULE:FREQ=WEEKLY;INTERVAL=2',
      'EXDATE;VALUE=DATE:20260629',
      'X-OPENCAL-MINIMAP:FALSE',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.time).toBe('09:00');
    expect(e.tz).toBe('Europe/Berlin');
    expect(e.recurrence).toEqual({ unit: 'week', interval: 2 });
    expect(e.exdates).toEqual(['2026-06-29']);
    expect(e.showOnMinimap).toBe(false);
  });

  it('returns null when there is no VEVENT', () => {
    expect(icsToEvent('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/icalMapping.test.ts`
Expected: FAIL — `icsToEvent` not exported.

- [ ] **Step 3: Implement `icsToEvent` with ical.js**

Add to `src/data/caldav/icalMapping.ts`:

```ts
import ICAL from 'ical.js';

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function pad4(n: number): string { return String(n).padStart(4, '0'); }

function icalTimeToIso(t: unknown): string | undefined {
  if (t && typeof (t as { toJSDate?: () => Date }).toJSDate === 'function') {
    return (t as { toJSDate: () => Date }).toJSDate().toISOString();
  }
  return undefined;
}

export function icsToEvent(ics: string): CalendarEvent | null {
  let vevent: ICAL.Component | null;
  try {
    const comp = new ICAL.Component(ICAL.parse(ics));
    vevent = comp.getFirstSubcomponent('vevent');
  } catch {
    return null;
  }
  if (!vevent) return null;

  const ev = new ICAL.Event(vevent);
  const start = ev.startDate;
  const date = `${pad4(start.year)}-${pad2(start.month)}-${pad2(start.day)}`;

  let time: string | undefined;
  let tz: string | undefined;
  if (!start.isDate) {
    time = `${pad2(start.hour)}:${pad2(start.minute)}`;
    const tzid = start.zone?.tzid;
    if (tzid && tzid !== 'floating') tz = tzid;
  }

  let recurrence: Recurrence | null = null;
  const rule = vevent.getFirstPropertyValue('rrule') as { freq?: string; interval?: number } | null;
  if (rule?.freq) {
    const unit =
      rule.freq === 'WEEKLY' ? 'week' :
      rule.freq === 'MONTHLY' ? 'month' :
      rule.freq === 'YEARLY' ? 'year' : null;
    if (unit) recurrence = { unit, interval: rule.interval && rule.interval > 0 ? rule.interval : 1 };
  }

  const exdates: string[] = [];
  for (const p of vevent.getAllProperties('exdate')) {
    const v = p.getFirstValue() as { year: number; month: number; day: number };
    if (v?.year) exdates.push(`${pad4(v.year)}-${pad2(v.month)}-${pad2(v.day)}`);
  }

  const minimap = vevent.getFirstPropertyValue('x-opencal-minimap');
  const color = vevent.getFirstPropertyValue('color');
  const created = icalTimeToIso(vevent.getFirstPropertyValue('created'));
  const modified = icalTimeToIso(vevent.getFirstPropertyValue('last-modified'));
  const nowIso = new Date().toISOString();

  return {
    id: ev.uid,
    title: ev.summary ?? '',
    description: ev.description || undefined,
    date,
    time,
    tz,
    recurrence,
    exdates: exdates.length ? exdates : undefined,
    color: typeof color === 'string' ? color : undefined,
    showOnMinimap: typeof minimap === 'string' && minimap.toUpperCase() === 'FALSE' ? false : undefined,
    createdAt: created ?? nowIso,
    updatedAt: modified ?? created ?? nowIso,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/icalMapping.test.ts`
Expected: PASS. (If an `ical.js` accessor differs from the above, adjust the accessor — the tests pin the required behavior.)

- [ ] **Step 5: Add and run a round-trip test**

Append:

```ts
describe('round-trip', () => {
  it('event -> ICS -> event preserves core fields', () => {
    const e = {
      id: 'rt1', title: 'Gym', date: '2026-06-15', time: '18:00',
      tz: 'Europe/Berlin', recurrence: { unit: 'week', interval: 1 } as const,
      createdAt: '2026-06-14T08:00:00.000Z', updatedAt: '2026-06-14T08:00:00.000Z',
    };
    const back = icsToEvent(eventToICS(e))!;
    expect(back.title).toBe('Gym');
    expect(back.date).toBe('2026-06-15');
    expect(back.time).toBe('18:00');
    expect(back.tz).toBe('Europe/Berlin');
    expect(back.recurrence).toEqual({ unit: 'week', interval: 1 });
  });
});
```

Run: `npx vitest run src/data/caldav/icalMapping.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/caldav/icalMapping.ts src/data/caldav/icalMapping.test.ts
git commit -m "feat(caldav): inbound iCalendar parser (ical.js) + round-trip"
```

---

## Task 4: Snapshot cache

**Files:**
- Create: `src/data/caldav/caldavCache.ts`
- Test: `src/data/caldav/caldavCache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/caldav/caldavCache.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CalDavCache } from './caldavCache';
import type { CalDavSnapshot } from './types';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string) => { m.set(k, v); },
    store: m,
  };
}

const snap: CalDavSnapshot = {
  syncToken: 'tok-1',
  entries: {
    e1: {
      href: '/cal/e1.ics', etag: '"v1"',
      event: { id: 'e1', title: 'A', date: '2026-06-01', recurrence: null,
        createdAt: 'x', updatedAt: 'x' },
    },
  },
};

describe('CalDavCache', () => {
  it('returns an empty snapshot when nothing is stored', async () => {
    const cache = new CalDavCache(memoryStore(), 'acct');
    expect(await cache.load()).toEqual({ entries: {} });
  });

  it('round-trips a snapshot, scoped by account key', async () => {
    const store = memoryStore();
    const cache = new CalDavCache(store, 'acct');
    await cache.save(snap);
    expect(await cache.load()).toEqual(snap);
    // A different account sees nothing.
    const other = new CalDavCache(store, 'other');
    expect(await other.load()).toEqual({ entries: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/caldavCache.test.ts`
Expected: FAIL — `CalDavCache` not found.

- [ ] **Step 3: Implement the cache**

Create `src/data/caldav/caldavCache.ts`:

```ts
import type { CalDavSnapshot } from './types';

/** Minimal async key-value store (localStorage in browser dev, Tauri fs/store
 *  on desktop — injected so this module stays pure and testable). */
export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const EMPTY: CalDavSnapshot = { entries: {} };

export class CalDavCache {
  private readonly key: string;

  constructor(private readonly store: KvStore, accountKey: string) {
    this.key = `open-calendar.caldav.snapshot.${accountKey}`;
  }

  async load(): Promise<CalDavSnapshot> {
    const raw = await this.store.get(this.key);
    if (!raw) return { ...EMPTY };
    try {
      const parsed = JSON.parse(raw) as CalDavSnapshot;
      return parsed && parsed.entries ? parsed : { ...EMPTY };
    } catch {
      return { ...EMPTY };
    }
  }

  async save(snapshot: CalDavSnapshot): Promise<void> {
    await this.store.set(this.key, JSON.stringify(snapshot));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/caldavCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/caldavCache.ts src/data/caldav/caldavCache.test.ts
git commit -m "feat(caldav): account-scoped snapshot cache"
```

---

## Task 5: CalDAV client — multistatus parsing

**Files:**
- Create: `src/data/caldav/caldavClient.ts`
- Test: `src/data/caldav/caldavClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/caldav/caldavClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMultistatus } from './caldavClient';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/caldavClient.test.ts`
Expected: FAIL — `parseMultistatus` not found.

- [ ] **Step 3: Implement parsing (with jsdom DOMParser)**

Create `src/data/caldav/caldavClient.ts`:

```ts
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

export function parseMultistatus(xml: string): RemoteResource[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return pickAll(doc, 'response').map((resp) => {
    const href = pick(resp, 'href')?.textContent?.trim() ?? '';
    const etag = pick(resp, 'getetag')?.textContent?.trim() ?? '';
    const ics = pick(resp, 'calendar-data')?.textContent ?? '';
    return { href, etag, ics };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/caldavClient.test.ts`
Expected: PASS (Vitest uses jsdom, which provides `DOMParser`; the project already sets `jsdom` for tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/caldavClient.ts src/data/caldav/caldavClient.test.ts
git commit -m "feat(caldav): namespace-agnostic multistatus parser"
```

---

## Task 6: CalDAV client — discovery, read, write

**Files:**
- Modify: `src/data/caldav/caldavClient.ts`
- Modify: `src/data/caldav/caldavClient.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/data/caldav/caldavClient.test.ts`:

```ts
import { CalDavClient } from './caldavClient';
import type { DavResponse } from './types';

function fakeTransport(routes: Array<{ match: (m: string, u: string) => boolean; res: DavResponse }>) {
  const calls: Array<{ method: string; url: string; body?: string; headers?: Record<string,string> }> = [];
  const t = async (req: { method: string; url: string; body?: string; headers?: Record<string,string> }) => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/caldavClient.test.ts`
Expected: FAIL — `CalDavClient` not found.

- [ ] **Step 3: Implement the client**

Append to `src/data/caldav/caldavClient.ts`:

```ts
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

export class CalDavClient {
  constructor(private readonly transport: DavTransport, private readonly config: CalDavConfig) {}

  private get calendarUrl(): string {
    if (!this.config.calendarUrl) throw new Error('No calendar selected.');
    return this.config.calendarUrl;
  }

  async listEvents(): Promise<RemoteResource[]> {
    const res = await this.transport({
      method: 'REPORT',
      url: joinUrl(this.config.serverUrl, this.calendarUrl),
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: CALENDAR_QUERY,
    });
    if (res.status !== 207) throw new Error(`Calendar query failed: HTTP ${res.status}`);
    return parseMultistatus(res.body);
  }

  /** PUT a single event. `etag` undefined => create (If-None-Match: *). */
  async putEvent(uid: string, ics: string, etag: string | undefined): Promise<string> {
    const url = joinUrl(this.config.serverUrl, this.calendarUrl.replace(/\/+$/, '') + `/${uid}.ics`);
    const headers: Record<string, string> = { 'Content-Type': 'text/calendar; charset=utf-8' };
    if (etag) headers['If-Match'] = etag;
    else headers['If-None-Match'] = '*';
    const res = await this.transport({ method: 'PUT', url, headers, body: ics });
    if (res.status === 412) throw new PreconditionFailed(uid);
    if (res.status >= 400) throw new Error(`PUT failed: HTTP ${res.status}`);
    return res.headers.etag ?? res.headers.ETag ?? '';
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

export class PreconditionFailed extends Error {
  constructor(public readonly ref: string) {
    super(`Precondition failed for ${ref} — the event changed on the server.`);
    this.name = 'PreconditionFailed';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/caldavClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/caldavClient.ts src/data/caldav/caldavClient.test.ts
git commit -m "feat(caldav): client read/write over injected transport"
```

> **Note:** principal/calendar-home discovery (PROPFIND chain) is exercised live in Task 17's spike, where real iCloud responses are available. The client accepts a resolved `calendarUrl` so the pure logic stays testable; the discovery helper is added in Task 17 against real responses.

---

## Task 7: Repository — `load` (cache-first + refresh)

**Files:**
- Create: `src/data/caldav/caldavRepository.ts`
- Test: `src/data/caldav/caldavRepository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/caldav/caldavRepository.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CalDavRepository } from './caldavRepository';
import { CalDavCache } from './caldavCache';
import type { RemoteResource } from './types';

function memoryStore() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => { m.set(k, v); } };
}

function fakeClient(resources: RemoteResource[]) {
  const puts: Array<{ uid: string; etag?: string }> = [];
  const deletes: string[] = [];
  return {
    puts, deletes,
    listEvents: async () => resources,
    putEvent: async (uid: string, _ics: string, etag?: string) => { puts.push({ uid, etag }); return '"new"'; },
    deleteEvent: async (href: string) => { deletes.push(href); },
  };
}

const e1ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:e1\r\nSUMMARY:A\r\nDTSTART;VALUE=DATE:20260601\r\nEND:VEVENT\r\nEND:VCALENDAR';

describe('CalDavRepository.load', () => {
  it('returns events from a server refresh and caches them', async () => {
    const store = memoryStore();
    const cache = new CalDavCache(store, 'acct');
    const client = fakeClient([{ href: '/cal/e1.ics', etag: '"v1"', ics: e1ics }]);
    const repo = new CalDavRepository(client as any, cache);

    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['e1']);

    // Snapshot persisted for offline reads.
    const snap = await cache.load();
    expect(snap.entries.e1.etag).toBe('"v1"');
  });

  it('falls back to the cached snapshot when the server is unreachable', async () => {
    const store = memoryStore();
    const cache = new CalDavCache(store, 'acct');
    await cache.save({ entries: { e9: { href: '/cal/e9.ics', etag: '"z"',
      event: { id: 'e9', title: 'Cached', date: '2026-06-02', recurrence: null, createdAt: 'x', updatedAt: 'x' } } } });
    const client = { listEvents: async () => { throw new Error('offline'); } };
    const repo = new CalDavRepository(client as any, cache);

    const { events, warning } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['e9']);
    expect(warning).toMatch(/offline/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/caldavRepository.test.ts`
Expected: FAIL — `CalDavRepository` not found.

- [ ] **Step 3: Implement `load`**

Create `src/data/caldav/caldavRepository.ts`:

```ts
import type { EventRepository, LoadResult } from '../repository';
import type { CalendarEvent } from '../../core/types';
import type { CalDavSnapshot, SnapshotEntry } from './types';
import type { CalDavCache } from './caldavCache';
import { icsToEvent } from './icalMapping';
import { eventToICS } from './icalMapping';
import { PreconditionFailed } from './caldavClient';

/** The subset of CalDavClient the repository needs (eases testing). */
export interface EventClient {
  listEvents(): Promise<Array<{ href: string; etag: string; ics: string }>>;
  putEvent(uid: string, ics: string, etag: string | undefined): Promise<string>;
  deleteEvent(href: string, etag: string): Promise<void>;
}

export class CalDavRepository implements EventRepository {
  private snapshot: CalDavSnapshot = { entries: {} };

  constructor(private readonly client: EventClient, private readonly cache: CalDavCache) {}

  async load(): Promise<LoadResult> {
    this.snapshot = await this.cache.load();
    try {
      const resources = await this.client.listEvents();
      const entries: Record<string, SnapshotEntry> = {};
      for (const r of resources) {
        const event = icsToEvent(r.ics);
        if (!event) continue;
        entries[event.id] = { event, href: r.href, etag: r.etag };
      }
      this.snapshot = { ...this.snapshot, entries };
      await this.cache.save(this.snapshot);
      return { events: this.events() };
    } catch (err) {
      return {
        events: this.events(),
        warning: `Offline — showing cached events (${(err as Error).message}).`,
      };
    }
  }

  private events(): CalendarEvent[] {
    return Object.values(this.snapshot.entries).map((e) => e.event);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/caldavRepository.test.ts`
Expected: PASS. (`saveAll` is added next; TypeScript may warn it's missing from the interface — add the stub `async saveAll() {}` temporarily if the compile blocks the test, then replace in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/caldavRepository.ts src/data/caldav/caldavRepository.test.ts
git commit -m "feat(caldav): repository load (cache-first, offline fallback)"
```

---

## Task 8: Repository — `saveAll` (diff to per-event writes)

**Files:**
- Modify: `src/data/caldav/caldavRepository.ts`
- Modify: `src/data/caldav/caldavRepository.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/data/caldav/caldavRepository.test.ts`:

```ts
describe('CalDavRepository.saveAll', () => {
  it('creates new, updates changed, deletes removed', async () => {
    const store = memoryStore();
    const cache = new CalDavCache(store, 'acct');
    // Seed snapshot with e1 (unchanged) and e2 (will be removed).
    await cache.save({ entries: {
      e1: { href: '/cal/e1.ics', etag: '"1"', event: { id: 'e1', title: 'A', date: '2026-06-01', recurrence: null, createdAt: 'x', updatedAt: 'x' } },
      e2: { href: '/cal/e2.ics', etag: '"2"', event: { id: 'e2', title: 'B', date: '2026-06-02', recurrence: null, createdAt: 'x', updatedAt: 'x' } },
    } });
    const client = fakeClient([]);
    const repo = new CalDavRepository(client as any, cache);
    await repo.load().catch(() => {}); // primes snapshot from cache (listEvents returns [])

    // Reseed snapshot via cache (load above cleared entries since fakeClient returned []).
    await cache.save({ entries: {
      e1: { href: '/cal/e1.ics', etag: '"1"', event: { id: 'e1', title: 'A', date: '2026-06-01', recurrence: null, createdAt: 'x', updatedAt: 'x' } },
      e2: { href: '/cal/e2.ics', etag: '"2"', event: { id: 'e2', title: 'B', date: '2026-06-02', recurrence: null, createdAt: 'x', updatedAt: 'x' } },
    } });
    const repo2 = new CalDavRepository(client as any, cache);
    (repo2 as any).snapshot = await cache.load();

    await repo2.saveAll([
      { id: 'e1', title: 'A', date: '2026-06-01', recurrence: null, createdAt: 'x', updatedAt: 'x' }, // unchanged
      { id: 'e3', title: 'C', date: '2026-06-03', recurrence: null, createdAt: 'y', updatedAt: 'y' }, // new
    ]);

    expect(client.puts.map((p) => p.uid)).toEqual(['e3']);    // only the new one
    expect(client.deletes).toEqual(['/cal/e2.ics']);          // e2 removed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/caldavRepository.test.ts`
Expected: FAIL — `saveAll` not implemented / does nothing.

- [ ] **Step 3: Implement `saveAll`**

Add to `CalDavRepository` in `src/data/caldav/caldavRepository.ts`:

```ts
  async saveAll(events: CalendarEvent[]): Promise<void> {
    const prev = this.snapshot.entries;
    const nextIds = new Set(events.map((e) => e.id));
    const entries: Record<string, SnapshotEntry> = {};

    // Creates and updates.
    for (const event of events) {
      const existing = prev[event.id];
      if (existing && existing.event.updatedAt === event.updatedAt) {
        entries[event.id] = existing; // unchanged
        continue;
      }
      const ics = eventToICS(event);
      const etag = await this.client.putEvent(event.id, ics, existing?.etag);
      const href = existing?.href ?? `${event.id}.ics`;
      entries[event.id] = { event, href, etag };
    }

    // Deletes (in previous snapshot but not in the new list).
    for (const [id, entry] of Object.entries(prev)) {
      if (!nextIds.has(id)) {
        try {
          await this.client.deleteEvent(entry.href, entry.etag);
        } catch (err) {
          if (!(err instanceof PreconditionFailed)) throw err;
        }
      }
    }

    this.snapshot = { ...this.snapshot, entries };
    await this.cache.save(this.snapshot);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/caldavRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/caldavRepository.ts src/data/caldav/caldavRepository.test.ts
git commit -m "feat(caldav): saveAll diffs whole-list into per-event writes"
```

---

## Task 9: Connection store

**Files:**
- Create: `src/app/connectionStore.ts`
- Test: `src/app/connectionStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/connectionStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from './connectionStore';

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({ kind: 'local', caldav: undefined });
});

describe('connectionStore', () => {
  it('defaults to local', () => {
    expect(useConnectionStore.getState().kind).toBe('local');
  });

  it('persists a caldav connection to localStorage', () => {
    useConnectionStore.getState().setCalDav({ serverUrl: 'https://caldav.icloud.com', username: 'me@x.com' });
    expect(useConnectionStore.getState().kind).toBe('caldav');
    const raw = JSON.parse(localStorage.getItem('open-calendar.connection')!);
    expect(raw.caldav.username).toBe('me@x.com');
  });

  it('switches back to local', () => {
    useConnectionStore.getState().setCalDav({ serverUrl: 'u', username: 'me' });
    useConnectionStore.getState().useLocal();
    expect(useConnectionStore.getState().kind).toBe('local');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/connectionStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

Create `src/app/connectionStore.ts`:

```ts
import { create } from 'zustand';
import type { CalDavConfig } from '../data/caldav/types';

export type ConnectionKind = 'local' | 'caldav';

interface ConnectionState {
  kind: ConnectionKind;
  caldav?: CalDavConfig;
  useLocal(): void;
  setCalDav(config: CalDavConfig): void;
}

const KEY = 'open-calendar.connection';

function persisted(): Pick<ConnectionState, 'kind' | 'caldav'> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { kind: 'local' };
}

function save(state: Pick<ConnectionState, 'kind' | 'caldav'>): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  ...persisted(),
  useLocal() {
    const next = { kind: 'local' as const, caldav: undefined };
    save(next);
    set(next);
  },
  setCalDav(config) {
    const next = { kind: 'caldav' as const, caldav: config };
    save(next);
    set(next);
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/connectionStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/connectionStore.ts src/app/connectionStore.test.ts
git commit -m "feat: runtime connection store (local | caldav)"
```

---

## Task 10: Browser KV store adapter (dev fallback)

**Files:**
- Create: `src/data/caldav/localStorageKv.ts`
- Test: `src/data/caldav/localStorageKv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/caldav/localStorageKv.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { localStorageKv } from './localStorageKv';

beforeEach(() => localStorage.clear());

describe('localStorageKv', () => {
  it('round-trips values', async () => {
    await localStorageKv.set('k', 'v');
    expect(await localStorageKv.get('k')).toBe('v');
    expect(await localStorageKv.get('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/caldav/localStorageKv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/data/caldav/localStorageKv.ts`:

```ts
import type { KvStore } from './caldavCache';

/** KvStore backed by localStorage — used in browser dev. The Tauri desktop
 *  build supplies an fs-backed KvStore instead (Task 16). */
export const localStorageKv: KvStore = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => { localStorage.setItem(key, value); },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/caldav/localStorageKv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/localStorageKv.ts src/data/caldav/localStorageKv.test.ts
git commit -m "feat(caldav): localStorage KV adapter for dev"
```

---

## Task 11: Run the full pure-core suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: PASS, including all `src/data/caldav/*` and `src/app/connectionStore` tests, with no regressions in existing suites.

- [ ] **Step 2: Commit any fixups**

```bash
git commit -am "test(caldav): green pure-core suite" || echo "nothing to commit"
```

---

## Task 12 [DESKTOP]: Tauri HTTP plugin + capabilities

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json`

- [ ] **Step 1: Add the Rust + JS plugin**

In `src-tauri/Cargo.toml` `[dependencies]` add: `tauri-plugin-http = "2"`.
Run: `npm install @tauri-apps/plugin-http`

- [ ] **Step 2: Register the plugin**

In `src-tauri/src/lib.rs`, add to the builder chain (next to the existing fs/log plugins):

```rust
        .plugin(tauri_plugin_http::init())
```

- [ ] **Step 3: Grant HTTP permission to iCloud**

In `src-tauri/capabilities/default.json`, add to `permissions`:

```json
{
  "identifier": "http:default",
  "allow": [{ "url": "https://*.icloud.com/*" }, { "url": "https://caldav.icloud.com/*" }]
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run tauri build -- --debug` (or `npm run tauri dev` and confirm startup).
Expected: app compiles and launches.

- [ ] **Step 5: Commit**

```bash
git add src-tauri package.json package-lock.json
git commit -m "feat(desktop): add Tauri http plugin scoped to iCloud"
```

---

## Task 13 [DESKTOP]: Tauri transport adapter + custom-verb spike

**Files:**
- Create: `src/data/caldav/tauriTransport.ts`

- [ ] **Step 1: Implement the transport**

Create `src/data/caldav/tauriTransport.ts`:

```ts
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { DavTransport } from './types';

/** DavTransport over Tauri's native HTTP (no CORS). `auth` is the Basic header
 *  value built from username + app-specific password. */
export function createTauriTransport(auth: string): DavTransport {
  return async ({ method, url, headers, body }) => {
    const res = await tauriFetch(url, {
      method,
      headers: { Authorization: auth, ...(headers ?? {}) },
      body,
    });
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { outHeaders[k] = v; });
    return { status: res.status, headers: outHeaders, body: await res.text() };
  };
}
```

- [ ] **Step 2: SPIKE — verify custom verbs reach iCloud**

This is the spec's #1 risk. With a real Apple ID + app-specific password, run a one-off PROPFIND from the running app's devtools console (or a temporary button) using `createTauriTransport`:

```ts
const auth = 'Basic ' + btoa('APPLE_ID:APP_SPECIFIC_PASSWORD');
const t = createTauriTransport(auth);
const r = await t({ method: 'PROPFIND', url: 'https://caldav.icloud.com/', headers: { Depth: '0',
  'Content-Type': 'application/xml' },
  body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>' });
console.log(r.status, r.body);
```

Expected: `207` with XML containing `current-user-principal`.
- If `PROPFIND`/`REPORT` are rejected by the plugin, fall back to a Rust command using `reqwest` with `Method::from_bytes` and call it via `invoke` from `tauriTransport.ts`. **Stop and report the spike result before continuing.**

- [ ] **Step 3: Commit**

```bash
git add src/data/caldav/tauriTransport.ts
git commit -m "feat(desktop): Tauri native CalDAV transport + spike notes"
```

---

## Task 14 [DESKTOP]: Discovery helper (against real iCloud)

**Files:**
- Modify: `src/data/caldav/caldavClient.ts`
- Test: add fixture-based tests from captured spike XML

- [ ] **Step 1: Capture real responses**

Using the Task 13 transport, capture the XML for: `current-user-principal` (PROPFIND `/`), `calendar-home-set` (PROPFIND on the principal), and the calendar list (PROPFIND Depth:1 on the home, reading `displayname`, `resourcetype`, `supported-calendar-component-set`, `getctag`). Save trimmed copies as test fixtures.

- [ ] **Step 2: Write fixture tests, then implement `discover()`**

Add a `discover(): Promise<{ calendars: Array<{ url: string; displayName: string }> }>` method that PROPFINDs the chain and returns VEVENT-capable calendars, parsed with the namespace-agnostic helpers from Task 5. Write unit tests that feed the captured fixtures through a fake transport and assert the resolved calendar URLs. (Code mirrors `listEvents`: build the PROPFIND body, send via transport, parse with `pickAll`/`pick`.)

- [ ] **Step 3: Verify**

Run: `npx vitest run src/data/caldav/caldavClient.test.ts`
Expected: PASS against fixtures.

- [ ] **Step 4: Commit**

```bash
git add src/data/caldav/caldavClient.ts src/data/caldav/caldavClient.test.ts src/data/caldav/__fixtures__
git commit -m "feat(caldav): iCloud discovery from captured responses"
```

---

## Task 15 [DESKTOP]: Keychain commands (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`
- Create: `src/data/caldav/credentials.ts`

- [ ] **Step 1: Add the keyring crate + commands**

In `src-tauri/Cargo.toml`: `keyring = "3"`.
In `src-tauri/src/lib.rs`, add commands and register them in `invoke_handler`:

```rust
const SERVICE: &str = "open-calendar-caldav";

#[tauri::command]
fn save_credential(account: String, secret: String) -> Result<(), String> {
    keyring::Entry::new(SERVICE, &account).and_then(|e| e.set_password(&secret)).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_credential(account: String) -> Result<Option<String>, String> {
    match keyring::Entry::new(SERVICE, &account).and_then(|e| e.get_password()) {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_credential(account: String) -> Result<(), String> {
    match keyring::Entry::new(SERVICE, &account).and_then(|e| e.delete_credential()) {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
```

Register: `.invoke_handler(tauri::generate_handler![save_credential, get_credential, delete_credential])` (merge with any existing handler list).

- [ ] **Step 2: JS wrapper**

Create `src/data/caldav/credentials.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';

export const credentials = {
  save: (account: string, secret: string) => invoke<void>('save_credential', { account, secret }),
  get: (account: string) => invoke<string | null>('get_credential', { account }),
  remove: (account: string) => invoke<void>('delete_credential', { account }),
};
```

- [ ] **Step 3: Verify**

Run: `npm run tauri dev`; in devtools: `await credentials.save('me','pw'); await credentials.get('me')` → `'pw'`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri src/data/caldav/credentials.ts
git commit -m "feat(desktop): OS keychain credential commands"
```

---

## Task 16 [DESKTOP]: Tauri fs KV + runtime repository wiring

**Files:**
- Create: `src/data/caldav/tauriFsKv.ts`
- Modify: `src/data/createRepository.ts`, `src/App.tsx`

- [ ] **Step 1: fs-backed KvStore**

Create `src/data/caldav/tauriFsKv.ts` using `@tauri-apps/plugin-fs` to read/write a JSON file in `appDataDir` keyed by the KV key (one file per key, or a single JSON map). Implement the `KvStore` interface.

- [ ] **Step 2: Make `createRepository` runtime-aware**

Modify `src/data/createRepository.ts` to add an async factory that, given the connection store state, returns a `CalDavRepository` (built from `createTauriTransport(auth)`, `CalDavClient`, `CalDavCache` over the fs KV) when `kind === 'caldav'`, else the existing local/Tauri repo. Keep the existing build-time `getBackend()`/Supabase path untouched.

```ts
import { useConnectionStore } from '../app/connectionStore';
import { credentials } from './caldav/credentials';
import { createTauriTransport } from './caldav/tauriTransport';
import { CalDavClient } from './caldav/caldavClient';
import { CalDavRepository } from './caldav/caldavRepository';
import { CalDavCache } from './caldav/caldavCache';
import { tauriFsKv } from './caldav/tauriFsKv';

export async function createRepositoryAsync(): Promise<EventRepository> {
  const conn = useConnectionStore.getState();
  if (conn.kind === 'caldav' && conn.caldav) {
    const pw = await credentials.get(conn.caldav.username);
    const auth = 'Basic ' + btoa(`${conn.caldav.username}:${pw ?? ''}`);
    const client = new CalDavClient(createTauriTransport(auth), conn.caldav);
    const cache = new CalDavCache(tauriFsKv, conn.caldav.username);
    return new CalDavRepository(client, cache);
  }
  return createRepository(); // existing local/supabase logic
}
```

- [ ] **Step 3: Re-init the calendar on connection change**

In `src/App.tsx` `LocalApp`, subscribe to `useConnectionStore` and call `useCalendarStore.getState().init(await createRepositoryAsync())` on mount and whenever `kind`/`caldav` changes.

- [ ] **Step 4: Verify**

Run: `npm run tauri dev`; switch to a CalDAV connection and confirm events load; switch back to Local and confirm the local file loads.

- [ ] **Step 5: Commit**

```bash
git add src/data/caldav/tauriFsKv.ts src/data/createRepository.ts src/App.tsx
git commit -m "feat(desktop): runtime CalDAV repository wiring"
```

---

## Task 17 [DESKTOP]: Settings UI + end-to-end iCloud test

**Files:**
- Modify: `src/features/settings/Settings.tsx` (+ its css)

- [ ] **Step 1: Build the connection section**

Add a "Calendar account" section: radio Local / iCloud; for iCloud, fields Apple ID + app-specific password, a "Test & connect" button that saves the password via `credentials.save`, runs `client.discover()`, shows the calendar picker, and on success calls `useConnectionStore.getState().setCalDav({...})`. Errors render inline.

- [ ] **Step 2: End-to-end manual test (document results in the spec)**

With a real Apple ID:
1. Connect iCloud, pick a calendar → existing iCloud events appear in Open Calendar.
2. Create an event in Open Calendar → appears in iCloud / iPhone native Calendar.
3. Edit it on iPhone → reload in app → change appears.
4. Delete in app → disappears from iCloud.
5. Kill network → reload → cached events still render (read-offline).

- [ ] **Step 3: Commit**

```bash
git add src/features/settings
git commit -m "feat(desktop): iCloud connection settings + e2e verified"
```

---

## Self-review

- **Spec coverage:** `CalDavRepository` (T7–8), iCloud auth/app-password (T13,15,17), two-way CRUD (T6–8), runtime selection (T9,16,17), local cache + offline read (T4,7), keychain (T15), mapping incl. `X-OPENCAL-MINIMAP` (T2–3), transport/CORS via Tauri (T12–13), error handling incl. `412`/offline (T6–8), tests (T2–11), read→write build order (T7 before T8; spike T13 first among desktop) — all mapped.
- **Deferred per spec (non-goals):** offline editing, Google, MCP wiring, web-over-CalDAV — not in any task. Correct.
- **Type consistency:** `DavTransport`, `CalDavConfig`, `CalDavSnapshot`, `SnapshotEntry`, `EventClient`, `KvStore`, `CalDavCache`, `CalDavClient`, `CalDavRepository`, `PreconditionFailed` used consistently across tasks.
- **Risk note:** Task 13 spike gates the desktop half; if custom verbs fail, the documented `reqwest` fallback applies before T14+.
