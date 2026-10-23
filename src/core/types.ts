export interface Recurrence {
  unit: 'day' | 'week' | 'month' | 'year';
  /** 1 = every day/week/month/year, 2 = every 2nd, ... Always >= 1. */
  interval: number;
}

/** Per-day customisation of a multi-day span (Phase 2). Keyed by "YYYY-MM-DD".
 *  Any field left undefined falls back to the span's value for that day. */
export interface DayOverride {
  title?: string;
  /** "HH:mm" — gives just this day a specific start time (otherwise all-day). */
  time?: string;
  /** Toggle just this day on/off the minimap. */
  showOnMinimap?: boolean;
}

export interface EventReminder {
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

export interface CalendarEvent {
  id: string; // uuid
  title: string;
  description?: string;
  /** "YYYY-MM-DD", local wall-clock. First/anchor occurrence for recurring events. */
  date: string;
  /** "YYYY-MM-DD", inclusive last day of a multi-day span. Absent or <= date
   *  means a normal single-day event. Spans are all-day (Phase 1). */
  endDate?: string;
  /** Open-ended category for spans (e.g. "holiday"). Drives default styling and
   *  future filtering. Absent on ordinary events. */
  type?: string;
  /** "HH:mm", local wall-clock. Absent = all-day. */
  time?: string;
  /** "HH:mm", local wall-clock end of a timed event on the same day. Only
   *  meaningful when `time` is set; absent means the default 1-hour duration. */
  endTime?: string;
  /** IANA timezone the time is anchored to (e.g. "Europe/Berlin"). Absent on
   *  legacy/floating events — those are shown as-is, never converted. */
  tz?: string;
  recurrence: Recurrence | null;
  exdates?: string[];
  /** Per-day overrides for a span (Phase 2). Keyed by "YYYY-MM-DD". */
  dayOverrides?: Record<string, DayOverride>;
  color?: string;
  /** Id of a prebuilt animated cosmetic (see core/cosmetics). Absent = plain. */
  cosmetic?: string;
  /** True for a dateless "task". Tasks carry date: '' and are excluded from all
   *  date-based views and from CalDAV sync. Absent on normal events. */
  isTask?: true;
  showOnMinimap?: boolean;
  showInUpcoming?: boolean;
  /** Calendar collection URLs this event is synced to. An event can live in
   *  several calendars at once (e.g. Apple "Main" + Google "Main"); the same
   *  UID is replicated to each. Empty/absent for purely-local events. */
  calendarUrls?: string[];
  reminders?: EventReminder[];
  /** Share ids this event is explicitly added to, beyond what the shares' own
   *  scope already covers. This is "share just this one event". */
  shareInclude?: string[];
  /** Share ids this event is explicitly withheld from, despite their scope
   *  covering it. This is "keep this one private". */
  shareExclude?: string[];
  /** Set ONLY on events received from someone else's share. Their presence
   *  means the event is not the user's own: it is rendered from the shared
   *  store and must never reach the sync engine. */
  sharedBy?: string;
  /** The share an incoming event arrived through. */
  shareId?: string;
  /** What this user may do with a received event. */
  shareAccess?: 'view' | 'edit';
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

