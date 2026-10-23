import type { CalendarEvent } from '../../core/types';
import type { CategoryConfig } from '../../app/settingsStore';
import { daysInYear } from '../../core/dates';
import { computeYearBands, computeYearDots } from './circle';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('computeYearDots', () => {
  it('includes only one-time events when filter is onetime', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Contract', date: '2026-04-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'Weekly gym', date: '2026-04-01', recurrence: { unit: 'week', interval: 1 } },
      { ...base, id: '3', title: 'One-off', date: '2026-04-01', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100, 'onetime');
    expect(dots).toHaveLength(1);
    expect(dots[0].title).toBe('One-off');
  });

  it('includes all recurring events when filter is recurring', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Contract', date: '2026-04-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'Weekly gym', date: '2026-04-01', recurrence: { unit: 'week', interval: 1 } },
      { ...base, id: '3', title: 'One-off', date: '2026-04-01', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100, 'recurring');
    const uniqueTitles = Array.from(new Set(dots.map((d) => d.title))).sort();
    expect(uniqueTitles).toEqual(['Contract', 'Weekly gym']);
  });

  it('includes all events when filter is all', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Contract', date: '2026-04-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'Weekly gym', date: '2026-04-01', recurrence: { unit: 'week', interval: 1 } },
      { ...base, id: '3', title: 'One-off', date: '2026-04-01', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100, 'all');
    const uniqueTitles = Array.from(new Set(dots.map((d) => d.title))).sort();
    expect(uniqueTitles).toEqual(['Contract', 'One-off', 'Weekly gym']);
  });

  it('returns empty array when filter is none', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Contract', date: '2026-04-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'Weekly gym', date: '2026-04-01', recurrence: { unit: 'week', interval: 1 } },
      { ...base, id: '3', title: 'One-off', date: '2026-04-01', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100, 'none');
    expect(dots).toEqual([]);
  });

  it('places Jan 1 at angle 0 and advances clockwise', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'NY', date: '2026-01-01', recurrence: null },
      { ...base, id: '2', title: 'Mid', date: '2026-07-02', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100);
    expect(dots[0].angle).toBeCloseTo(0);
    // Jul 2 is day 183 of 365 — almost exactly half the year.
    expect(dots[1].angle).toBeCloseTo(Math.PI, 1);
  });

  it('offsets near-coincident dots radially so none is hidden', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-05-10', recurrence: null },
      { ...base, id: '2', title: 'B', date: '2026-05-11', recurrence: null },
      { ...base, id: '3', title: 'C', date: '2026-09-01', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100);
    const may10 = dots.find((d) => d.date === '2026-05-10')!;
    const may11 = dots.find((d) => d.date === '2026-05-11')!;
    const sep = dots.find((d) => d.date === '2026-09-01')!;
    expect(may10.radius).toBe(100);
    expect(may11.radius).toBeLessThan(100);
    expect(sep.radius).toBe(100);
  });

  it('keeps radius positive for a long chain of near-coincident dots', () => {
    // 20 events spaced ~3 days apart form one unbroken near-chain;
    // without a floor, level would grow until radius hit zero or went negative.
    const events: CalendarEvent[] = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i * 3));
      return {
        ...base,
        id: String(i),
        title: `E${i}`,
        date: d.toISOString().slice(0, 10),
        recurrence: null,
      };
    });
    const baseRadius = 100;
    const dots = computeYearDots(events, 2026, baseRadius);
    expect(dots).toHaveLength(20);
    for (const dot of dots) {
      expect(dot.radius).toBeGreaterThan(0);
      expect(dot.radius).toBeGreaterThanOrEqual(baseRadius * 0.4);
      expect(dot.radius).toBeLessThanOrEqual(baseRadius);
    }
  });

  it('skips a yearly event whose interval misses this year', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Biennial', date: '2025-06-01', recurrence: { unit: 'year', interval: 2 } },
    ];
    expect(computeYearDots(events, 2026, 100, 'all')).toEqual([]);
    expect(computeYearDots(events, 2027, 100, 'all')).toHaveLength(1);
  });

  it('skips events that have showOnMinimap set to false', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'On Map', date: '2026-04-01', recurrence: null },
      { ...base, id: '2', title: 'Off Map', date: '2026-04-01', recurrence: null, showOnMinimap: false },
    ];
    const dots = computeYearDots(events, 2026, 100, 'all');
    expect(dots).toHaveLength(1);
    expect(dots[0].title).toBe('On Map');
  });

  it('does not render a multi-day span as per-day dots', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Trip', date: '2026-06-10', endDate: '2026-06-20', recurrence: null },
    ];
    expect(computeYearDots(events, 2026, 100, 'all')).toEqual([]);
  });

  it('skips events whose category hides them from the minimap', () => {
    const cats: Record<string, CategoryConfig> = {
      Work: { type: 'color', value: '#0a84ff', hideFromMinimap: true },
      Fun: { type: 'color', value: '#30d158', hideFromUpcoming: true },
    };
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Standup', date: '2026-04-01', recurrence: null, type: 'Work' },
      { ...base, id: '2', title: 'Party', date: '2026-04-06', recurrence: null, type: 'Fun' },
      { ...base, id: '3', title: 'Loose', date: '2026-04-11', recurrence: null },
    ];
    // Fun hides from Upcoming only — it must stay on the minimap.
    const dots = computeYearDots(events, 2026, 100, 'all', cats);
    expect(dots.map((d) => d.title)).toEqual(['Party', 'Loose']);
    // The per-event flag cannot bring a hidden category back.
    const forced = [{ ...events[0], showOnMinimap: true }];
    expect(computeYearDots(forced, 2026, 100, 'all', cats)).toEqual([]);
  });
});

