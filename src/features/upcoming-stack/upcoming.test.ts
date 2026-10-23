import type { CalendarEvent } from '../../core/types';
import type { CategoryConfig } from '../../app/settingsStore';
import { buildOngoing, buildUpcoming, buildTasks, describeOngoingSpan, viewTasks, viewUpcoming, viewOngoing, DEFAULT_UPCOMING_VIEW, clampDensity } from './upcoming';


const base = {
  recurrence: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildUpcoming', () => {
  const today = '2026-06-12';

  it('lists future one-time events sorted soonest-first', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Later', date: '2026-06-20', recurrence: null },
      { ...base, id: '2', title: 'Sooner', date: '2026-06-13', recurrence: null },
    ];
    expect(buildUpcoming(events, today, 'UTC').map((i) => i.event.title)).toEqual(['Sooner', 'Later']);
  });

  it('excludes past one-time events but includes today', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Past', date: '2026-06-01', recurrence: null },
      { ...base, id: '2', title: 'Today', date: '2026-06-12', recurrence: null },
    ];
    expect(buildUpcoming(events, today, 'UTC').map((i) => i.event.title)).toEqual(['Today']);
  });

  it('lists only the NEXT occurrence of a recurring event', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Gym', date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } },
    ];
    const items = buildUpcoming(events, today, 'UTC');
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-06-15');
  });

  it('sorts same-day events all-day first, then by time', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Timed', date: '2026-06-13', time: '09:00', recurrence: null },
      { ...base, id: '2', title: 'AllDay', date: '2026-06-13', recurrence: null },
    ];
    expect(buildUpcoming(events, today, 'UTC').map((i) => i.event.title)).toEqual(['AllDay', 'Timed']);
  });

  it('respects the horizon', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Far', date: '2028-01-01', recurrence: null },
    ];
    expect(buildUpcoming(events, today, 'UTC', 365)).toEqual([]);
  });

  it('lists a future span once, keyed at its start date', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Trip', date: '2026-06-20', endDate: '2026-06-30', type: 'holiday' },
    ];
    const items = buildUpcoming(events, today, 'UTC');
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-06-20');
  });

  it('excludes an ongoing span (it belongs to the Ongoing section)', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Now', date: '2026-06-10', endDate: '2026-06-15', type: 'holiday' },
    ];
    expect(buildUpcoming(events, today, 'UTC')).toEqual([]);
  });

  it('excludes a past span', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Old', date: '2026-06-01', endDate: '2026-06-05', type: 'holiday' },
    ];
    expect(buildUpcoming(events, today, 'UTC')).toEqual([]);
  });

  it('places a timed event on the day it falls in the display timezone', () => {
    // 23:00 in New York on Jun 15 is 12:00 the next day in Tokyo.
    const events: CalendarEvent[] = [
      {
        ...base,
        id: '1',
        title: 'Late call',
        date: '2026-06-15',
        time: '23:00',
        tz: 'America/New_York',
        recurrence: null,
      },
    ];
    const items = buildUpcoming(events, '2026-06-12', 'Asia/Tokyo');
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-06-16');
    expect(items[0].time).toBe('12:00');
  });

  it('handles yearly recurring event shifted by one day', () => {
    const event: CalendarEvent = {
      ...base,
      id: 'yearly-test',
      title: 'Yearly Event',
      date: '2026-06-05',
      recurrence: { unit: 'year', interval: 1 },
    };

    // Before shift, today is 2026-06-15, next occurrence should be 2027-06-05
    let items = buildUpcoming([event], '2026-06-15', 'UTC');
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2027-06-05');

    // Shift the event start date to 2026-06-06 (shift of 1 day)
    const shiftedEvent = { ...event, date: '2026-06-06' };
    items = buildUpcoming([shiftedEvent], '2026-06-15', 'UTC');
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2027-06-06');
  });
});

