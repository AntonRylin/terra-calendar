import { describe, it, expect } from 'vitest';
import { DEMO_EVENTS } from './QuickEntryDemo';
import { parseQuickEntry } from '../../core/timeParser';

describe('QuickEntryDemo examples', () => {
  // The demo exists to teach the syntax, so an example that no longer parses is
  // worse than no demo at all. This is the guard on that.
  it.each(DEMO_EVENTS.map((e) => [e.text, e] as const))(
    'parses %s into the event the demo shows',
    (_text, event) => {
      const parsed = parseQuickEntry(event.text);
      expect(parsed.time).toBe(event.time);
      expect(parsed.title).toBe(event.title);
    },
  );

  it('covers every input form the parser accepts', () => {
    const texts = DEMO_EVENTS.map((e) => e.text);
    // Four-digit times, e.g. "1230".
    expect(texts.some((t) => /^\d{4}\s/.test(t))).toBe(true);
    // Space-separated times, e.g. "9 30".
    expect(texts.some((t) => /^\d{1,2} \d{2}\s/.test(t))).toBe(true);
    // Colon-separated times, e.g. "14:00".
    expect(texts.some((t) => t.includes(':'))).toBe(true);
    // Eight-digit start+end run together, e.g. "05002015".
    expect(texts.some((t) => /^\d{8}\s/.test(t))).toBe(true);
    // All three range separators.
    expect(texts.some((t) => / to /.test(t))).toBe(true);
    expect(texts.some((t) => /\d-\d/.test(t))).toBe(true);
    expect(texts.some((t) => /^\d{4} \d{4}\s/.test(t))).toBe(true);
    // A lone start time, and no time at all.
    expect(DEMO_EVENTS.some((e) => e.time !== null && parseQuickEntry(e.text).endTime === null)).toBe(true);
    expect(DEMO_EVENTS.some((e) => e.time === null)).toBe(true);
  });
});
