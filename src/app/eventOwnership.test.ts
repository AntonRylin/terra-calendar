import { describe, it, expect, beforeEach } from 'vitest';
import type { CalendarEvent } from '../core/types';
import type { CalDavConfig } from '../data/caldav/types';
import { useConnectionStore } from './connectionStore';
import { eventOwnership } from './eventOwnership';

const MINE = 'https://caldav.icloud.com/a/main';
const ANNAS = 'https://caldav.icloud.com/a/annas-family';

const ev = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', title: 'Dentist', date: '2026-08-20', recurrence: null,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', ...extra,
} as CalendarEvent);

function connect(annas: { shared?: boolean; readOnly?: boolean }) {
  const config: CalDavConfig = {
    serverUrl: 'https://caldav.icloud.com',
    username: 'me@icloud.com',
    calendars: [
      { url: MINE, displayName: 'Main', enabled: true },
      { url: ANNAS, displayName: 'Family (Anna)', enabled: true, ...annas },
    ],
  };
  useConnectionStore.getState().setCalDav(config);
}

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({ caldav: undefined, google: undefined });
});

describe('eventOwnership', () => {
  it('treats an event with no connected accounts as the user’s own', () => {
    expect(eventOwnership(ev({ calendarUrls: [ANNAS] }))).toMatchObject({ foreign: false });
  });

  it('flags an event on a writable shared calendar as foreign but editable', () => {
    connect({ shared: true });
    expect(eventOwnership(ev({ calendarUrls: [ANNAS] }))).toMatchObject({
      foreign: true,
      readOnly: false,
      calendarName: 'Family (Anna)',
    });
  });

  it('flags an event on a view-only shared calendar as read-only', () => {
    connect({ shared: true, readOnly: true });
    expect(eventOwnership(ev({ calendarUrls: [ANNAS] }))).toMatchObject({
      foreign: true,
      readOnly: true,
    });
  });

  it('leaves the user’s own events alone', () => {
    connect({ shared: true });
    expect(eventOwnership(ev({ calendarUrls: [MINE] }))).toMatchObject({ foreign: false });
  });

  it('treats an event that ALSO lives on an owned calendar as the user’s own', () => {
    connect({ shared: true, readOnly: true });
    // The user has their own copy; blocking edits would lock them out of it.
    expect(eventOwnership(ev({ calendarUrls: [ANNAS, MINE] }))).toMatchObject({ foreign: false });
  });

  it('treats a purely local event as the user’s own', () => {
    connect({ shared: true });
    expect(eventOwnership(ev())).toMatchObject({ foreign: false });
  });
});
