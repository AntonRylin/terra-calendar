import { useCalendarStore } from './store';
import { useSettingsStore } from './settingsStore';
import { MemoryRepository } from '../data/memoryRepository';
import type { EventRepository } from '../data/repository';

beforeEach(async () => {
  useCalendarStore.setState({ events: [], toast: null, ready: false });
  useSettingsStore.setState({ categories: {} });
  await useCalendarStore.getState().init(new MemoryRepository());
});

describe('init', () => {
  it('loads events and sets ready', () => {
    expect(useCalendarStore.getState().ready).toBe(true);
    expect(useCalendarStore.getState().events).toEqual([]);
  });

  it('surfaces a load warning as a toast', async () => {
    const repo: EventRepository = {
      load: async () => ({ events: [], warning: 'data was corrupt' }),
      saveAll: async () => {},
    };
    await useCalendarStore.getState().init(repo);
    expect(useCalendarStore.getState().toast).toBe('data was corrupt');
  });
});

describe('addEvent', () => {
  it('adds an event with generated id and timestamps', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist', time: '14:30' });
    const [event] = useCalendarStore.getState().events;
    expect(event.id).toBeTruthy();
    expect(event).toMatchObject({
      title: 'Dentist',
      date: '2026-06-18',
      time: '14:30',
      recurrence: null,
    });
    expect(event.createdAt).toBeTruthy();
  });

  it('addEvent with isTask creates a dateless, calendar-less task', async () => {
    await useCalendarStore.getState().addEvent({ title: 'Buy milk', date: '', isTask: true });
    const task = useCalendarStore.getState().events.find((e) => e.title === 'Buy milk');
    expect(task).toBeTruthy();
    expect(task!.isTask).toBe(true);
    expect(task!.date).toBe('');
    expect(task!.calendarUrls).toBeUndefined();
    expect(task!.recurrence).toBeNull();
  });
});

describe('updateEvent', () => {
  it('patches fields and bumps updatedAt', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().updateEvent(id, {
      title: 'Dentist (moved)',
      recurrence: { unit: 'year', interval: 1 },
    });
    const [event] = useCalendarStore.getState().events;
    expect(event.title).toBe('Dentist (moved)');
    expect(event.recurrence).toEqual({ unit: 'year', interval: 1 });
  });
});

describe('deleteEvent', () => {
  it('removes the event', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().deleteEvent(id);
    expect(useCalendarStore.getState().events).toEqual([]);
  });
});

describe('deleteEvents', () => {
  it('removes multiple events in one operation, leaving the rest', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'A' });
    await useCalendarStore.getState().addEvent({ date: '2026-06-19', title: 'B' });
    await useCalendarStore.getState().addEvent({ date: '2026-06-20', title: 'C' });
    const [a, , c] = useCalendarStore.getState().events;
    await useCalendarStore.getState().deleteEvents([a.id, c.id]);
    expect(useCalendarStore.getState().events.map((e) => e.title)).toEqual(['B']);
  });
});

describe('renameCategory', () => {
  it('renames event categories globally', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Work', type: 'Job' });
    await useCalendarStore.getState().addEvent({ date: '2026-06-19', title: 'Relax', type: 'Hobby' });
    await useCalendarStore.getState().addEvent({ date: '2026-06-20', title: 'Meetings', type: 'Job' });

    await useCalendarStore.getState().renameCategory('Job', 'Career');

    const events = useCalendarStore.getState().events;
    expect(events.find((e) => e.title === 'Work')?.type).toBe('Career');
    expect(events.find((e) => e.title === 'Relax')?.type).toBe('Hobby');
    expect(events.find((e) => e.title === 'Meetings')?.type).toBe('Career');
  });
});

