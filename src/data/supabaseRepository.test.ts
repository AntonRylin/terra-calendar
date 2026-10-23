import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '../core/types';

// A chainable fake of the supabase client that records upsert/delete calls.
const calls = { upserts: [] as unknown[][], deletes: [] as { ids?: string[] }[] };
let rows: Record<string, unknown>[] = [];
let selectError: { message: string } | null = null;

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from() {
      return {
        select: async () => (selectError ? { data: null, error: selectError } : { data: rows, error: null }),
        upsert(r: unknown[]) {
          calls.upserts.push(r);
          return Promise.resolve({ error: null });
        },
        delete() {
          const op: { ids?: string[] } = {};
          calls.deletes.push(op);
          const chain = {
            eq: () => chain,
            in: (_col: string, ids: string[]) => {
              op.ids = ids;
              return Promise.resolve({ error: null });
            },
            then: (res: (v: { error: null }) => void) => res({ error: null }),
          };
          return chain;
        },
      };
    },
  };
}
vi.mock('./supabaseClient', () => ({ getSupabase: () => makeClient() }));

import { SupabaseRepository } from './supabaseRepository';

const evA: CalendarEvent = { id: 'a', title: 'A', date: '2026-06-01', recurrence: null, createdAt: '', updatedAt: 't1' };
const evB: CalendarEvent = { id: 'b', title: 'B', date: '', isTask: true, recurrence: null, createdAt: '', updatedAt: 't1' };

describe('SupabaseRepository snapshot-diff', () => {
  beforeEach(() => {
    calls.upserts = [];
    calls.deletes = [];
    rows = [];
    selectError = null;
  });

  it('load THROWS on a failed read (offline) so the sync engine skips the store', async () => {
    // supabase-js reports network failures via `error` (it does not reject);
    // returning [] instead would read as "everything deleted in the cloud".
    selectError = { message: 'TypeError: Failed to fetch' };
    await expect(new SupabaseRepository().load()).rejects.toThrow(/Failed to fetch/);
  });

  it('round-trips all fields incl. tasks/spans/overrides', async () => {
    const full: CalendarEvent = {
      id: 'x', title: 'X', date: '2026-06-01', endDate: '2026-06-03', type: 'holiday',
      dayOverrides: { '2026-06-02': { time: '09:00' } }, isTask: undefined,
      time: '10:00', endTime: '11:30', tz: 'UTC', recurrence: { unit: 'week', interval: 1 },
      exdates: ['2026-06-08'], color: '#fff', cosmetic: 'aurora',
      showOnMinimap: false, showInUpcoming: true, calendarUrls: ['u'],
      reminders: [{ value: 5, unit: 'minutes' }], createdAt: 'c', updatedAt: 'u',
    };
    const repo = new SupabaseRepository();
    await repo.saveAll([full]);
    const row = calls.upserts[0][0] as Record<string, unknown>;
    expect(row.end_date).toBe('2026-06-03');
    expect(row.type).toBe('holiday');
    expect(row.day_overrides).toEqual({ '2026-06-02': { time: '09:00' } });
    expect(row.end_time).toBe('11:30');
    expect(row.show_in_upcoming).toBe(true);
    expect(row.calendar_urls).toEqual(['u']);
    // Reading it back maps snake_case → camelCase.
    rows = [row];
    const { events } = await new SupabaseRepository().load();
    expect(events[0].endDate).toBe('2026-06-03');
    expect(events[0].endTime).toBe('11:30');
    expect(events[0].type).toBe('holiday');
    expect(events[0].showInUpcoming).toBe(true);
    expect(events[0].calendarUrls).toEqual(['u']);
  });

  it('upserts only changed rows and never deletes unseen rows', async () => {
    rows = [{ id: 'a', user_id: 'u1', title: 'A', date: '2026-06-01', created_at: '', updated_at: 't1' }];
    const repo = new SupabaseRepository();
    await repo.load(); // snapshot = { a@t1 }
    calls.upserts = [];
    await repo.saveAll([{ ...evA }, { ...evB }]);
    // Only 'b' is new/changed → upserted; 'a' unchanged → not upserted.
    const upsertedIds = (calls.upserts[0] as Record<string, unknown>[]).map((r) => r.id);
    expect(upsertedIds).toEqual(['b']);
    // No deletes: nothing left the snapshot.
    expect(calls.deletes.every((d) => !d.ids || d.ids.length === 0)).toBe(true);
  });

  it('deletes an id that left the snapshot (a real local delete)', async () => {
    rows = [{ id: 'a', user_id: 'u1', title: 'A', date: '2026-06-01', created_at: '', updated_at: 't1' }];
    const repo = new SupabaseRepository();
    await repo.load(); // snapshot = { a }
    await repo.saveAll([]); // 'a' removed locally
    expect(calls.deletes.some((d) => d.ids?.includes('a'))).toBe(true);
  });
});
