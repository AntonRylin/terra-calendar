/** How much of an event a share exposes. */
export type ShareDetail = 'full' | 'busy';

/** What people holding the link may do. */
export type ShareRole = 'viewer' | 'editor';

/**
 * Which of the owner's events a share covers.
 * - `all`        — everything, now and in future
 * - `categories` — only events in the listed categories
 * - `manual`     — nothing by default; only events explicitly added to it
 *
 * Per-event overrides sit on top of all three (see `shareInclude`/`shareExclude`
 * on CalendarEvent), which is what makes "share this one event" and "hide this
 * one event" work without a fourth mode.
 */
export type ShareScopeMode = 'all' | 'categories' | 'manual';

/** A share the signed-in user owns. */
export interface Share {
  id: string;
  name: string;
  scopeMode: ShareScopeMode;
  /** Category names in scope when `scopeMode` is 'categories'. */
  categories: string[];
  detail: ShareDetail;
  role: ShareRole;
  /** Secret half of the invite link. Anyone holding it can join. */
  token: string;
  createdAt: string;
  /** How many people have joined (owner view). */
  memberCount?: number;
}

/** A share someone else granted to this user. */
export interface ReceivedShare {
  id: string;
  name: string;
  ownerName: string;
  role: ShareRole;
}

/** Max people per share, mirrored from `join_share` in migration 0014 so the UI
 *  can say so before the server has to. */
export const SHARE_MEMBER_LIMIT = 10;
