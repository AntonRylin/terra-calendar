import { LocalStorageRepository, STORAGE_KEY, BACKUP_KEY } from './localStorageRepository';
import { serializeStore } from './storeFile';
import type { CalendarEvent } from '../core/types';

const event: CalendarEvent = {
  id: 'abc',
  title: 'Dentist',
  date: '2026-06-12',
  recurrence: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

beforeEach(() => localStorage.clear());

describe('LocalStorageRepository', () => {
  it('loads empty on first run', async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.load()).toEqual({ events: [] });
  });

  it('round-trips events', async () => {
    const repo = new LocalStorageRepository();
    await repo.saveAll([event]);
    expect((await repo.load()).events).toEqual([event]);
  });

  it('backs up corrupt data, starts fresh, and warns', async () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt');
    const repo = new LocalStorageRepository();
    const result = await repo.load();
    expect(result.events).toEqual([]);
    expect(result.warning).toContain('backup');
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{corrupt');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps valid data intact', async () => {
    localStorage.setItem(STORAGE_KEY, serializeStore([event]));
    const repo = new LocalStorageRepository();
    const result = await repo.load();
    expect(result.warning).toBeUndefined();
    expect(result.events).toEqual([event]);
  });
});
