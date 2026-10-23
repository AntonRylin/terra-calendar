import { create } from 'zustand';
import type { CalDavCalendarConfig, CalDavConfig } from '../data/caldav/types';

export type Provider = 'apple' | 'google';

export interface SyncHealth {
  status: 'checking' | 'connected' | 'error';
  error?: string;
}

/** A connected calendar, flattened across accounts for the UI/editor. */
export interface ConnectedCalendar {
  url: string;
  displayName: string;
  enabled: boolean;
  writeDefault: boolean;
  provider: Provider;
  /** The account email this calendar belongs to. */
  account: string;
  /** Owned by another principal — shared WITH this account. */
  shared: boolean;
  /** The share grants no write access. */
  readOnly: boolean;
}

interface ConnectionState {
  /** Apple iCloud (and other Basic-auth CalDAV hosts). */
  caldav?: CalDavConfig;
  /** Google Calendar over CalDAV + OAuth. Reuses the CalDAV config shape;
   *  `username` is the Google account email, the refresh token lives in the
   *  OS keychain (keyed by `google:<email>`). */
  google?: CalDavConfig;
  /** Runtime health is separate from saved credentials/configuration. */
  syncHealth: Partial<Record<Provider, SyncHealth>>;
  syncRevision: number;
  retrySync(provider: Provider): void;
  setSyncHealth(provider: Provider, health: SyncHealth, revision: number): void;

  setCalDav(config: CalDavConfig): void;
  setGoogle(config: CalDavConfig): void;
  disconnectCalDav(): void;
  disconnectGoogle(): void;

  /** True when at least one account is connected. */
  isConnected(): boolean;
  /** Every calendar across connected accounts, flattened. */
  calendars(): ConnectedCalendar[];
  /** Enabled (readable) calendars across connected accounts. */
  enabledCalendars(): ConnectedCalendar[];
  /** Calendars new events are written to by default — the ones flagged
   *  `writeDefault` (and enabled); falls back to the first enabled calendar so
   *  new events always land somewhere. */
  defaultCalendarUrls(): string[];
  /** URLs of calendars shared with this user (owned by someone else). Events on
   *  them are never replicated into the user's own calendars or cloud. */
  sharedCalendarUrls(): Set<string>;
  /** URLs of calendars that refuse writes. */
  readOnlyCalendarUrls(): Set<string>;
  /** url → display name, for labelling an event with the calendar it lives on. */
  calendarNames(): Map<string, string>;
  /** Toggle a calendar's enabled (read/show) flag, by URL. */
  setCalendarEnabled(url: string, enabled: boolean): void;
  /** Toggle a calendar's write-default flag, by URL. */
  setCalendarWriteDefault(url: string, writeDefault: boolean): void;
}

const KEY = 'open-calendar.connection';

type Persisted = { caldav?: CalDavConfig; google?: CalDavConfig };

function persisted(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // Ignore the legacy `kind` field; presence of caldav/google is the source
      // of truth now (both can be connected at once).
      const { caldav, google } = JSON.parse(raw) as Persisted;
      return { caldav, google };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function save(state: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ caldav: state.caldav, google: state.google }));
  } catch {
    /* ignore */
  }
}

function flatten(provider: Provider, config?: CalDavConfig): ConnectedCalendar[] {
  if (!config?.calendars) return [];
  return config.calendars.map((c) => ({
    url: c.url,
    displayName: c.displayName,
    enabled: c.enabled,
    writeDefault: c.writeDefault ?? false,
    provider,
    account: config.username,
    shared: c.shared ?? false,
    readOnly: c.readOnly ?? false,
  }));
}