describe('buildOngoing', () => {
  const today = '2026-06-12';

  it('returns spans currently in progress with start and end', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Now', date: '2026-06-10', endDate: '2026-06-15', type: 'holiday' },
    ];
    const items = buildOngoing(events, today);
    expect(items).toHaveLength(1);
    expect(items[0].event.id).toBe('1');
    expect(items[0].start).toBe('2026-06-10');
    expect(items[0].end).toBe('2026-06-15');
  });

  it('includes spans on their first and last day (inclusive bounds)', () => {
    const events: CalendarEvent[] = [
      { ...base, id: 'startsToday', title: 'A', date: '2026-06-12', endDate: '2026-06-20', type: 'holiday' },
      { ...base, id: 'endsToday', title: 'B', date: '2026-06-01', endDate: '2026-06-12', type: 'holiday' },
    ];
    expect(buildOngoing(events, today).map((i) => i.event.id).sort()).toEqual(['endsToday', 'startsToday']);
  });

  it('excludes future spans, past spans, and single-day events', () => {
    const events: CalendarEvent[] = [
      { ...base, id: 'future', title: 'F', date: '2026-06-20', endDate: '2026-06-25', type: 'holiday' },
      { ...base, id: 'past', title: 'P', date: '2026-06-01', endDate: '2026-06-05', type: 'holiday' },
      { ...base, id: 'single', title: 'S', date: '2026-06-12' },
    ];
    expect(buildOngoing(events, today)).toEqual([]);
  });

  it('sorts by end date, soonest ending first', () => {
    const events: CalendarEvent[] = [
      { ...base, id: 'late', title: 'Late', date: '2026-06-01', endDate: '2026-06-30', type: 'holiday' },
      { ...base, id: 'early', title: 'Early', date: '2026-06-05', endDate: '2026-06-14', type: 'holiday' },
    ];
    expect(buildOngoing(events, today).map((i) => i.event.id)).toEqual(['early', 'late']);
  });
});

describe('describeOngoingSpan', () => {
  const today = '2026-06-12';

  it('reports elapsed and remaining days', () => {
    expect(describeOngoingSpan('2026-06-09', '2026-06-17', today)).toBe(
      'Multi-day event started 3 days ago and ends in 5 days',
    );
  });

  it('singularises a one-day distance', () => {
    expect(describeOngoingSpan('2026-06-11', '2026-06-13', today)).toBe(
      'Multi-day event started 1 day ago and ends in 1 day',
    );
  });

  it('says "today" on the first and last day', () => {
    expect(describeOngoingSpan('2026-06-12', '2026-06-20', today)).toBe(
      'Multi-day event started today and ends in 8 days',
    );
    expect(describeOngoingSpan('2026-06-01', '2026-06-12', today)).toBe(
      'Multi-day event started 11 days ago and ends today',
    );
  });
});

describe('viewUpcoming and viewOngoing filtering', () => {
  const today = '2026-06-12';
  const mockEvents: CalendarEvent[] = [
    { ...base, id: '1', title: 'Work Event', date: '2026-06-15', type: 'Work' },
    { ...base, id: '2', title: 'Personal Event', date: '2026-06-16', type: 'Personal' },
    { ...base, id: '3', title: 'Uncategorized Event', date: '2026-06-17' },
    { ...base, id: '4', title: 'Ongoing Work Span', date: '2026-06-10', endDate: '2026-06-15', type: 'Work' },
    { ...base, id: '5', title: 'Ongoing Uncategorized Span', date: '2026-06-10', endDate: '2026-06-15' },
  ];

  it('viewUpcoming filters correctly by category', () => {
    const upcomingItems = buildUpcoming(mockEvents, today, 'UTC');
    // empty selection = all categories
    const allFiltered = viewUpcoming(upcomingItems, { ...DEFAULT_UPCOMING_VIEW, categories: [] });
    expect(allFiltered.map((i) => i.event.id).sort()).toEqual(['1', '2', '3']);

    // single "Work" category
    const workFiltered = viewUpcoming(upcomingItems, { ...DEFAULT_UPCOMING_VIEW, categories: ['Work'] });
    expect(workFiltered.map((i) => i.event.id)).toEqual(['1']);

    // "none" matches uncategorized
    const noneFiltered = viewUpcoming(upcomingItems, { ...DEFAULT_UPCOMING_VIEW, categories: ['none'] });
    expect(noneFiltered.map((i) => i.event.id)).toEqual(['3']);

    // multiple categories = OR (Work or uncategorized)
    const orFiltered = viewUpcoming(upcomingItems, { ...DEFAULT_UPCOMING_VIEW, categories: ['Work', 'none'] });
    expect(orFiltered.map((i) => i.event.id).sort()).toEqual(['1', '3']);
  });

  it('viewOngoing filters correctly by category', () => {
    const ongoingItems = buildOngoing(mockEvents, today);
    // empty selection = all categories
    const allFiltered = viewOngoing(ongoingItems, { ...DEFAULT_UPCOMING_VIEW, categories: [] });
    expect(allFiltered.map((i) => i.event.id).sort()).toEqual(['4', '5']);

    // single "Work" category
    const workFiltered = viewOngoing(ongoingItems, { ...DEFAULT_UPCOMING_VIEW, categories: ['Work'] });
    expect(workFiltered.map((i) => i.event.id)).toEqual(['4']);

    // "none" matches uncategorized
    const noneFiltered = viewOngoing(ongoingItems, { ...DEFAULT_UPCOMING_VIEW, categories: ['none'] });
    expect(noneFiltered.map((i) => i.event.id)).toEqual(['5']);

    // multiple categories = OR (Work or uncategorized)
    const orFiltered = viewOngoing(ongoingItems, { ...DEFAULT_UPCOMING_VIEW, categories: ['Work', 'none'] });
    expect(orFiltered.map((i) => i.event.id).sort()).toEqual(['4', '5']);
  });
});