describe('category default reminders', () => {
  const workWithReminders = {
    Work: {
      type: 'color' as const,
      value: '#0a84ff',
      reminders: [
        { value: 1, unit: 'hours' as const },
        { value: 1, unit: 'days' as const },
      ],
    },
  };

  it('addEvent applies the category defaults on top of the event reminders', async () => {
    useSettingsStore.setState({ categories: workWithReminders });
    await useCalendarStore.getState().addEvent({
      date: '2026-06-18',
      title: 'Sprint review',
      type: 'Work',
      reminders: [{ value: 1, unit: 'hours' }, { value: 5, unit: 'minutes' }],
    });
    expect(useCalendarStore.getState().events[0].reminders).toEqual([
      { value: 1, unit: 'hours' },
      { value: 5, unit: 'minutes' },
      { value: 1, unit: 'days' },
    ]);
  });

  it('updateEvent moving an event into the category adds its reminders', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    useSettingsStore.setState({ categories: workWithReminders });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().updateEvent(id, { type: 'Work' });
    expect(useCalendarStore.getState().events[0].reminders).toEqual([
      { value: 1, unit: 'hours' },
      { value: 1, unit: 'days' },
    ]);
  });

  it('updateEvent does not re-add defaults when the category is unchanged', async () => {
    useSettingsStore.setState({ categories: workWithReminders });
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Standup', type: 'Work' });
    const id = useCalendarStore.getState().events[0].id;
    // Simulate the user stripping the defaults, then editing something else.
    await useCalendarStore.getState().updateEvent(id, { reminders: [] });
    await useCalendarStore.getState().updateEvent(id, { type: 'Work', title: 'Standup (moved)' });
    expect(useCalendarStore.getState().events[0].reminders).toEqual([]);
  });

  it('updateEvent respects an explicit reminder list in the patch (form saves win)', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    useSettingsStore.setState({ categories: workWithReminders });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().updateEvent(id, { type: 'Work', reminders: [{ value: 5, unit: 'minutes' }] });
    expect(useCalendarStore.getState().events[0].reminders).toEqual([{ value: 5, unit: 'minutes' }]);
  });
});

describe('syncCategoryReminders', () => {
  it('adds and removes reminders on the category events, leaving others alone', async () => {
    await useCalendarStore.getState().addEvent({
      date: '2026-06-18',
      title: 'Family dinner',
      type: 'Work',
      reminders: [{ value: 30, unit: 'minutes' }],
    });
    await useCalendarStore.getState().addEvent({ date: '2026-06-19', title: 'Relax', type: 'Hobby' });
    const hobbyBefore = useCalendarStore.getState().events.find((e) => e.type === 'Hobby')!;

    await useCalendarStore.getState().syncCategoryReminders(
      'Work',
      [{ value: 1, unit: 'days' }],
      [{ value: 30, unit: 'minutes' }],
    );

    const events = useCalendarStore.getState().events;
    expect(events.find((e) => e.type === 'Work')?.reminders).toEqual([{ value: 1, unit: 'days' }]);
    // Untouched event keeps its object identity (no updatedAt bump).
    expect(events.find((e) => e.type === 'Hobby')).toBe(hobbyBefore);
  });

  it('does not duplicate reminders an event already has, and clears empty lists', async () => {
    await useCalendarStore.getState().addEvent({
      date: '2026-06-18',
      title: 'A',
      type: 'Work',
      reminders: [{ value: 1, unit: 'hours' }],
    });
    await useCalendarStore.getState().addEvent({
      date: '2026-06-19',
      title: 'B',
      type: 'Work',
      reminders: [{ value: 5, unit: 'minutes' }],
    });

    await useCalendarStore.getState().syncCategoryReminders('Work', [{ value: 1, unit: 'hours' }], []);
    const [a, b] = useCalendarStore.getState().events;
    expect(a.reminders).toEqual([{ value: 1, unit: 'hours' }]);
    expect(b.reminders).toEqual([{ value: 5, unit: 'minutes' }, { value: 1, unit: 'hours' }]);

    await useCalendarStore.getState().syncCategoryReminders(
      'Work',
      [],
      [{ value: 1, unit: 'hours' }, { value: 5, unit: 'minutes' }],
    );
    expect(useCalendarStore.getState().events.map((e) => e.reminders)).toEqual([undefined, undefined]);
  });

  it('is a no-op (no undo step) when nothing would change', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'A', type: 'Work' });
    const eventBefore = useCalendarStore.getState().events[0];
    await useCalendarStore.getState().syncCategoryReminders('Work', [], [{ value: 9, unit: 'hours' }]);
    expect(useCalendarStore.getState().events[0]).toBe(eventBefore);
    expect(useCalendarStore.getState().events[0].reminders).toBeUndefined();
  });
});

