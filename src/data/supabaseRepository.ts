import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent, Recurrence, EventReminder, DayOverride } from '../core/types';
import { getSupabase } from './supabaseClient';

const TABLE = 'events';

/** A row in the Supabase `events` table (snake_case columns). */
interface EventRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  type: string | null;
  time: string | null;
  end_time: string | null;
  tz: string | null;
  recurrence: Recurrence | null;
  exdates: string[] | null;
  day_overrides: Record<string, DayOverride> | null;
  color: string | null;
  cosmetic: string | null;
  show_on_minimap: boolean | null;
  show_in_upcoming: boolean | null;
  calendar_urls: string[] | null;
  is_task: boolean | null;
  reminders: EventReminder[] | null;
  share_include: string[] | null;
  share_exclude: string[] | null;
  created_at: string;
  updated_at: string;
}

function fromRow(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    endDate: r.end_date ?? undefined,
    type: r.type ?? undefined,
    time: r.time ?? undefined,
    endTime: r.end_time ?? undefined,
    tz: r.tz ?? undefined,
    description: r.description ?? undefined,
    recurrence: r.recurrence ?? null,
    exdates: r.exdates ?? undefined,
    dayOverrides: r.day_overrides ?? undefined,
    color: r.color ?? undefined,
    cosmetic: r.cosmetic ?? undefined,
    showOnMinimap: r.show_on_minimap ?? undefined,
    showInUpcoming: r.show_in_upcoming ?? undefined,
    calendarUrls: r.calendar_urls ?? undefined,
    isTask: r.is_task ? true : undefined,
    reminders: r.reminders ?? undefined,
    shareInclude: r.share_include ?? undefined,
    shareExclude: r.share_exclude ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow(e: CalendarEvent, userId: string): EventRow {
  return {
    id: e.id,
    user_id: userId,
    title: e.title,
    description: e.description ?? null,
    date: e.date,
    end_date: e.endDate ?? null,
    type: e.type ?? null,
    time: e.time ?? null,
    end_time: e.endTime ?? null,
    tz: e.tz ?? null,
    recurrence: e.recurrence ?? null,
    exdates: e.exdates ?? null,
    day_overrides: e.dayOverrides ?? null,
    color: e.color ?? null,
    cosmetic: e.cosmetic ?? null,
    show_on_minimap: e.showOnMinimap ?? null,
    show_in_upcoming: e.showInUpcoming ?? null,
    calendar_urls: e.calendarUrls ?? null,
    is_task: e.isTask ?? null,
    reminders: e.reminders ?? null,
    share_include: e.shareInclude ?? null,
    share_exclude: e.shareExclude ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/**
 * Cloud adapter: events live in Postgres, scoped to the signed-in user by RLS
 * (`user_id = auth.uid()`). Multi-device-safe: it keeps a snapshot of the rows
 * it last loaded/saved, and on `saveAll` upserts only rows changed on THIS device
 * and deletes only ids that left its own snapshot — never rows it has not seen
 * (so another device's additions are preserved). Conflicts are last-writer-wins.
 */
export class SupabaseRepository implements EventRepository {
  readonly handlesTasks = true;
  private snapshot = new Map<string, CalendarEvent>();

  async load(): Promise<LoadResult> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from(TABLE).select('*');
    // Must THROW on failure (supabase-js reports network errors via `error`,
    // it does not reject): returning [] would read as "successfully empty",
    // and the sync engine's delete-wins rule would then wipe the events from
    // every other store. A thrown read excludes this store for the pass.
    if (error) throw new Error(`Failed to load events: ${error.message}`);
    const events = ((data ?? []) as EventRow[]).map(fromRow);
    this.snapshot = new Map(events.map((e) => [e.id, e]));
    return { events };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    const supabase = getSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Not signed in');

    // Upsert only rows new or changed on this device (vs the last-loaded snapshot).
    const changed = events.filter((e) => {
      const prev = this.snapshot.get(e.id);
      return !prev || prev.updatedAt !== e.updatedAt;
    });
    if (changed.length > 0) {
      const { error } = await supabase
        .from(TABLE)
        .upsert(changed.map((e) => toRow(e, user.id)), { onConflict: 'id' });
      if (error) throw error;
    }

    // Delete only ids that were in our snapshot and are now gone (a real local
    // delete). Ids we have never loaded (another device's rows) are left alone.
    const present = new Set(events.map((e) => e.id));
    const removed = [...this.snapshot.keys()].filter((id) => !present.has(id));
    if (removed.length > 0) {
      const { error } = await supabase.from(TABLE).delete().eq('user_id', user.id).in('id', removed);
      if (error) throw error;
    }

    this.snapshot = new Map(events.map((e) => [e.id, e]));
  }
}