describe('clampDensity', () => {
  it('clamps values below the minimum', () => {
    expect(clampDensity(0.5)).toBe(0.7);
    expect(clampDensity(-1)).toBe(0.7);
  });

  it('clamps values above the maximum', () => {
    expect(clampDensity(1.5)).toBe(1.3);
    expect(clampDensity(5)).toBe(1.3);
  });

  it('rounds values to the nearest step of 0.05', () => {
    expect(clampDensity(0.97)).toBe(0.95);
    expect(clampDensity(0.98)).toBe(1.00);
    expect(clampDensity(1.02)).toBe(1.00);
    expect(clampDensity(1.03)).toBe(1.05);
    expect(clampDensity(1.14)).toBe(1.15);
  });

  it('handles NaN/invalid values by returning 1.0', () => {
    expect(clampDensity(NaN)).toBe(1.0);
    expect(clampDensity(Infinity)).toBe(1.3); // Infinity is clamped to MAX (1.3)
    expect(clampDensity(-Infinity)).toBe(0.7); // -Infinity is clamped to MIN (0.7)
  });

  it('preserves exact steps', () => {
    expect(clampDensity(0.7)).toBe(0.7);
    expect(clampDensity(1.0)).toBe(1.0);
    expect(clampDensity(1.3)).toBe(1.3);
  });
});

describe('buildTasks', () => {
  const taskA: CalendarEvent = { ...base, id: 'a', title: 'A', date: '', isTask: true, updatedAt: '2026-01-02T00:00:00Z' };
  const taskB: CalendarEvent = { ...base, id: 'b', title: 'B', date: '', isTask: true, updatedAt: '2026-01-05T00:00:00Z' };
  const ev: CalendarEvent = { ...base, id: 'e', title: 'E', date: '2026-06-01' };

  it('returns only tasks, most-recently-edited first', () => {
    expect(buildTasks([taskA, ev, taskB]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('tasks never appear in the dated upcoming or ongoing lists', () => {
    expect(buildUpcoming([taskA, ev], '2026-01-01', 'UTC').some((i) => i.event.isTask)).toBe(false);
    expect(buildOngoing([taskA, ev], '2026-01-01').some((i) => i.event.isTask)).toBe(false);
  });
});

describe('viewTasks', () => {
  const t1: CalendarEvent = { ...base, id: 't1', title: 'Buy milk', date: '', isTask: true, type: 'Home' };
  const t2: CalendarEvent = { ...base, id: 't2', title: 'Call bank', date: '', isTask: true };

  it('passes all tasks through with the default view', () => {
    expect(viewTasks([t1, t2], DEFAULT_UPCOMING_VIEW).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('filters by search query and category', () => {
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, query: 'milk' }).map((t) => t.id)).toEqual(['t1']);
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, categories: ['Home'] }).map((t) => t.id)).toEqual(['t1']);
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, categories: ['none'] }).map((t) => t.id)).toEqual(['t2']);
  });

  it('hides tasks under the Timed and Repeating filters', () => {
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, timing: 'timed' })).toEqual([]);
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, repeat: 'repeating' })).toEqual([]);
  });

  it('respects the Type filter', () => {
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, type: 'events' })).toEqual([]);
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, type: 'tasks' }).map((t) => t.id)).toEqual(['t1', 't2']);
    // Under "Tasks", the event-only Timing/Repeat filters don't hide tasks.
    expect(viewTasks([t1, t2], { ...DEFAULT_UPCOMING_VIEW, type: 'tasks', timing: 'timed' }).map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('the Type filter "tasks" hides dated events from viewUpcoming/viewOngoing', () => {
    const ev: CalendarEvent = { ...base, id: 'e', title: 'E', date: '2026-06-01' };
    const span: CalendarEvent = { ...base, id: 's', title: 'S', date: '2026-05-30', endDate: '2026-06-10', type: 'holiday' };
    expect(viewUpcoming(buildUpcoming([ev], '2026-01-01', 'UTC'), { ...DEFAULT_UPCOMING_VIEW, type: 'tasks' })).toEqual([]);
    expect(viewOngoing(buildOngoing([span], '2026-06-05'), { ...DEFAULT_UPCOMING_VIEW, type: 'tasks' })).toEqual([]);
  });
});

