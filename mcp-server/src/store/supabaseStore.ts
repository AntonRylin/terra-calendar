import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, Recurrence } from '../core/types.js';
import type { CalendarStore, SupabaseConfig } from './store.js';

const TABLE = 'events';

/** A row in the Supabase `events` table (snake_case columns). */
interface EventRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  tz: string | null;
  recurrence: Recurrence | null;
  exdates: string[] | null;
  color: string | null;
  show_on_minimap: boolean | null;
  show_in_upcoming: boolean | null;
  created_at: string;
  updated_at: string;
}

function fromRow(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    time: r.time ?? undefined,
    tz: r.tz ?? undefined,
    description: r.description ?? undefined,
    recurrence: r.recurrence ?? null,
    exdates: r.exdates ?? undefined,
    color: r.color ?? undefined,
    showOnMinimap: r.show_on_minimap ?? undefined,
    showInUpcoming: r.show_in_upcoming ?? undefined,
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
    time: e.time ?? null,
    tz: e.tz ?? null,
    recurrence: e.recurrence ?? null,
    exdates: e.exdates ?? null,
    color: e.color ?? null,
    show_on_minimap: e.showOnMinimap ?? null,
    show_in_upcoming: e.showInUpcoming ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/**
 * Cloud edition store: events live in Postgres on Supabase, scoped to the
 * signed-in user by Row-Level Security (`user_id = auth.uid()`).
 *
 * Authentication mirrors the web app exactly — sign in with the user's email +
 * password using the public anon/publishable key, so every query is filtered by
 * RLS. The service-role key is never used (it would bypass RLS).
 */
export class SupabaseStore implements CalendarStore {
  private readonly config: SupabaseConfig;
  private client: SupabaseClient;
  private userId: string | null = null;

  constructor(config: SupabaseConfig) {
    this.config = config;
    // No session persistence in a headless process; we sign in fresh on init
    // and let the client auto-refresh the token for the process's lifetime.
    this.client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  async init(): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: this.config.email,
      password: this.config.password,
    });
    if (error) {
      throw new Error(`Supabase sign-in failed for ${this.config.email}: ${error.message}`);
    }
    if (!data.user) {
      throw new Error('Supabase sign-in returned no user.');
    }
    this.userId = data.user.id;
  }

  describe(): string {
    return `Supabase: ${this.config.url} (user ${this.config.email})`;
  }

  private requireUserId(): string {
    if (!this.userId) {
      throw new Error('Supabase store is not authenticated. Did init() run?');
    }
    return this.userId;
  }

  async list(): Promise<CalendarEvent[]> {
    const { data, error } = await this.client.from(TABLE).select('*');
    if (error) {
      throw new Error(`Failed to load events: ${error.message}`);
    }
    return ((data ?? []) as EventRow[]).map(fromRow);
  }

  async create(event: CalendarEvent): Promise<void> {
    const row = toRow(event, this.requireUserId());
    const { error } = await this.client.from(TABLE).insert(row);
    if (error) {
      throw new Error(`Failed to create event: ${error.message}`);
    }
  }

  async update(event: CalendarEvent): Promise<void> {
    const userId = this.requireUserId();
    const row = toRow(event, userId);
    const { data, error } = await this.client
      .from(TABLE)
      .update(row)
      .eq('id', event.id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      throw new Error(`Failed to update event: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new Error(`Event with ID ${event.id} not found.`);
    }
  }

  async remove(id: string): Promise<boolean> {
    const userId = this.requireUserId();
    const { data, error } = await this.client
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      throw new Error(`Failed to delete event: ${error.message}`);
    }
    return Boolean(data && data.length > 0);
  }
}
