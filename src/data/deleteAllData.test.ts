import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appDataKeys, deleteAllData, DELETE_ALL_PHRASE } from './deleteAllData';
import { useCalendarStore } from '../app/store';
import { useConnectionStore } from '../app/connectionStore';
import type { CalendarEvent } from '../core/types';

const event = (id: string): CalendarEvent => ({
  id,
  date: '2026-07-18',
  title: id,
  recurrence: null,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
});

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({ caldav: undefined, google: undefined });
});

describe('appDataKeys', () => {
  it('collects open-calendar and upcoming_ keys, sparing everything else', () => {
    localStorage.setItem('open-calendar.settings', '{}');
    localStorage.setItem('open-calendar.store', '[]');
    localStorage.setItem('upcoming_density', 'compact');
    localStorage.setItem('sb-auth-token', 'keep');
    localStorage.setItem('unrelated', 'keep');
    expect(appDataKeys(localStorage).sort()).toEqual([
      'open-calendar.settings',
      'open-calendar.store',
      'upcoming_density',
    ]);
  });
});

describe('deleteAllData', () => {
  it('everywhere: deletes every event through the store, then wipes and reloads', async () => {
    const deleteEvents = vi.fn().mockResolvedValue(undefined);
    useCalendarStore.setState({ events: [event('a'), event('b')], deleteEvents });
    localStorage.setItem('open-calendar.settings', '{}');
    localStorage.setItem('sb-auth-token', 'keep');
    const reload = vi.fn();

    await deleteAllData('everywhere', reload);

    expect(deleteEvents).toHaveBeenCalledWith(['a', 'b']);
    expect(localStorage.getItem('open-calendar.settings')).toBeNull();
    expect(localStorage.getItem('sb-auth-token')).toBe('keep');
    expect(reload).toHaveBeenCalled();
  });

  it('local-only: never deletes events through the repository', async () => {
    const deleteEvents = vi.fn().mockResolvedValue(undefined);
    useCalendarStore.setState({ events: [event('a')], deleteEvents });
    localStorage.setItem('open-calendar.store', '[]');
    const reload = vi.fn();

    await deleteAllData('local-only', reload);

    expect(deleteEvents).not.toHaveBeenCalled();
    expect(localStorage.getItem('open-calendar.store')).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it('clears the connection config for connected accounts', async () => {
    useConnectionStore.setState({
      caldav: { serverUrl: 'https://caldav.example', username: 'a@b.c', calendars: [] },
    } as never);
    const reload = vi.fn();

    await deleteAllData('local-only', reload);

    expect(useConnectionStore.getState().caldav).toBeUndefined();
    expect(reload).toHaveBeenCalled();
  });
});

describe('DELETE_ALL_PHRASE', () => {
  it('is the documented confirmation phrase', () => {
    expect(DELETE_ALL_PHRASE).toBe('DELETE ALL MY DATA');
  });
});
