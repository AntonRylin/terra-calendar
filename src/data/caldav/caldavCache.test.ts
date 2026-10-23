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
    const other = new CalDavCache(store, 'other');
    expect(await other.load()).toEqual({ entries: {} });
  });
});
