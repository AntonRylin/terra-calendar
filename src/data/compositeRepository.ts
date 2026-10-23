import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent } from '../core/types';

export interface CompositeAccount {
  repo: EventRepository;
  /** Calendar URLs this account owns (used to route events to it). */
  calendars: Set<string>;
}

/**
 * Aggregates several connected accounts (e.g. Apple + Google) behind the single
 * `EventRepository` the app talks to.
 *
 * - `load` reads every account and **merges by UID**: an event synced to
 *   calendars in more than one account shows up once, with `calendarUrls` unioned
 *   across them (and the most recently edited copy as the canonical content).
 * - `saveAll` assigns the configured default calendars to brand-new events, then
 *   **projects** each event onto every account — passing each account only the
 *   events (with calendarUrls filtered to that account's calendars) that belong
 *   to it. Each account's repository then fans out / prunes its own copies.
 */
export class CompositeRepository implements EventRepository {
  constructor(
    private readonly accounts: CompositeAccount[],
    private readonly getDefaultCalendarUrls: () => string[],
  ) {}

  async load(): Promise<LoadResult> {
    const results = await Promise.all(this.accounts.map((a) => a.repo.load()));
    const byId = new Map<string, CalendarEvent>();
    const warnings: string[] = [];

    for (const result of results) {
      if (result.warning) warnings.push(result.warning);
      for (const event of result.events) {
        const existing = byId.get(event.id);
        if (!existing) {
          byId.set(event.id, event);
        } else {
          const canonical = event.updatedAt > existing.updatedAt ? event : existing;
          const urls = new Set([...(existing.calendarUrls ?? []), ...(event.calendarUrls ?? [])]);
          byId.set(event.id, { ...canonical, calendarUrls: [...urls] });
        }
      }
    }

    return { events: [...byId.values()], warning: warnings[0] };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const defaults = this.getDefaultCalendarUrls();
    const normalized = events.map((e) =>
      e.calendarUrls && e.calendarUrls.length > 0 ? e : { ...e, calendarUrls: defaults },
    );

    for (const account of this.accounts) {
      const projected = normalized
        .map((e) => ({
          ...e,
          calendarUrls: (e.calendarUrls ?? []).filter((u) => account.calendars.has(u)),
        }))
        .filter((e) => e.calendarUrls.length > 0);
      await account.repo.saveAll(projected);
    }
  }
}