describe('showInUpcoming filtering', () => {
  const today = '2026-06-12';

  it('excludes events where showInUpcoming is false from buildUpcoming', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Visible', date: '2026-06-13', recurrence: null },
      { ...base, id: '2', title: 'Hidden', date: '2026-06-14', recurrence: null, showInUpcoming: false },
    ];
    expect(buildUpcoming(events, today, 'UTC').map((i) => i.event.title)).toEqual(['Visible']);
  });

  it('excludes spans where showInUpcoming is false from buildOngoing', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Visible Span', date: '2026-06-10', endDate: '2026-06-15', type: 'holiday' },
      { ...base, id: '2', title: 'Hidden Span', date: '2026-06-10', endDate: '2026-06-15', type: 'holiday', showInUpcoming: false },
    ];
    expect(buildOngoing(events, today).map((i) => i.event.title)).toEqual(['Visible Span']);
  });

  it('excludes tasks where showInUpcoming is false from buildTasks', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Visible Task', date: '', isTask: true },
      { ...base, id: '2', title: 'Hidden Task', date: '', isTask: true, showInUpcoming: false },
    ];
    expect(buildTasks(events).map((t) => t.title)).toEqual(['Visible Task']);
  });
});

describe('category hideFromUpcoming', () => {
  const today = '2026-06-12';
  const cats: Record<string, CategoryConfig> = {
    Chores: { type: 'color', value: '#30d158', hideFromUpcoming: true },
    Fun: { type: 'color', value: '#ff9f0a', hideFromMinimap: true },
  };

  it('excludes events of a hidden category from buildUpcoming', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Laundry', date: '2026-06-13', type: 'Chores' },
      { ...base, id: '2', title: 'Party', date: '2026-06-14', type: 'Fun' },
      { ...base, id: '3', title: 'Loose', date: '2026-06-15' },
    ];
    // Fun hides from the minimap only — it must stay in Upcoming.
    expect(buildUpcoming(events, today, 'UTC', 365, cats).map((i) => i.event.title))
      .toEqual(['Party', 'Loose']);
  });

  it('the per-event showInUpcoming flag cannot bring a hidden category back', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Laundry', date: '2026-06-13', type: 'Chores', showInUpcoming: true },
    ];
    expect(buildUpcoming(events, today, 'UTC', 365, cats)).toEqual([]);
  });

  it('excludes hidden-category spans from buildOngoing and tasks from buildTasks', () => {
    const span: CalendarEvent = { ...base, id: 's', title: 'Deep clean', date: '2026-06-10', endDate: '2026-06-15', type: 'Chores' };
    const task: CalendarEvent = { ...base, id: 't', title: 'Mop', date: '', isTask: true, type: 'Chores' };
    expect(buildOngoing([span], today, cats)).toEqual([]);
    expect(buildTasks([task], cats)).toEqual([]);
    // Without the category config both stay visible.
    expect(buildOngoing([span], today).map((i) => i.event.id)).toEqual(['s']);
    expect(buildTasks([task]).map((t) => t.id)).toEqual(['t']);
  });
});


