import type { CalendarEvent } from '../../core/types';

export interface CalDavCalendarConfig {
  url: string;
  displayName: string;
  /** Show/read events from this calendar. */
  enabled: boolean;
  /** New events are written here by default. Several calendars (even across
   *  accounts) can be write defaults at once. */
  writeDefault?: boolean;
  /** Owned by another principal — a calendar shared WITH this account (e.g. a
   *  family calendar from iCloud/Google). Its events belong to that owner: they
   *  are never replicated into the user's other calendars or accounts. */
  shared?: boolean;
  /** The share grants no write access. Events here are never PUT or DELETEd. */
  readOnly?: boolean;
}

/** Connection details for a CalDAV account. Password is NOT here — it lives in
 *  the OS keychain, looked up by `username`. */
export interface CalDavConfig {
  /** Base server URL, e.g. https://caldav.icloud.com */
  serverUrl: string;
  /** Account username (Apple ID email). */
  username: string;
  /** Chosen calendar collection URL, resolved by discovery. */
  calendarUrl?: string;
  /** List of all calendars in the account. */
  calendars?: CalDavCalendarConfig[];
}

/** A response from the transport layer. */
export interface DavResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Injected HTTP transport. Lets us unit-test with a mock and supply Tauri's
 *  native (CORS-free) HTTP at the edge. */
export type DavTransport = (req: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<DavResponse>;

/** One event resource on the server. */
export interface RemoteResource {
  /** Resource path (href) of the .ics, relative to the origin. */
  href: string;
  etag: string;
  ics: string;
}

/** One snapshot entry: the parsed event plus the server bookkeeping needed to
 *  diff and to issue conditional writes. */
export interface SnapshotEntry {
  event: CalendarEvent;
  href: string;
  etag: string;
}

/** Cached server state for one account. */
export interface CalDavSnapshot {
  syncToken?: string;
  ctag?: string;
  /** Keyed by event id. */
  entries: Record<string, SnapshotEntry>;
}
