import type { CalendarEvent } from '../../core/types';
import type { CategoryConfig } from '../../app/settingsStore';
import { collectTimelineBands, collectTimelineDots } from './timeline';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const START = '2026-04-01';
const END = '2026-09-30';

describe('collectTimelineDots', () => {
  it('includes only one-time events when filter is onetime', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Contract', date: '2026-05-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'One-off', date: '2026-05-01', recurrence: null },
    ];
    const dots = collectTimelineDots(events, START, END, 'onetime');
    expect(dots).toHaveLength(1);
    expect(dots[0].title).toBe('One-off');
  });

  it('includes recurring occurrences within the range when filter is recurring', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Weekly gym', date: '2026-05-01', recurrence: { unit: 'week', interval: 1 } },
      { ...base, id: '2', title: 'One-off', date: '2026-05-01', recurrence: null },
    ];
    const dots = collectTimelineDots(events, START, END, 'recurring');
    expect(dots.every((d) => d.title === 'Weekly gym')).toBe(true);
    expect(dots.length).toBeGreaterThan(1);
  });

  it('returns empty array when filter is none', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'One-off', date: '2026-05-01', recurrence: null },
    ];
    expect(collectTimelineDots(events, START, END, 'none')).toEqual([]);
  });

  it('excludes occurrences outside the range', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Before', date: '2026-01-15', recurrence: null },
      { ...base, id: '2', title: 'Inside', date: '2026-06-15', recurrence: null },
      { ...base, id: '3', title: 'After', date: '2026-12-15', recurrence: null },
    ];
    const dots = collectTimelineDots(events, START, END, 'all');
    expect(dots.map((d) => d.title)).toEqual(['Inside']);
  });

  it('sorts dots by date and stacks near-coincident ones', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-05-10', recurrence: null },
      { ...base, id: '2', title: 'B', date: '2026-05-11', recurrence: null },
      { ...base, id: '3', title: 'C', date: '2026-08-01', recurrence: null },
    ];
    const dots = collectTimelineDots(events, START, END, 'all');
    const a = dots.find((d) => d.date === '2026-05-10')!;
    const b = dots.find((d) => d.date === '2026-05-11')!;
    const c = dots.find((d) => d.date === '2026-08-01')!;
    expect(a.level).toBe(0);
    expect(b.level).toBe(1);
    expect(c.level).toBe(0);
  });

  it('skips events with showOnMinimap false and multi-day spans', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Off', date: '2026-05-01', recurrence: null, showOnMinimap: false },
      { ...base, id: '2', title: 'Span', date: '2026-05-02', endDate: '2026-05-09', recurrence: null },
    ];
    expect(collectTimelineDots(events, START, END, 'all')).toEqual([]);
  });

  it('skips dots and bands of a category hidden from the minimap', () => {
    const cats: Record<string, CategoryConfig> = {
      Work: { type: 'color', value: '#0a84ff', hideFromMinimap: true },
      Fun: { type: 'color', value: '#30d158', hideFromUpcoming: true },
    };
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Standup', date: '2026-05-01', recurrence: null, type: 'Work' },
      { ...base, id: '2', title: 'Party', date: '2026-05-06', recurrence: null, type: 'Fun' },
      { ...base, id: '3', title: 'Sprint', date: '2026-05-10', endDate: '2026-05-20', recurrence: null, type: 'Work' },
      { ...base, id: '4', title: 'Festival', date: '2026-06-01', endDate: '2026-06-05', recurrence: null, type: 'Fun' },
    ];
    // Fun hides from Upcoming only — it must stay on the minimap.
    expect(collectTimelineDots(events, START, END, 'all', cats).map((d) => d.title)).toEqual(['Party']);
    expect(collectTimelineBands(events, START, END, 'all', cats).map((b) => b.title)).toEqual(['Festival']);
  });

  it('uses cosmetic swatch colour, overriding event.color', () => {
    const cats: Record<string, CategoryConfig> = {};
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-05-01', recurrence: null, color: '#111111', cosmetic: 'ocean' },
    ];
    const dots = collectTimelineDots(events, START, END, 'all', cats);
    expect(dots[0].color).toBe('#185fa5');
  });
});

describe('collectTimelineBands', () => {
  it('returns one band per span clamped to the range', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Long', date: '2026-03-20', endDate: '2026-04-10', recurrence: null },
    ];
    const bands = collectTimelineBands(events, START, END, 'all');
    expect(bands).toHaveLength(1);
    expect(bands[0].start).toBe('2026-04-01'); // clamped to range start
    expect(bands[0].end).toBe('2026-04-10');
  });

  it('ignores single-day events and respects none/recurring filters', () => {
    const span: CalendarEvent = { ...base, id: '1', title: 'Trip', date: '2026-06-01', endDate: '2026-06-10', recurrence: null };
    const single: CalendarEvent = { ...base, id: '2', title: 'One-off', date: '2026-06-01', recurrence: null };
    expect(collectTimelineBands([single], START, END, 'all')).toEqual([]);
    expect(collectTimelineBands([span], START, END, 'none')).toEqual([]);
    expect(collectTimelineBands([span], START, END, 'recurring')).toEqual([]);
    expect(collectTimelineBands([span], START, END, 'onetime')).toHaveLength(1);
  });

  it('splits into sub-bands around a day toggled off the minimap', () => {
    const span: CalendarEvent = {
      ...base, id: '1', title: 'Trip', date: '2026-06-10', endDate: '2026-06-20', recurrence: null,
      dayOverrides: { '2026-06-15': { showOnMinimap: false } },
    };
    const bands = collectTimelineBands([span], START, END, 'all');
    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({ start: '2026-06-10', end: '2026-06-14' });
    expect(bands[1]).toMatchObject({ start: '2026-06-16', end: '2026-06-20' });
  });

  it('excludes spans that do not intersect the range', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Last year', date: '2025-06-01', endDate: '2025-06-10', recurrence: null },
    ];
    expect(collectTimelineBands(events, START, END, 'all')).toEqual([]);
  });
});
