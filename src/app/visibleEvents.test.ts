import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CalendarEvent } from '../core/types';
import { useCalendarStore } from './store';
import { useSharedEventsStore } from './sharedEventsStore';
import { useVisibleEvent, useVisibleEvents } from './visibleEvents';

const ev = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-08-20', recurrence: null,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', ...extra,
} as CalendarEvent);

beforeEach(() => {
  useCalendarStore.setState({ events: [] });
  useSharedEventsStore.setState({ events: [] });
});

describe('useVisibleEvents', () => {
  it('returns own events untouched when nothing is shared', () => {
    useCalendarStore.setState({ events: [ev('a')] });
    const { result } = renderHook(() => useVisibleEvents());
    expect(result.current.map((e) => e.id)).toEqual(['a']);
  });

  it('merges events received from a share', () => {
    useCalendarStore.setState({ events: [ev('mine')] });
    useSharedEventsStore.setState({ events: [ev('annas', { sharedBy: 'Anna' })] });
    const { result } = renderHook(() => useVisibleEvents());
    expect(result.current.map((e) => e.id).sort()).toEqual(['annas', 'mine']);
  });

  it('prefers the user’s own copy when both sets carry the same id', () => {
    // The shared projection may be redacted to "Busy"; the owner's own copy is
    // the real thing and must win.
    useCalendarStore.setState({ events: [ev('x', { title: 'Dentist' })] });
    useSharedEventsStore.setState({ events: [ev('x', { title: 'Busy', sharedBy: 'Anna' })] });
    const { result } = renderHook(() => useVisibleEvents());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].title).toBe('Dentist');
  });

  it('keeps shared events out of the calendar store', () => {
    useSharedEventsStore.setState({ events: [ev('annas', { sharedBy: 'Anna' })] });
    renderHook(() => useVisibleEvents());
    // The sync engine saves whatever is in this store — to the local file AND to
    // the user's connected iCloud/Google accounts. Someone else's events must
    // never end up there.
    expect(useCalendarStore.getState().events).toEqual([]);
  });
});

describe('useVisibleEvent', () => {
  it('finds an event in either set', () => {
    useCalendarStore.setState({ events: [ev('mine')] });
    useSharedEventsStore.setState({ events: [ev('annas', { sharedBy: 'Anna' })] });
    expect(renderHook(() => useVisibleEvent('mine')).result.current?.id).toBe('mine');
    expect(renderHook(() => useVisibleEvent('annas')).result.current?.id).toBe('annas');
    expect(renderHook(() => useVisibleEvent('nope')).result.current).toBeUndefined();
  });
});
