import { describe, it, expect } from 'vitest';
import { MultiCalendarRepository, type EventClient } from './multiCalendarRepository';
import type { CalendarEvent } from '../core/types';

function memoryKv() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => { m.set(k, v); } };
}

function ics(uid: string, day: string, modified = `${day}T000000Z`): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `UID:${uid}`, `SUMMARY:${uid}`, `DTSTART;VALUE=DATE:${day}`,
    `CREATED:${day}T000000Z`, `LAST-MODIFIED:${modified}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

interface Call { op: string; url?: string; href?: string; }

function fakeClient(perCalendar: Record<string, Array<{ href: string; etag: string; ics: string }>>) {
  const calls: Call[] = [];
  const client: EventClient = {
    listEventsForCalendar: async (url) => {
      calls.push({ op: 'list', url });
      return perCalendar[url] ?? [];
    },
    putNewEvent: async (url, uid) => {
      calls.push({ op: 'create', url, href: `${url}/${uid}.ics` });
      return { etag: '"new"', href: `${url}/${uid}.ics` };
    },
    putEventByPath: async (href) => {
      calls.push({ op: 'update', href });
      return '"upd"';
    },
    deleteEvent: async (href) => {
      calls.push({ op: 'delete', href });
    },
  };
  return { client, calls };
}

const CAL_A = 'https://x/a';
const CAL_B = 'https://x/b';

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1', title: 'E1', date: '2026-06-01', recurrence: null,
    createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('MultiCalendarRepository.load', () => {
  it('merges the same UID found in two calendars into one event', async () => {
    const { client } = fakeClient({
      [CAL_A]: [{ href: `${CAL_A}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"b"', ics: ics('e1', '20260601') }],
    });
    const repo = new MultiCalendarRepository(client, memoryKv(), 'acct', [CAL_A, CAL_B]);

    const { events } = await repo.load();
    expect(events).toHaveLength(1);
    expect(events[0].calendarUrls?.sort()).toEqual([CAL_A, CAL_B]);
  });
});

