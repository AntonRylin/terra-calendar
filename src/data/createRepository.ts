import type { EventRepository } from './repository';
import { JsonFileRepository } from './jsonFileRepository';
import { HttpRepository } from './httpRepository';
import { isSupabaseConfigured } from './supabaseClient';
import { useAuthStore } from '../auth/authStore';
import { useEntitlementStore } from '../app/entitlementStore';
import type { MultiCalendarRepository, EventClient } from './multiCalendarRepository';
import { localStorageKv } from './caldav/localStorageKv';
import { TaskAwareRepository } from './taskAwareRepository';
import type { CalDavConfig } from './caldav/types';
import { UnifiedRepository, type SyncStore } from './sync/unifiedRepository';
import { CalDavAccountStore } from './sync/calDavAccountStore';
import { isForeignEvent } from '../core/sharedCalendars';
import type { Provider, SyncHealth } from '../app/connectionStore';

/** Assemble a per-account repository from a connected client + its config.
 *
 *  `MultiCalendarRepository` is pulled in dynamically because it reaches
 *  `icalMapping` → `ical.js`, a large parser only ever needed once a CalDAV
 *  account is connected. A static import would put it in the entry chunk and
 *  make every launch parse it, connected or not. */
export async function repositoryForAccount(
  client: EventClient,
  accountKey: string,
  config: CalDavConfig,
): Promise<MultiCalendarRepository> {
  const { MultiCalendarRepository } = await import('./multiCalendarRepository');
  const enabled = (config.calendars ?? []).filter((c) => c.enabled).map((c) => c.url);
  const urls = enabled.length > 0 ? enabled : config.calendarUrl ? [config.calendarUrl] : [];
  const readOnly = new Set(
    (config.calendars ?? []).filter((c) => c.readOnly).map((c) => c.url),
  );
  return new MultiCalendarRepository(client, localStorageKv, accountKey, urls, readOnly);
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Cloud mode is decided at RUNTIME by entitlement, not a build flag: the hosted
 * backend must be configured, the user signed in, and their Cloud subscription
 * active. Otherwise the app is local-first.
 */
export function isCloudMode(): boolean {
  return (
    isSupabaseConfigured() &&
    !!useAuthStore.getState().session &&
    useEntitlementStore.getState().cloudActive
  );
}

function calendarUrlSet(config: CalDavConfig): Set<string> {
  const enabled = (config.calendars ?? []).filter((c) => c.enabled).map((c) => c.url);
  return new Set(enabled.length > 0 ? enabled : config.calendarUrl ? [config.calendarUrl] : []);
}

/** Calendars in this account that the user owns and may write to — the only
 *  legitimate targets for new events. */
function writableUrlSet(config: CalDavConfig): Set<string> {
  const cals = config.calendars ?? [];
  if (cals.length === 0) return calendarUrlSet(config);
  const own = cals.filter((c) => c.enabled && !c.shared && !c.readOnly).map((c) => c.url);
  return new Set(own);
}

/** Calendars in this account that belong to someone else (shared with the user). */
function sharedUrlSet(config: CalDavConfig): Set<string> {
  return new Set((config.calendars ?? []).filter((c) => c.shared || c.readOnly).map((c) => c.url));
}

/** This account's default write calendar: the connection store's default that
 *  belongs to the account, else its first enabled OWNED calendar.
 *
 *  The fallback deliberately skips shared and read-only calendars. Discovery
 *  enables everything it finds, so without this filter a family member's shared
 *  calendar could become the target for the user's own new events. */
function accountDefaultUrl(config: CalDavConfig, defaults: string[]): string {
  const writable = writableUrlSet(config);
  return defaults.find((u) => writable.has(u)) ?? [...writable][0] ?? '';
}

/** Build a {@link CalDavAccountStore} for each connected, reachable account
 *  (Apple and/or Google). Desktop only — returns [] on web or when nothing is
 *  connected. A failure to build one account skips it and keeps the others.
 *  Tauri-only modules are imported dynamically so the web bundle never pulls
 *  them in. */
async function buildCalDavStores(): Promise<{ stores: SyncStore[]; foreign: Set<string> }> {
  const foreign = new Set<string>();
  if (!isTauri()) return { stores: [], foreign };
  const { useConnectionStore } = await import('../app/connectionStore');
  const conn = useConnectionStore.getState();
  if (!conn.isConnected()) return { stores: [], foreign };

  const defaults = conn.defaultCalendarUrls();
  const report = (provider: Provider, health: SyncHealth) =>
    useConnectionStore.getState().setSyncHealth(provider, health, conn.syncRevision);
  const healthCallbacks = (provider: Provider) => ({
    onSyncStart: () => report(provider, { status: 'checking' }),
    onSyncSuccess: () => report(provider, { status: 'connected' }),
    onSyncError: (error: unknown) => report(provider, {
      status: 'error', error: error instanceof Error ? error.message : String(error || 'Sync failed'),
    }),
  });

  // Every calendar shared with the user, across BOTH accounts. Each store needs
  // the global set so it can recognise (and leave alone) an event that belongs
  // to the OTHER account's shared calendar — otherwise a shared Apple calendar
  // gets replicated into the user's own Google account, and vice versa.
  //
  // Seeded from the stored config, then topped up from what discovery resolved
  // below. The stores hold this Set BY REFERENCE and nothing writes until after
  // both builds settle, so a first connection (whose stored config has no
  // calendars yet) is still covered on its very first pass.
  for (const cfg of [conn.caldav, conn.google]) {
    if (cfg) for (const u of sharedUrlSet(cfg)) foreign.add(u);
  }

  // Both accounts are built concurrently: each is an independent chain of
  // keychain reads and network discovery, so launching with two connected
  // accounts costs the slower one instead of both back to back.
  async function buildApple(): Promise<SyncStore | null> {
    if (!conn.caldav) return null;
    const health = healthCallbacks('apple');
    health.onSyncStart();
    try {
      const { credentials } = await import('./caldav/credentials');
      const password = await credentials.get(conn.caldav.username);
      if (!password) throw new Error('Apple Calendar password is missing. Reconnect with an app-specific password.');
      const { buildAppleAccount } = await import('./caldav/connect');
      const { client, config } = await buildAppleAccount(conn.caldav.username, password, conn.caldav);
      if (config.calendars && (!conn.caldav.calendars || conn.caldav.calendars.length === 0)) {
        useConnectionStore.getState().setCalDav(config);
      }
      for (const u of sharedUrlSet(config)) foreign.add(u);
      const store = new CalDavAccountStore(
        await repositoryForAccount(client, `apple:${conn.caldav.username}`, config),
        calendarUrlSet(config),
        accountDefaultUrl(config, defaults),
        foreign,
      );
      return {
        id: `apple:${conn.caldav.username}`,
        kind: 'caldav',
        repo: store,
        holds: (e) => store.holds(e),
        ...health,
      };
    } catch (error) {
      health.onSyncError(error);
      return null; // discovery/auth failed → skip this account
    }
  }

  async function buildGoogle(): Promise<SyncStore | null> {
    if (!conn.google) return null;
    const health = healthCallbacks('google');
    health.onSyncStart();
    try {
      const { buildGoogleAccount } = await import('./google/connect');
      const { client, config } = await buildGoogleAccount(conn.google.username, conn.google);
      if (config.calendars && (!conn.google.calendars || conn.google.calendars.length === 0)) {
        useConnectionStore.getState().setGoogle(config);
      }
      for (const u of sharedUrlSet(config)) foreign.add(u);
      const store = new CalDavAccountStore(
        await repositoryForAccount(client, `google:${conn.google.username}`, config),
        calendarUrlSet(config),
        accountDefaultUrl(config, defaults),
        foreign,
      );
      return {
        id: `google:${conn.google.username}`,
        kind: 'caldav',
        repo: store,
        holds: (e) => store.holds(e),
        ...health,
      };
    } catch (error) {
      health.onSyncError(error);
      return null; // token/keychain unavailable → skip this account
    }
  }

  const built = await Promise.all([buildApple(), buildGoogle()]);
  return { stores: built.filter((s): s is SyncStore => s !== null), foreign };
}

/**
 * Assemble the active sync stores from connection + entitlement and reconcile them
 * behind one {@link UnifiedRepository}: **local is always present**; each connected
 * CalDAV account (Apple/Google, desktop) is a store; **Supabase** is added in cloud
 * mode. Every event then syncs across all active stores (see src/data/sync).
 */
function localRepository(): EventRepository {
  return new TaskAwareRepository(isTauri() ? new JsonFileRepository() : new HttpRepository());
}

/**
 * The durable local store on its own, for the first paint. Reading it is a local
 * file read, so the calendar appears immediately instead of waiting on keychain
 * reads, CalDAV discovery, and cloud fetches.
 *
 * Deliberately NOT a {@link UnifiedRepository}: a unified load rewrites the sync
 * baseline from the stores it knows about, and a local-only pass would erase the
 * record that the remotes hold events — which reconcile needs to infer
 * deletions. The plain repository only reads and writes the local file, leaving
 * the baseline untouched for the full pass that follows.
 */
export function createLocalRepository(): EventRepository {
  return localRepository();
}

export async function createRepositoryAsync(): Promise<EventRepository> {
  const local: SyncStore = { id: 'local', kind: 'local', repo: localRepository() };

  const { stores: calDavStores, foreign } = await buildCalDavStores();
  const stores: SyncStore[] = [local, ...calDavStores];

  let supabaseId: string | null = null;
  if (isCloudMode()) {
    // Dynamic for the same reason as the CalDAV repository above: local-only
    // users never reach this branch and shouldn't pay to parse it.
    const { SupabaseRepository } = await import('./supabaseRepository');
    supabaseId = 'supabase';
    stores.push({
      id: supabaseId,
      kind: 'supabase',
      repo: new SupabaseRepository(),
      // A family member's events are not the user's rows to store: uploading
      // them would put someone else's calendar in this account's cloud data.
      holds: (e) => !isForeignEvent(e, foreign),
    });
  }

  return new UnifiedRepository(stores, 'local', supabaseId);
}
