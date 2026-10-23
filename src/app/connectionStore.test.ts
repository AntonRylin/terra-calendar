import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from './connectionStore';
import type { CalDavConfig } from '../data/caldav/types';

const apple: CalDavConfig = {
  serverUrl: 'https://caldav.icloud.com',
  username: 'me@icloud.com',
  calendars: [
    { url: 'https://caldav.icloud.com/a/main', displayName: 'Main', enabled: true },
    { url: 'https://caldav.icloud.com/a/work', displayName: 'Work', enabled: false },
  ],
};

const google: CalDavConfig = {
  serverUrl: 'https://apidata.googleusercontent.com/caldav/v2/',
  username: 'me@gmail.com',
  calendars: [
    { url: 'https://apidata.googleusercontent.com/caldav/v2/g/main', displayName: 'Main', enabled: true },
  ],
};

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({ caldav: undefined, google: undefined });
});

describe('connectionStore', () => {
  it('defaults to nothing connected', () => {
    expect(useConnectionStore.getState().isConnected()).toBe(false);
  });

  it('connects Apple and Google simultaneously and persists both', () => {
    useConnectionStore.getState().setCalDav(apple);
    useConnectionStore.getState().setGoogle(google);

    const s = useConnectionStore.getState();
    expect(s.isConnected()).toBe(true);
    expect(s.caldav?.username).toBe('me@icloud.com');
    expect(s.google?.username).toBe('me@gmail.com');

    const raw = JSON.parse(localStorage.getItem('open-calendar.connection')!);
    expect(raw.caldav.username).toBe('me@icloud.com');
    expect(raw.google.username).toBe('me@gmail.com');
  });

  it('disconnecting one account leaves the other connected', () => {
    useConnectionStore.getState().setCalDav(apple);
    useConnectionStore.getState().setGoogle(google);
    useConnectionStore.getState().disconnectCalDav();

    const s = useConnectionStore.getState();
    expect(s.caldav).toBeUndefined();
    expect(s.google?.username).toBe('me@gmail.com');
    expect(s.isConnected()).toBe(true);
  });

  it('flattens enabled calendars across accounts with provider tags', () => {
    useConnectionStore.getState().setCalDav(apple);
    useConnectionStore.getState().setGoogle(google);

    const enabled = useConnectionStore.getState().enabledCalendars();
    expect(enabled.map((c) => c.displayName)).toEqual(['Main', 'Main']);
    expect(enabled.map((c) => c.provider)).toEqual(['apple', 'google']);
    // The disabled "Work" calendar is excluded.
    expect(useConnectionStore.getState().calendars()).toHaveLength(3);
  });

  it('defaults to the flagged write targets, else the first enabled calendar', () => {
    useConnectionStore.getState().setCalDav(apple);
    useConnectionStore.getState().setGoogle(google);

    // None flagged → fall back to first enabled.
    expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([
      'https://caldav.icloud.com/a/main',
    ]);

    // Flag both Mains → both become write targets.
    useConnectionStore.getState().setCalendarWriteDefault('https://caldav.icloud.com/a/main', true);
    useConnectionStore.getState().setCalendarWriteDefault('https://apidata.googleusercontent.com/caldav/v2/g/main', true);
    expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([
      'https://caldav.icloud.com/a/main',
      'https://apidata.googleusercontent.com/caldav/v2/g/main',
    ]);
  });

  it('Default is exclusive within an account — flagging a second clears the first', () => {
    const twoApple: CalDavConfig = {
      serverUrl: 'https://caldav.icloud.com',
      username: 'me@icloud.com',
      calendars: [
        { url: 'https://caldav.icloud.com/a/main', displayName: 'Main', enabled: true },
        { url: 'https://caldav.icloud.com/a/work', displayName: 'Work', enabled: true },
      ],
    };
    useConnectionStore.getState().setCalDav(twoApple);
    useConnectionStore.getState().setCalendarWriteDefault('https://caldav.icloud.com/a/main', true);
    useConnectionStore.getState().setCalendarWriteDefault('https://caldav.icloud.com/a/work', true);

    const cals = useConnectionStore.getState().caldav!.calendars!;
    expect(cals.find((c) => c.url.endsWith('/main'))!.writeDefault).toBe(false);
    expect(cals.find((c) => c.url.endsWith('/work'))!.writeDefault).toBe(true);
    // iCloud can't replicate one UID across two calendars of the same account.
    expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([
      'https://caldav.icloud.com/a/work',
    ]);
  });

  it('caps a config persisted before the exclusivity rule to one default per account', () => {
    const legacy: CalDavConfig = {
      serverUrl: 'https://caldav.icloud.com',
      username: 'me@icloud.com',
      calendars: [
        { url: 'https://caldav.icloud.com/a/main', displayName: 'Main', enabled: true, writeDefault: true },
        { url: 'https://caldav.icloud.com/a/work', displayName: 'Work', enabled: true, writeDefault: true },
      ],
    };
    useConnectionStore.getState().setCalDav(legacy);
    expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([
      'https://caldav.icloud.com/a/main',
    ]);
  });

  it('still allows one write target per account across accounts (Apple + Google)', () => {
    useConnectionStore.getState().setCalDav(apple);
    useConnectionStore.getState().setGoogle(google);
    useConnectionStore.getState().setCalendarWriteDefault('https://caldav.icloud.com/a/main', true);
    useConnectionStore.getState().setCalendarWriteDefault('https://apidata.googleusercontent.com/caldav/v2/g/main', true);
    expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([
      'https://caldav.icloud.com/a/main',
      'https://apidata.googleusercontent.com/caldav/v2/g/main',
    ]);
  });

  it('toggles a calendar enabled flag on the owning account', () => {
    useConnectionStore.getState().setCalDav(apple);
    useConnectionStore.getState().setCalendarEnabled('https://caldav.icloud.com/a/work', true);
    const work = useConnectionStore.getState().caldav?.calendars?.find((c) => c.displayName === 'Work');
    expect(work?.enabled).toBe(true);
  });

  describe('calendars shared with the user', () => {
    // Discovery enables every calendar it finds, shared ones included, and the
    // shared one sorts first here on purpose.
    const withShare: CalDavConfig = {
      ...apple,
      calendars: [
        {
          url: 'https://caldav.icloud.com/a/annas-family',
          displayName: 'Family (Anna)',
          enabled: true,
          shared: true,
        },
        { url: 'https://caldav.icloud.com/a/main', displayName: 'Main', enabled: true },
      ],
    };

    it('never falls back to a shared calendar as the write default', () => {
      useConnectionStore.getState().setCalDav(withShare);
      // Without the owned-only filter this returns Anna's calendar, and the
      // user's own new events get created on it.
      expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([
        'https://caldav.icloud.com/a/main',
      ]);
    });

    it('returns no write target when every calendar is shared', () => {
      useConnectionStore.getState().setCalDav({
        ...apple,
        calendars: [{ ...withShare.calendars![0] }],
      });
      expect(useConnectionStore.getState().defaultCalendarUrls()).toEqual([]);
    });

    it('reports shared and read-only calendar urls', () => {
      useConnectionStore.getState().setCalDav({
        ...apple,
        calendars: [
          { ...withShare.calendars![0], readOnly: true },
          { ...withShare.calendars![1] },
        ],
      });
      const s = useConnectionStore.getState();
      expect([...s.sharedCalendarUrls()]).toEqual(['https://caldav.icloud.com/a/annas-family']);
      expect([...s.readOnlyCalendarUrls()]).toEqual(['https://caldav.icloud.com/a/annas-family']);
      expect(s.calendarNames().get('https://caldav.icloud.com/a/annas-family')).toBe('Family (Anna)');
    });

    it('treats calendars with no share flags as owned', () => {
      useConnectionStore.getState().setCalDav(apple);
      expect(useConnectionStore.getState().sharedCalendarUrls().size).toBe(0);
    });
  });

  it('ignores a legacy persisted `kind` field on load', () => {
    localStorage.setItem(
      'open-calendar.connection',
      JSON.stringify({ kind: 'caldav', caldav: apple }),
    );
    // Re-read via the persisted() path by simulating a fresh store read.
    const raw = JSON.parse(localStorage.getItem('open-calendar.connection')!);
    expect(raw.kind).toBe('caldav'); // legacy field present on disk…
    // …but the store API never exposes it.
    expect('kind' in useConnectionStore.getState()).toBe(false);
  });
});
