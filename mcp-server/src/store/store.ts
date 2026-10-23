import type { CalendarEvent } from '../core/types.js';

/**
 * Backend-agnostic event store. The MCP tool handlers talk only to this
 * interface, so the same tools work against the free local edition (a JSON file
 * on disk) and the paid hosted edition (a Supabase Postgres table behind
 * per-user Row-Level Security).
 *
 * Operations are per-event rather than read-all/write-all so the cloud backend
 * can issue targeted inserts/updates/deletes and never clobber rows the user
 * edited on another device between this server's read and write.
 */
export interface CalendarStore {
  /** Resolve credentials / locate the database. Called once at startup so
   *  misconfiguration fails fast with a clear message. */
  init(): Promise<void>;
  /** All raw event definitions for the current user (recurrence not expanded). */
  list(): Promise<CalendarEvent[]>;
  /** Insert a new event. */
  create(event: CalendarEvent): Promise<void>;
  /** Replace an existing event (matched by id). */
  update(event: CalendarEvent): Promise<void>;
  /** Delete an event by id. Returns false if no such event existed. */
  remove(id: string): Promise<boolean>;
  /** Human-readable description of where data lives, for the tool "info" field. */
  describe(): string;
}

/** Supabase config, present only when all required env vars are set. */
interface SupabaseConfig {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

function readSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.OPEN_CALENDAR_SUPABASE_URL;
  const anonKey = process.env.OPEN_CALENDAR_SUPABASE_ANON_KEY;
  const email = process.env.OPEN_CALENDAR_EMAIL;
  const password = process.env.OPEN_CALENDAR_PASSWORD;
  if (url && anonKey && email && password) {
    return { url, anonKey, email, password };
  }
  return null;
}

/**
 * Pick the store from the environment:
 * - Supabase, when `OPEN_CALENDAR_SUPABASE_URL`, `OPEN_CALENDAR_SUPABASE_ANON_KEY`,
 *   `OPEN_CALENDAR_EMAIL` and `OPEN_CALENDAR_PASSWORD` are all set.
 * - Local JSON file otherwise (the default).
 *
 * Set `OPEN_CALENDAR_BACKEND=local` to force the local file even when Supabase
 * vars are present; `OPEN_CALENDAR_BACKEND=supabase` makes missing Supabase
 * config a hard error instead of silently falling back.
 */
export async function createStore(): Promise<CalendarStore> {
  const forced = process.env.OPEN_CALENDAR_BACKEND?.toLowerCase();
  const config = readSupabaseConfig();

  if (forced === 'local') {
    const { LocalFileStore } = await import('./localFileStore.js');
    return new LocalFileStore();
  }

  if (forced === 'supabase' && !config) {
    throw new Error(
      'OPEN_CALENDAR_BACKEND=supabase but Supabase config is incomplete. ' +
        'Set OPEN_CALENDAR_SUPABASE_URL, OPEN_CALENDAR_SUPABASE_ANON_KEY, ' +
        'OPEN_CALENDAR_EMAIL and OPEN_CALENDAR_PASSWORD.',
    );
  }

  if (config) {
    const { SupabaseStore } = await import('./supabaseStore.js');
    return new SupabaseStore(config);
  }

  const { LocalFileStore } = await import('./localFileStore.js');
  return new LocalFileStore();
}

export type { SupabaseConfig };
