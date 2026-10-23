import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '../../core/types';
import type { EventRepository } from '../repository';
import { UnifiedRepository, type SyncStore } from './unifiedRepository';

const ev = (id: string, updatedAt = '2026-01-01T00:00:00Z', extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-01-01', updatedAt, ...extra,
} as CalendarEvent);

function memStore(id: string, kind: SyncStore['kind'], initial: CalendarEvent[] = [], opts: { failLoad?: boolean; failSave?: boolean } = {}): SyncStore & { contents: CalendarEvent[] } {
  const state = { contents: initial };
  const repo: EventRepository = {
    load: vi.fn(async () => { if (opts.failLoad) throw new Error('offline'); return { events: [...state.contents] }; }),
    saveAll: vi.fn(async (events: CalendarEvent[]) => { if (opts.failSave) throw new Error('write fail'); state.contents = [...events]; }),
  };
  return { id, kind, repo, get contents() { return state.contents; } };
}

describe('UnifiedRepository', () => {
  beforeEach(() => localStorage.clear());

  it('load merges stores and propagates to each (first sync)', async () => {
    const local = memStore('local', 'local', []);
    const apple = memStore('apple', 'caldav', [ev('a')]);
    const repo = new UnifiedRepository([local, apple], 'local', null);
    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['a']);
    expect(local.contents.map((e) => e.id)).toEqual(['a']); // propagated into local
  });

  it('propagates a delete: gone from apple (in baseline) → removed from local', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const apple = memStore('apple', 'caldav', [ev('a')]);
    const repo = new UnifiedRepository([local, apple], 'local', null);
    await repo.load();                       // baseline now has a in [local, apple]
    apple.contents.splice(0, 1);             // user deletes a in iCloud
    const { events } = await repo.load();
    expect(events).toEqual([]);
    expect(local.contents).toEqual([]);      // delete propagated to local
  });

  it('a failed remote read is skipped, never a deletion', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const apple = memStore('apple', 'caldav', [ev('a')], { failLoad: true });
    const repo = new UnifiedRepository([local, apple], 'local', null);
    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['a']); // a survives despite apple offline
  });

  it('a cached CalDAV fallback is excluded, so an empty cache never deletes local events', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const apple = memStore('apple', 'caldav', [ev('a')]);
    const repo = new UnifiedRepository([local, apple], 'local', null);
    await repo.load();
    apple.repo.load = async () => ({ events: [], warning: 'Offline — HTTP failed' });
    const { events, warning } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['a']);
    expect(local.contents.map((e) => e.id)).toEqual(['a']);
    expect(warning).toBeTruthy();
  });

  it('keeps an offline account in the baseline so a later local deletion does not resurrect', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const opts = { failLoad: false, failSave: false };
    const apple = memStore('apple', 'caldav', [ev('a')], opts);
    const repo = new UnifiedRepository([local, apple], 'local', null);
    await repo.load();
    opts.failLoad = true;
    opts.failSave = true;
    await repo.load();
    await repo.saveAll([]);
    opts.failLoad = false;
    opts.failSave = false;
    const { events } = await repo.load();
    expect(events).toEqual([]);
    expect(apple.contents).toEqual([]);
  });

  it('a failed remote WRITE is not later mistaken for a deletion', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const supa = memStore('supabase', 'supabase', [], { failSave: true }); // propagation to supabase fails
    const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
    await repo.load();                        // tries a→supabase, fails; baseline must NOT record supabase
    const { events } = await repo.load();     // a must survive (not seen as deleted-from-supabase)
    expect(events.map((e) => e.id)).toEqual(['a']);
  });

  it('an event added while a remote store was unreachable syncs up on the next load', async () => {
    const local = memStore('local', 'local', []);
    const opts = { failLoad: true, failSave: true };
    const supa = memStore('supabase', 'supabase', [], opts);
    const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
    await repo.saveAll([ev('a')]);            // offline: only local persists
    expect(local.contents.map((e) => e.id)).toEqual(['a']);
    expect(supa.contents).toEqual([]);
    opts.failLoad = false;                    // back online
    opts.failSave = false;
    await repo.load();                        // startup / reconnect sync
    expect(supa.contents.map((e) => e.id)).toEqual(['a']); // pushed to the cloud
  });

  it('an event deleted while a remote store was unreachable stays deleted (no resurrection)', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const opts = { failLoad: false, failSave: false };
    const supa = memStore('supabase', 'supabase', [ev('a')], opts);
    const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
    await repo.load();                        // baseline: a in [local, supabase]
    opts.failLoad = true;                     // network drops
    opts.failSave = true;
    await repo.saveAll([]);                   // user deletes a while offline
    opts.failLoad = false;                    // back online — supabase still has a
    opts.failSave = false;
    const { events } = await repo.load();
    expect(events).toEqual([]);               // a does NOT resurrect…
    expect(supa.contents).toEqual([]);        // …and the delete propagated to the cloud
  });

  it('a deletion read from one store still propagates to a store whose write failed', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const apple = memStore('apple', 'caldav', [ev('a')]);
    const opts = { failLoad: false, failSave: false };
    const supa = memStore('supabase', 'supabase', [ev('a')], opts);
    const repo = new UnifiedRepository([local, apple, supa], 'local', 'supabase');
    await repo.load();                        // baseline: a everywhere
    apple.contents.splice(0, 1);              // deleted in iCloud
    opts.failSave = true;                     // supabase can't take the delete yet
    await repo.load();
    opts.failSave = false;
    const { events } = await repo.load();     // supabase reachable again, still has a
    expect(events).toEqual([]);               // deletion held, not resurrected
    expect(supa.contents).toEqual([]);
  });

  it('reports a warning when a remote store is unreachable', async () => {
    const local = memStore('local', 'local', [ev('a')]);
    const supa = memStore('supabase', 'supabase', [], { failLoad: true });
    const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
    const { warning } = await repo.load();
    expect(warning).toMatch(/Sync unavailable/);
  });

  it('saveAll writes to every store; CalDAV gets no tasks', async () => {
    const local = memStore('local', 'local', []);
    const apple = memStore('apple', 'caldav', []);
    const supa = memStore('supabase', 'supabase', []);
    const repo = new UnifiedRepository([local, apple, supa], 'local', 'supabase');
    await repo.saveAll([ev('a'), ev('t', '2026-01-01T00:00:00Z', { isTask: true })]);
    expect(local.contents.map((e) => e.id).sort()).toEqual(['a', 't']);
    expect(supa.contents.map((e) => e.id).sort()).toEqual(['a', 't']);
    expect(apple.contents.map((e) => e.id)).toEqual(['a']); // task excluded
  });

  describe('stores that decline events (shared calendars)', () => {
    /** A store that refuses everything owned by someone else. */
    function declining(id: string, kind: SyncStore['kind']) {
      const s = memStore(id, kind, []);
      return { ...s, holds: (e: CalendarEvent) => e.id !== 'annas', get contents() { return s.contents; } };
    }

    it('does not hand a declined event to the store', async () => {
      const local = memStore('local', 'local', []);
      const supa = declining('supabase', 'supabase');
      const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
      await repo.saveAll([ev('mine'), ev('annas')]);
      expect(supa.contents.map((e) => e.id)).toEqual(['mine']);
      expect(local.contents.map((e) => e.id).sort()).toEqual(['annas', 'mine']);
    });

    it('a declined event is never later read as a deletion', async () => {
      // The baseline records which stores hold which events. If a store were
      // recorded as holding an event it had actually declined, the next pass
      // would see it missing there, infer a deletion, and wipe the event from
      // every store — on a shared calendar, from its owner's server.
      const local = memStore('local', 'local', []);
      const supa = declining('supabase', 'supabase');
      const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
      await repo.saveAll([ev('mine'), ev('annas')]);

      const { events } = await repo.load();
      expect(events.map((e) => e.id).sort()).toEqual(['annas', 'mine']);
      expect(local.contents.map((e) => e.id).sort()).toEqual(['annas', 'mine']);
    });

    it('still infers a real deletion for events the store does hold', async () => {
      const local = memStore('local', 'local', []);
      const supa = declining('supabase', 'supabase');
      const repo = new UnifiedRepository([local, supa], 'local', 'supabase');
      await repo.saveAll([ev('mine'), ev('annas')]);
      supa.contents.splice(0, 1); // 'mine' deleted on another device
      const { events } = await repo.load();
      expect(events.map((e) => e.id)).toEqual(['annas']);
    });
  });
});