describe('computeYearBands', () => {
  it('returns one band per span with start before end, clockwise from Jan 1', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Trip', date: '2026-01-01', endDate: '2026-01-10', recurrence: null },
    ];
    const bands = computeYearBands(events, 2026, 'all');
    expect(bands).toHaveLength(1);
    expect(bands[0].startAngle).toBeCloseTo(0);
    expect(bands[0].endAngle).toBeCloseTo((2 * Math.PI * 10) / daysInYear(2026));
    expect(bands[0].endAngle).toBeGreaterThan(bands[0].startAngle);
  });

  it('ignores single-day events', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'One-off', date: '2026-04-01', recurrence: null },
    ];
    expect(computeYearBands(events, 2026, 'all')).toEqual([]);
  });

  it('clamps a span that overruns the year to the year bounds', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Long', date: '2025-12-20', endDate: '2026-01-10', recurrence: null },
    ];
    const bands = computeYearBands(events, 2026, 'all');
    expect(bands).toHaveLength(1);
    expect(bands[0].startAngle).toBeCloseTo(0); // clamped to Jan 1
  });

  it('excludes spans that do not intersect the year', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Last year', date: '2025-06-01', endDate: '2025-06-10', recurrence: null },
    ];
    expect(computeYearBands(events, 2026, 'all')).toEqual([]);
  });

  it('honours showOnMinimap and the none/recurring filters', () => {
    const span: CalendarEvent = { ...base, id: '1', title: 'Trip', date: '2026-06-01', endDate: '2026-06-10', recurrence: null };
    expect(computeYearBands([span], 2026, 'onetime')).toHaveLength(1);
    expect(computeYearBands([span], 2026, 'none')).toEqual([]);
    expect(computeYearBands([span], 2026, 'recurring')).toEqual([]);
    expect(computeYearBands([{ ...span, showOnMinimap: false }], 2026, 'all')).toEqual([]);
  });

  it('skips spans whose category hides them from the minimap', () => {
    const cats: Record<string, CategoryConfig> = {
      Trips: { type: 'color', value: '#0a84ff', hideFromMinimap: true },
    };
    const span: CalendarEvent = { ...base, id: '1', title: 'Trip', date: '2026-06-01', endDate: '2026-06-10', recurrence: null, type: 'Trips' };
    expect(computeYearBands([span], 2026, 'all', cats)).toEqual([]);
    expect(computeYearBands([span], 2026, 'all')).toHaveLength(1);
  });

  it('splits into sub-bands around a day toggled off the minimap', () => {
    const span: CalendarEvent = {
      ...base, id: '1', title: 'Trip', date: '2026-06-10', endDate: '2026-06-20', recurrence: null,
      dayOverrides: { '2026-06-15': { showOnMinimap: false } },
    };
    const bands = computeYearBands([span], 2026, 'all');
    expect(bands).toHaveLength(2);
    expect(bands[0].start).toBe('2026-06-10');
    expect(bands[0].end).toBe('2026-06-14');
    expect(bands[1].start).toBe('2026-06-16');
    expect(bands[1].end).toBe('2026-06-20');
  });

  it('shows only the per-day-on days when the whole span is off the map', () => {
    const span: CalendarEvent = {
      ...base, id: '1', title: 'Trip', date: '2026-06-10', endDate: '2026-06-20', recurrence: null,
      showOnMinimap: false,
      dayOverrides: { '2026-06-12': { showOnMinimap: true } },
    };
    const bands = computeYearBands([span], 2026, 'all');
    expect(bands).toHaveLength(1);
    expect(bands[0].start).toBe('2026-06-12');
    expect(bands[0].end).toBe('2026-06-12');
  });
});

describe('cosmetic colouring on the minimap', () => {
  const cats: Record<string, CategoryConfig> = {
    Trip: { type: 'color', value: '#34c759', cosmetic: 'aurora' },
  };

  it('uses a gradient cosmetic swatch for a dot, overriding event.color', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-04-01', recurrence: null, color: '#111111', cosmetic: 'ocean' },
    ];
    const dots = computeYearDots(events, 2026, 100, 'all', cats);
    expect(dots[0].color).toBe('#185fa5'); // ocean swatch, not #111111
  });

  it('keeps event.color for an effect cosmetic (no swatch)', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-04-01', recurrence: null, color: '#111111', cosmetic: 'glow' },
    ];
    const dots = computeYearDots(events, 2026, 100, 'all', cats);
    expect(dots[0].color).toBe('#111111');
  });

  it('falls back to a category default cosmetic for bands', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Trip', date: '2026-06-01', endDate: '2026-06-10', recurrence: null, type: 'Trip', color: '#111111' },
    ];
    const bands = computeYearBands(events, 2026, 'all', cats);
    expect(bands[0].color).toBe('#1d9e75'); // aurora swatch from the category
  });

  it('uses event.color when there is no cosmetic', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-04-01', recurrence: null, color: '#abcdef' },
    ];
    const dots = computeYearDots(events, 2026, 100, 'all');
    expect(dots[0].color).toBe('#abcdef');
  });
});