export const useConnectionStore = create<ConnectionState>((set, get) => {
  /** Apply a per-calendar update to whichever account owns `url`. */
  function patchCalendar(url: string, patch: (cal: CalDavCalendarConfig) => void): void {
    const { caldav, google } = get();
    const next: Persisted = {
      caldav: caldav ? { ...caldav, calendars: caldav.calendars?.map((c) => ({ ...c })) } : undefined,
      google: google ? { ...google, calendars: google.calendars?.map((c) => ({ ...c })) } : undefined,
    };
    for (const config of [next.caldav, next.google]) {
      const cal = config?.calendars?.find((c) => c.url === url);
      if (cal) patch(cal);
    }
    save(next);
    set({ ...next, syncRevision: get().syncRevision + 1 });
  }

  return {
    ...persisted(),
    syncHealth: {},
    syncRevision: 0,

    retrySync(provider) {
      set({ syncRevision: get().syncRevision + 1,
        syncHealth: { ...get().syncHealth, [provider]: { status: 'checking' } } });
    },
    setSyncHealth(provider, health, revision) {
      // Ignore work from a repository superseded by retry/reconnect/disconnect.
      if (revision !== get().syncRevision || !(provider === 'apple' ? get().caldav : get().google)) return;
      set({ syncHealth: { ...get().syncHealth, [provider]: health } });
    },

    setCalDav(config) {
      set({ caldav: config, syncRevision: get().syncRevision + 1,
        syncHealth: { ...get().syncHealth, apple: { status: 'checking' } } });
      save({ caldav: config, google: get().google });
    },
    setGoogle(config) {
      set({ google: config, syncRevision: get().syncRevision + 1,
        syncHealth: { ...get().syncHealth, google: { status: 'checking' } } });
      save({ caldav: get().caldav, google: config });
    },
    disconnectCalDav() {
      set({ caldav: undefined, syncRevision: get().syncRevision + 1,
        syncHealth: { ...get().syncHealth, apple: undefined } });
      save({ caldav: undefined, google: get().google });
    },
    disconnectGoogle() {
      set({ google: undefined, syncRevision: get().syncRevision + 1,
        syncHealth: { ...get().syncHealth, google: undefined } });
      save({ caldav: get().caldav, google: undefined });
    },

    isConnected() {
      return Boolean(get().caldav || get().google);
    },
    calendars() {
      const { caldav, google } = get();
      return [...flatten('apple', caldav), ...flatten('google', google)];
    },
    enabledCalendars() {
      return get().calendars().filter((c) => c.enabled);
    },
    defaultCalendarUrls() {
      const enabled = get().enabledCalendars();
      // At most one write target per account: iCloud/CalDAV enforce UID
      // uniqueness per account, so one event can't be replicated across two
      // calendars of the same account. Picking the first flagged per account
      // also defends against configs persisted before this rule.
      const byAccount = new Map<string, string>();
      for (const c of enabled) {
        if (!c.writeDefault) continue;
        const key = `${c.provider}:${c.account}`;
        if (!byAccount.has(key)) byAccount.set(key, c.url);
      }
      if (byAccount.size > 0) return [...byAccount.values()];
      // The fallback must never pick a calendar shared WITH the user: discovery
      // enables everything it finds, so without this filter the first calendar
      // in the list could be a family member's, and the user's own new events
      // would be created on it.
      const own = enabled.filter((c) => !c.shared && !c.readOnly);
      return own.length > 0 ? [own[0].url] : [];
    },
    sharedCalendarUrls() {
      return new Set(get().calendars().filter((c) => c.shared || c.readOnly).map((c) => c.url));
    },
    readOnlyCalendarUrls() {
      return new Set(get().calendars().filter((c) => c.readOnly).map((c) => c.url));
    },
    calendarNames() {
      return new Map(get().calendars().map((c) => [c.url, c.displayName]));
    },
    setCalendarEnabled(url, enabled) {
      patchCalendar(url, (c) => {
        c.enabled = enabled;
      });
    },
    setCalendarWriteDefault(url, writeDefault) {
      const { caldav, google } = get();
      const next: Persisted = {
        caldav: caldav ? { ...caldav, calendars: caldav.calendars?.map((c) => ({ ...c })) } : undefined,
        google: google ? { ...google, calendars: google.calendars?.map((c) => ({ ...c })) } : undefined,
      };
      for (const config of [next.caldav, next.google]) {
        const cal = config?.calendars?.find((c) => c.url === url);
        if (!cal) continue;
        // One write target per account: enabling Default here clears it on the
        // account's other calendars (iCloud can't hold one UID in two calendars).
        if (writeDefault) for (const c of config!.calendars ?? []) c.writeDefault = false;
        cal.writeDefault = writeDefault;
      }
      save(next);
      set({ ...next, syncRevision: get().syncRevision + 1 });
    },
  };
});
