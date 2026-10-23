export interface Recurrence {
  unit: 'week' | 'month' | 'year';
  /** 1 = every week/month/year, 2 = every 2nd, ... Always >= 1. */
  interval: number;
}

export interface CalendarEvent {
  id: string; // uuid
  title: string;
  description?: string;
  /** "YYYY-MM-DD", local wall-clock. First/anchor occurrence for recurring events. */
  date: string;
  /** "HH:mm", local wall-clock. Absent = all-day. */
  time?: string;
  /** IANA timezone the time is anchored to (e.g. "Europe/Berlin"). Absent on
   *  legacy/floating events — those are shown as-is, never converted. */
  tz?: string;
  recurrence: Recurrence | null;
  exdates?: string[];
  color?: string;
  showOnMinimap?: boolean;
  showInUpcoming?: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
