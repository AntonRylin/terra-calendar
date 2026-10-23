import type { CalendarEvent } from '../core/types';

export const STORE_VERSION = 1;

export type ParseResult =
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; error: string };

export function serializeStore(events: CalendarEvent[]): string {
  return JSON.stringify({ version: STORE_VERSION, events }, null, 2);
}

export function parseStore(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'not an object' };
  }
  const store = data as { version?: unknown; events?: unknown };
  if (store.version !== STORE_VERSION) {
    return { ok: false, error: `unsupported version ${String(store.version)}` };
  }
  if (!Array.isArray(store.events)) {
    return { ok: false, error: 'events is not an array' };
  }
  // Legacy dateless records predate isTask. Preserve their content and expose
  // them as tasks; otherwise CalDAV receives an empty DTSTART / NaN DTEND and
  // rejects the upload, blocking every event later in the same sync pass.
  const events = (store.events as CalendarEvent[]).map((event) =>
    event?.date === '' ? { ...event, isTask: true as const } : event,
  );
  return { ok: true, events };
}
