import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent } from '../core/types';
import type { KvStore } from './caldav/caldavCache';
import { eventToICS, icsToEvent } from './caldav/icalMapping';
import { PreconditionFailed } from './caldav/caldavClient';

/** The slice of the CalDAV client this repository needs (eases testing). */
export interface EventClient {
  listEventsForCalendar(
    calendarUrl: string,
  ): Promise<Array<{ href: string; etag: string; ics: string }>>;
  putNewEvent(
    calendarUrl: string,
    uid: string,
    ics: string,
  ): Promise<{ etag: string; href: string }>;
  putEventByPath(path: string, ics: string, etag: string | undefined): Promise<string>;
  deleteEvent(href: string, etag: string): Promise<void>;
}

interface ResourceRef {
  href: string;
  etag: string;
}

/** One logical event plus where each of its per-calendar copies lives. */
interface MultiEntry {
  event: CalendarEvent;
  /** calendarUrl → the resource (href + etag) for the copy in that calendar. */
  copies: Record<string, ResourceRef>;
}

interface MultiSnapshot {
  entries: Record<string, MultiEntry>;
}

/**
 * A repository for a single CalDAV account whose events can each live in
 * **several calendars at once**. On `load` it merges all enabled calendars and
 * records, per event id, every calendar the UID was found in. On `saveAll` it
 * fans each event out to exactly the calendars in `event.calendarUrls`: creating
 * copies in newly-added calendars, updating changed ones, and deleting copies
 * from calendars the event no longer belongs to.
 *
 * The incoming list to `saveAll` is expected to already be scoped to this
 * account's calendars (the `CompositeRepository` projects it), so anything in
 * the snapshot but absent from the list is treated as removed here.
 */
export class MultiCalendarRepository implements EventRepository {
  private snapshot: MultiSnapshot = { entries: {} };
  private readonly key: string;

  constructor(
    private readonly client: EventClient,
    private readonly kv: KvStore,
    accountKey: string,
    /** Enabled (readable) calendar URLs for this account. */
    private readonly calendarUrls: string[],
    /** Calendars the share grants no write access to. They are read normally,
     *  but never receive a PUT or a DELETE — the server would 403 and the sync
     *  would retry forever. */
    private readonly readOnlyUrls: Set<string> = new Set(),
  ) {
    this.key = `open-calendar.multical.snapshot.${accountKey}`;
  }

  private async loadCache(): Promise<MultiSnapshot> {
    const raw = await this.kv.get(this.key);
    if (!raw) return { entries: {} };
    try {
      const parsed = JSON.parse(raw) as MultiSnapshot;
      return parsed && parsed.entries ? parsed : { entries: {} };
    } catch {
      return { entries: {} };
    }
  }

  private saveCache(): Promise<void> {
    return this.kv.set(this.key, JSON.stringify(this.snapshot));
  }

  async load(): Promise<LoadResult> {
    this.snapshot = await this.loadCache();
    try {
      const entries: Record<string, MultiEntry> = {};
      const results = await Promise.all(
        this.calendarUrls.map(async (url) => ({
          url,
          resources: await this.client.listEventsForCalendar(url),
        })),
      );

      for (const { url, resources } of results) {
        for (const r of resources) {
          const event = icsToEvent(r.ics);
          if (!event) continue;
          const existing = entries[event.id];
          if (existing) {
            existing.copies[url] = { href: r.href, etag: r.etag };
            // Same UID in two calendars: keep the most recently edited content.
            if (event.updatedAt > existing.event.updatedAt) existing.event = event;
          } else {
            entries[event.id] = { event, copies: { [url]: { href: r.href, etag: r.etag } } };
          }
        }
      }

      for (const entry of Object.values(entries)) {
        entry.event = { ...entry.event, calendarUrls: Object.keys(entry.copies) };
      }

      this.snapshot = { entries };
      await this.saveCache();
      return { events: this.events() };
    } catch (err) {
      return {
        events: this.events(),
        warning: `Offline — showing cached events (${err instanceof Error ? err.message : String(err)}).`,
      };
    }
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const prev = this.snapshot.entries;
    const nextIds = new Set(events.map((e) => e.id));
    const known = new Set(this.calendarUrls);
    const entries: Record<string, MultiEntry> = {};

    for (const event of events) {
      const desired = (event.calendarUrls ?? []).filter((u) => known.has(u));
      const existing = prev[event.id];
      const existingCopies = existing?.copies ?? {};
      const copies: Record<string, ResourceRef> = {};
      const ics = eventToICS(event);
      const contentChanged = !existing || existing.event.updatedAt !== event.updatedAt;

      // Create in newly-added calendars, update changed copies, keep the rest.
      // A read-only calendar keeps whatever copy it already has: we still hold
      // it (so the snapshot must record it), we just cannot write to it.
      for (const url of desired) {
        const ref = existingCopies[url];
        if (this.readOnlyUrls.has(url)) {
          if (ref) copies[url] = ref;
          continue;
        }
        if (ref) {
          if (contentChanged) {
            const etag = await this.client.putEventByPath(ref.href, ics, ref.etag);
            copies[url] = { href: ref.href, etag };
          } else {
            copies[url] = ref;
          }
        } else {
          const { etag, href } = await this.client.putNewEvent(url, event.id, ics);
          copies[url] = { href, etag };
        }
      }

      // Delete copies from calendars this event no longer belongs to.
      for (const [url, ref] of Object.entries(existingCopies)) {
        if (!desired.includes(url) && !this.readOnlyUrls.has(url)) {
          try {
            await this.client.deleteEvent(ref.href, ref.etag);
          } catch (err) {
            if (!(err instanceof PreconditionFailed)) throw err;
          }
        }
      }

      entries[event.id] = { event: { ...event, calendarUrls: Object.keys(copies) }, copies };
    }

    // Events removed entirely → delete every copy we are allowed to delete.
    // Copies on a read-only calendar are kept (and stay in the snapshot): the
    // event still exists on the owner's server, and pretending otherwise would
    // make the next load read it as a brand-new creation.
    for (const [id, entry] of Object.entries(prev)) {
      if (nextIds.has(id)) continue;
      const kept: Record<string, ResourceRef> = {};
      for (const [url, ref] of Object.entries(entry.copies)) {
        if (this.readOnlyUrls.has(url)) {
          kept[url] = ref;
          continue;
        }
        try {
          await this.client.deleteEvent(ref.href, ref.etag);
        } catch (err) {
          if (!(err instanceof PreconditionFailed)) throw err;
        }
      }
      if (Object.keys(kept).length > 0) {
        entries[id] = { event: { ...entry.event, calendarUrls: Object.keys(kept) }, copies: kept };
      }
    }

    this.snapshot = { entries };
    await this.saveCache();
  }

  private events(): CalendarEvent[] {
    return Object.values(this.snapshot.entries).map((e) => e.event);
  }
}
