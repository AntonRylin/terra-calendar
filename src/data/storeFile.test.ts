import type { CalendarEvent } from '../core/types';
import { parseStore, serializeStore } from './storeFile';

const event: CalendarEvent = {
  id: 'abc',
  title: 'Dentist',
  date: '2026-06-12',
  time: '14:30',
  recurrence: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

describe('serializeStore / parseStore', () => {
  it('round-trips events with a version field', () => {
    const text = serializeStore([event]);
    expect(JSON.parse(text).version).toBe(1);
    const result = parseStore(text);
    expect(result).toEqual({ ok: true, events: [event] });
  });

  it('recovers legacy dateless records as tasks without losing their contents', () => {
    const legacy = { ...event, date: '', description: 'Keep this note' };
    const result = parseStore(JSON.stringify({ version: 1, events: [legacy, event] }));
    expect(result).toEqual({ ok: true, events: [{ ...legacy, isTask: true }, event] });
  });

  it('rejects invalid JSON', () => {
    expect(parseStore('{oops').ok).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(parseStore('"hello"').ok).toBe(false);
    expect(parseStore('null').ok).toBe(false);
  });

  it('rejects unknown versions', () => {
    expect(parseStore('{"version":99,"events":[]}').ok).toBe(false);
  });

  it('rejects a missing events array', () => {
    expect(parseStore('{"version":1}').ok).toBe(false);
    expect(parseStore('{"version":1,"events":"nope"}').ok).toBe(false);
  });
});
