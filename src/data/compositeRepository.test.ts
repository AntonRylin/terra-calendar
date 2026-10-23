import { describe, it, expect } from 'vitest';
import { CompositeRepository, type CompositeAccount } from './compositeRepository';
import type { EventRepository } from './repository';
import type { CalendarEvent } from '../core/types';

function event(id: string, calendarUrls: string[], updatedAt = '2026-06-01T00:00:00Z'): CalendarEvent {
  return { id, title: id, date: '2026-06-01', recurrence: null, calendarUrls, createdAt: updatedAt, updatedAt };
}

/** A fake account repo that records what it was asked to save. */
function fakeAccount(calendars: string[], initial: CalendarEvent[] = []): {
  account: CompositeAccount;
  saved: CalendarEvent[][];
} {
  const saved: CalendarEvent[][] = [];
  const repo: EventRepository = {
    load: async () => ({ events: initial }),
    saveAll: async (events) => { saved.push(events); },
  };
  return { account: { repo, calendars: new Set(calendars) }, saved };
}

const APPLE = 'https://apple/main';
const GOOGLE = 'https://google/main';

describe('CompositeRepository.load', () => {
  it('merges the same event coming from two accounts, unioning calendarUrls', async () => {
    const a = fakeAccount([APPLE], [event('e1', [APPLE])]);
    const g = fakeAccount([GOOGLE], [event('e1', [GOOGLE])]);
    const repo = new CompositeRepository([a.account, g.account], () => []);

    const { events } = await repo.load();
    expect(events).toHaveLength(1);
    expect(events[0].calendarUrls?.sort()).toEqual([APPLE, GOOGLE].sort());
  });

  it('keeps the most recently edited copy as canonical content', async () => {
    const a = fakeAccount([APPLE], [{ ...event('e1', [APPLE], '2026-06-01T00:00:00Z'), title: 'old' }]);
    const g = fakeAccount([GOOGLE], [{ ...event('e1', [GOOGLE], '2026-06-05T00:00:00Z'), title: 'new' }]);
    const repo = new CompositeRepository([a.account, g.account], () => []);

    const { events } = await repo.load();
    expect(events[0].title).toBe('new');
  });

  it('surfaces an offline warning from any account', async () => {
    const a = fakeAccount([APPLE]);
    a.account.repo.load = async () => ({ events: [], warning: 'Offline — showing cached events.' });
    const repo = new CompositeRepository([a.account], () => []);
    expect((await repo.load()).warning).toMatch(/Offline/);
  });
});

describe('CompositeRepository.saveAll', () => {
  it('projects each event onto the owning account, filtering calendarUrls', async () => {
    const a = fakeAccount([APPLE]);
    const g = fakeAccount([GOOGLE]);
    const repo = new CompositeRepository([a.account, g.account], () => []);

    // One event living in both calendars.
    await repo.saveAll([event('e1', [APPLE, GOOGLE])]);

    expect(a.saved[0]).toHaveLength(1);
    expect(a.saved[0][0].calendarUrls).toEqual([APPLE]);
    expect(g.saved[0][0].calendarUrls).toEqual([GOOGLE]);
  });

  it('assigns default write targets to new events without calendarUrls', async () => {
    const a = fakeAccount([APPLE]);
    const g = fakeAccount([GOOGLE]);
    const repo = new CompositeRepository([a.account, g.account], () => [APPLE, GOOGLE]);

    const e = event('e1', []);
    e.calendarUrls = undefined;
    await repo.saveAll([e]);

    expect(a.saved[0][0].calendarUrls).toEqual([APPLE]);
    expect(g.saved[0][0].calendarUrls).toEqual([GOOGLE]);
  });

  it('excludes an account entirely when no event targets its calendars', async () => {
    const a = fakeAccount([APPLE]);
    const g = fakeAccount([GOOGLE]);
    const repo = new CompositeRepository([a.account, g.account], () => []);

    await repo.saveAll([event('e1', [APPLE])]);
    expect(a.saved[0]).toHaveLength(1);
    expect(g.saved[0]).toHaveLength(0); // Google still gets an (empty) saveAll → prunes its copies.
  });
});