describe('MultiCalendarRepository.saveAll', () => {
  it('creates a copy in every calendar of a new event', async () => {
    const { client, calls } = fakeClient({});
    const repo = new MultiCalendarRepository(client, memoryKv(), 'acct', [CAL_A, CAL_B]);
    await repo.load();

    await repo.saveAll([event({ calendarUrls: [CAL_A, CAL_B] })]);
    const creates = calls.filter((c) => c.op === 'create').map((c) => c.url);
    expect(creates.sort()).toEqual([CAL_A, CAL_B]);
  });

  it('deletes the copy from a calendar removed from calendarUrls', async () => {
    const { client, calls } = fakeClient({
      [CAL_A]: [{ href: `${CAL_A}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"b"', ics: ics('e1', '20260601') }],
    });
    const repo = new MultiCalendarRepository(client, memoryKv(), 'acct', [CAL_A, CAL_B]);
    const { events } = await repo.load();

    // Keep only CAL_A; content unchanged (same updatedAt) so no re-PUT.
    await repo.saveAll([{ ...events[0], calendarUrls: [CAL_A] }]);
    expect(calls.filter((c) => c.op === 'delete').map((c) => c.href)).toEqual([`${CAL_B}/e1.ics`]);
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('adds a copy to a newly-selected calendar for an existing event', async () => {
    const { client, calls } = fakeClient({
      [CAL_A]: [{ href: `${CAL_A}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
    });
    const repo = new MultiCalendarRepository(client, memoryKv(), 'acct', [CAL_A, CAL_B]);
    const { events } = await repo.load();

    await repo.saveAll([{ ...events[0], calendarUrls: [CAL_A, CAL_B], updatedAt: '2026-06-02T00:00:00Z' }]);
    expect(calls.filter((c) => c.op === 'create').map((c) => c.url)).toEqual([CAL_B]);
    // Content changed → the retained CAL_A copy is updated.
    expect(calls.filter((c) => c.op === 'update').map((c) => c.href)).toEqual([`${CAL_A}/e1.ics`]);
  });

  it('deletes every copy when an event is removed entirely', async () => {
    const { client, calls } = fakeClient({
      [CAL_A]: [{ href: `${CAL_A}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"b"', ics: ics('e1', '20260601') }],
    });
    const repo = new MultiCalendarRepository(client, memoryKv(), 'acct', [CAL_A, CAL_B]);
    await repo.load();

    await repo.saveAll([]);
    expect(calls.filter((c) => c.op === 'delete').map((c) => c.href).sort()).toEqual([
      `${CAL_A}/e1.ics`,
      `${CAL_B}/e1.ics`,
    ]);
  });

  it('serves the cached snapshot when the server is unreachable', async () => {
    const kv = memoryKv();
    const ok = fakeClient({ [CAL_A]: [{ href: `${CAL_A}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }] });
    await new MultiCalendarRepository(ok.client, kv, 'acct', [CAL_A]).load();

    const failing: EventClient = {
      listEventsForCalendar: async () => { throw new Error('network down'); },
      putNewEvent: async () => ({ etag: '', href: '' }),
      putEventByPath: async () => '',
      deleteEvent: async () => {},
    };
    const { events, warning } = await new MultiCalendarRepository(failing, kv, 'acct', [CAL_A]).load();
    expect(events.map((e) => e.id)).toEqual(['e1']);
    expect(warning).toMatch(/Offline/);
  });

  describe('read-only (shared) calendars', () => {
    // CAL_B is a calendar a family member shared read-only.
    const readOnly = new Set([CAL_B]);

    function repoWithReadOnlyB(client: EventClient, kv = memoryKv()) {
      return new MultiCalendarRepository(client, kv, 'acct', [CAL_A, CAL_B], readOnly);
    }

    it('reads events from a read-only calendar', async () => {
      const { client } = fakeClient({
        [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      });
      const { events } = await repoWithReadOnlyB(client).load();
      expect(events.map((e) => e.id)).toEqual(['e1']);
    });

    it('never updates an event on a read-only calendar', async () => {
      const kv = memoryKv();
      const { client, calls } = fakeClient({
        [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      });
      const repo = repoWithReadOnlyB(client, kv);
      const { events } = await repo.load();
      // Edit the event and save — the server would 403 and the sync would then
      // retry the same failing write on every pass.
      await repo.saveAll([{ ...events[0], title: 'moved', updatedAt: '2026-07-01T00:00:00Z' }]);
      expect(calls.filter((c) => c.op === 'update' || c.op === 'create')).toEqual([]);
    });

    it('never deletes from a read-only calendar', async () => {
      const kv = memoryKv();
      const { client, calls } = fakeClient({
        [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      });
      const repo = repoWithReadOnlyB(client, kv);
      await repo.load();
      await repo.saveAll([]);
      expect(calls.filter((c) => c.op === 'delete')).toEqual([]);
    });

    it('keeps a read-only copy in the snapshot after a local delete', async () => {
      const kv = memoryKv();
      const { client } = fakeClient({
        [CAL_B]: [{ href: `${CAL_B}/e1.ics`, etag: '"a"', ics: ics('e1', '20260601') }],
      });
      const repo = repoWithReadOnlyB(client, kv);
      await repo.load();
      await repo.saveAll([]);
      // The event still exists on the owner's server. Dropping it from the
      // snapshot would make the next load see it as a brand-new creation.
      const { events } = await repo.load();
      expect(events.map((e) => e.id)).toEqual(['e1']);
    });

    it('still writes normally to the writable calendar alongside it', async () => {
      const kv = memoryKv();
      const { client, calls } = fakeClient({});
      const repo = repoWithReadOnlyB(client, kv);
      await repo.load();
      await repo.saveAll([
        { id: 'n1', title: 'mine', date: '2026-06-01', recurrence: null,
          calendarUrls: [CAL_A], createdAt: 'x', updatedAt: 'x' } as CalendarEvent,
      ]);
      expect(calls.filter((c) => c.op === 'create').map((c) => c.url)).toEqual([CAL_A]);
    });
  });
});
