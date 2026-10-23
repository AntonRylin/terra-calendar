import { describe, it, expect, vi } from 'vitest';
import type { CalendarEvent } from '../../core/types';
import type { EventRepository } from '../repository';
import { CalDavAccountStore } from './calDavAccountStore';

const ev = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-01-01', updatedAt: '2026-01-01T00:00:00Z', ...extra,
} as CalendarEvent);

function fakeInner() {
  const saved: CalendarEvent[][] = [];
  const repo: EventRepository = {
    load: vi.fn(async () => ({ events: [] })),
    saveAll: vi.fn(async (events: CalendarEvent[]) => { saved.push(events); }),
  };
  return { repo, saved };
}

describe('CalDavAccountStore', () => {
  it('assigns the account default to events not already in this account', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    await store.saveAll([ev('a')]); // no calendarUrls → gets default
    expect(saved[0][0].calendarUrls).toEqual(['ic/cal1']);
  });

  it('keeps an event placed in one of this account calendars', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1', 'ic/cal2']), 'ic/cal1');
    await store.saveAll([ev('a', { calendarUrls: ['ic/cal2', 'g/other'] })]);
    expect(saved[0][0].calendarUrls).toEqual(['ic/cal2']); // foreign url dropped, own kept
  });

  it('never writes tasks to CalDAV', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    await store.saveAll([ev('a'), ev('t', { isTask: true })]);
    expect(saved[0].map((e) => e.id)).toEqual(['a']);
  });

  it('does not upload a legacy dateless record or claim it is stored on the server', async () => {
    const { repo, saved } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    const legacy = ev('legacy', { date: '' });
    await store.saveAll([legacy, ev('valid')]);
    expect(store.holds(legacy)).toBe(false);
    expect(saved[0].map((e) => e.id)).toEqual(['valid']);
  });

  it('delegates load', async () => {
    const { repo } = fakeInner();
    const store = new CalDavAccountStore(repo, new Set(['ic/cal1']), 'ic/cal1');
    await store.load();
    expect(repo.load).toHaveBeenCalled();
  });

  describe('calendars shared with the user', () => {
    // The Google account, with a calendar Anna shared into the user's Apple account.
    const googleOwn = new Set(['g/mine']);
    const foreign = new Set(['ic/annas-family']);

    it('does not copy another account\'s shared event into this account', async () => {
      const { repo, saved } = fakeInner();
      const store = new CalDavAccountStore(repo, googleOwn, 'g/mine', foreign);
      await store.saveAll([ev('mine'), ev('annas', { calendarUrls: ['ic/annas-family'] })]);
      // Without this rule Anna's whole calendar lands in the user's Google account.
      expect(saved[0].map((e) => e.id)).toEqual(['mine']);
    });

    it('still replicates the user\'s own event from another account', async () => {
      const { repo, saved } = fakeInner();
      const store = new CalDavAccountStore(repo, googleOwn, 'g/mine', foreign);
      await store.saveAll([ev('a', { calendarUrls: ['ic/my-own-cal'] })]);
      expect(saved[0][0].calendarUrls).toEqual(['g/mine']);
    });

    it('writes a shared event back in place when it lives in THIS account', async () => {
      const { repo, saved } = fakeInner();
      const store = new CalDavAccountStore(
        repo, new Set(['ic/mine', 'ic/annas-family']), 'ic/mine', foreign,
      );
      await store.saveAll([ev('annas', { calendarUrls: ['ic/annas-family'] })]);
      // Rescheduling a shared appointment must update the OWNER's copy, not
      // create a duplicate on the user's own calendar.
      expect(saved[0][0].calendarUrls).toEqual(['ic/annas-family']);
    });

    it('treats an event that also lives on an owned calendar as the user\'s own', async () => {
      const { repo, saved } = fakeInner();
      const store = new CalDavAccountStore(repo, googleOwn, 'g/mine', foreign);
      await store.saveAll([ev('a', { calendarUrls: ['ic/annas-family', 'g/mine'] })]);
      expect(saved[0][0].calendarUrls).toEqual(['g/mine']);
    });

    it('drops events when the account has no owned writable calendar', async () => {
      const { repo, saved } = fakeInner();
      // An account holding ONLY a read-only share has nowhere to write.
      const store = new CalDavAccountStore(repo, new Set(['ic/annas-family']), '', foreign);
      await store.saveAll([ev('a')]);
      expect(saved[0]).toEqual([]);
    });

    it('holds() agrees with saveAll for every case', async () => {
      const { repo, saved } = fakeInner();
      const store = new CalDavAccountStore(repo, googleOwn, 'g/mine', foreign);
      const events = [
        ev('own'),
        ev('task', { isTask: true }),
        ev('annas', { calendarUrls: ['ic/annas-family'] }),
        ev('elsewhere', { calendarUrls: ['ic/my-own-cal'] }),
      ];
      await store.saveAll(events);
      // The sync baseline is written from holds(); if it disagreed with what
      // saveAll actually persisted, the next pass would read the difference as
      // a deletion and propagate it to the owner's server.
      expect(events.filter((e) => store.holds(e)).map((e) => e.id))
        .toEqual(saved[0].map((e) => e.id));
    });
  });
});