describe('undo / redo', () => {
  it('undoes a create and redoes it', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    expect(useCalendarStore.getState().events).toHaveLength(1);
    expect(useCalendarStore.getState().canUndo).toBe(true);

    await useCalendarStore.getState().undo();
    expect(useCalendarStore.getState().events).toHaveLength(0);
    expect(useCalendarStore.getState().canUndo).toBe(false);
    expect(useCalendarStore.getState().canRedo).toBe(true);

    await useCalendarStore.getState().redo();
    expect(useCalendarStore.getState().events.map((e) => e.title)).toEqual(['Dentist']);
    expect(useCalendarStore.getState().canRedo).toBe(false);
  });

  it('undoes a delete, restoring the event', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().deleteEvent(id);
    expect(useCalendarStore.getState().events).toEqual([]);

    await useCalendarStore.getState().undo();
    expect(useCalendarStore.getState().events.map((e) => e.title)).toEqual(['Dentist']);
  });

  it('walks back through multiple actions in order', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'A' });
    await useCalendarStore.getState().addEvent({ date: '2026-06-19', title: 'B' });

    await useCalendarStore.getState().undo();
    expect(useCalendarStore.getState().events.map((e) => e.title)).toEqual(['A']);
    await useCalendarStore.getState().undo();
    expect(useCalendarStore.getState().events).toEqual([]);
  });

  it('clears the redo stack once a new action is taken after an undo', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'A' });
    await useCalendarStore.getState().undo();
    expect(useCalendarStore.getState().canRedo).toBe(true);

    await useCalendarStore.getState().addEvent({ date: '2026-06-19', title: 'B' });
    expect(useCalendarStore.getState().canRedo).toBe(false);
  });

  it('is a no-op with a toast when there is nothing to undo or redo', async () => {
    await useCalendarStore.getState().undo();
    expect(useCalendarStore.getState().toast).toBe('Nothing to undo');
    await useCalendarStore.getState().redo();
    expect(useCalendarStore.getState().toast).toBe('Nothing to redo');
  });
});

describe('failed persistence', () => {
  it('rolls back state and shows a toast when saveAll rejects', async () => {
    const repo: EventRepository = {
      load: async () => ({ events: [] }),
      saveAll: async () => {
        throw new Error('disk full');
      },
    };
    await useCalendarStore.getState().init(repo);
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    expect(useCalendarStore.getState().events).toEqual([]);
    expect(useCalendarStore.getState().toast).toContain('Saving failed — disk full');
  });
});

describe('cloud refresh / seed', () => {
  const evA = { id: 'a', title: 'A', date: '2026-06-01', recurrence: null, createdAt: '', updatedAt: 't1' };
  const evB = { id: 'b', title: 'B', date: '2026-06-02', recurrence: null, createdAt: '', updatedAt: 't1' };

  it('refresh() pulls the latest events from the repository', async () => {
    let server = [evA];
    const repo = { load: async () => ({ events: [...server] }), saveAll: async () => {} };
    await useCalendarStore.getState().init(repo);
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual(['a']);
    server = [evA, evB]; // another device added evB
    await useCalendarStore.getState().refresh();
    expect(useCalendarStore.getState().events.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('seedFrom() sets events, persists them, and records no undo', async () => {
    const saved: unknown[] = [];
    const repo = { load: async () => ({ events: [] }), saveAll: async (e: unknown[]) => { saved.push(...e); } };
    await useCalendarStore.getState().init(repo);
    await useCalendarStore.getState().seedFrom([evA]);
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual(['a']);
    expect((saved as { id: string }[]).map((e) => e.id)).toEqual(['a']);
    expect(useCalendarStore.getState().canUndo).toBe(false);
  });
});
