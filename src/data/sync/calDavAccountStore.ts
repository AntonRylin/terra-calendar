import type { EventRepository, LoadResult } from '../repository';
import type { CalendarEvent } from '../../core/types';
import { isTaskEvent } from '../../core/tasks';
import { isForeignEvent } from '../../core/sharedCalendars';

/**
 * Wraps one CalDAV account's repository as a unified-sync store. On write it scopes
 * each event to THIS account: keep the event's calendars that belong here, else
 * assign this account's default calendar — so every synced event lands in this
 * account (its default) unless already placed in one of its calendars. Tasks
 * (dateless) are never written to CalDAV. Reads pass straight through.
 *
 * **Foreign events are the exception.** An event that lives on a calendar shared
 * with the user (a family member's iCloud/Google calendar) belongs to that owner.
 * It is written back only to the calendar it came from — never copied into this
 * account's default. Without that rule, connecting both Apple and Google would
 * replicate a shared Apple calendar wholesale into the user's own Google account.
 */
export class CalDavAccountStore implements EventRepository {
  constructor(
    private readonly inner: EventRepository,
    private readonly accountCalendars: Set<string>,
    private readonly defaultUrl: string,
    /** Every shared/read-only calendar URL across ALL connected accounts. Needs
     *  to be global: this store has to recognise an event belonging to another
     *  account's shared calendar in order to leave it alone. */
    private readonly foreignCalendars: Set<string> = new Set(),
  ) {}

  load(): Promise<LoadResult> {
    return this.inner.load();
  }

  /**
   * This event as this account will store it, or `null` if the account declines
   * it. Single source of truth for both {@link saveAll} and {@link holds} — the
   * sync baseline is written from `holds`, and a disagreement between the two
   * would make a declined event look deleted on the next pass.
   */
  private project(e: CalendarEvent): CalendarEvent | null {
    if (isTaskEvent(e)) return null;
    const urls = e.calendarUrls ?? [];
    const own = urls.filter((u) => this.accountCalendars.has(u));
    // Already placed in this account (possibly on a shared calendar here — that
    // copy is written back in place, or skipped if the share is read-only).
    if (own.length > 0) return { ...e, calendarUrls: own };
    // Someone else's event, held by another account — not ours to copy.
    if (isForeignEvent(e, this.foreignCalendars)) return null;
    // An account with no owned, writable calendar has nowhere to put this.
    if (!this.defaultUrl) return null;
    return { ...e, calendarUrls: [this.defaultUrl] };
  }

  holds(e: CalendarEvent): boolean {
    return this.project(e) !== null;
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const projected: CalendarEvent[] = [];
    for (const e of events) {
      const p = this.project(e);
      if (p) projected.push(p);
    }
    await this.inner.saveAll(projected);
  }
}
