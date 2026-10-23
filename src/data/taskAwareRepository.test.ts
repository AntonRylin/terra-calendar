import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '../core/types';
import type { EventRepository } from './repository';

const loadTasks = vi.fn();
const saveTasks = vi.fn(async (_t: CalendarEvent[]) => {});
vi.mock('./taskStore', () => ({
  loadTasks: () => loadTasks(),
  saveTasks: (t: CalendarEvent[]) => saveTasks(t),
}));

import { TaskAwareRepository } from './taskAwareRepository';

const ev: CalendarEvent = { id: 'e', title: 'E', date: '2026-06-01', recurrence: null, createdAt: '', updatedAt: '' };
const task: CalendarEvent = { id: 't', title: 'T', date: '', isTask: true, recurrence: null, createdAt: '', updatedAt: '' };

function fakeInner(handlesTasks = false): EventRepository & { saved: CalendarEvent[] } {
  return {
    handlesTasks,
    saved: [],
    async load() { return { events: [ev] }; },
    async saveAll(events) { (this as { saved: CalendarEvent[] }).saved = events; },
  };
}

describe('TaskAwareRepository', () => {
  beforeEach(() => {
    loadTasks.mockReset();
    saveTasks.mockClear();
  });

  it('merges local tasks into load() when the backend cannot sync them', async () => {
    loadTasks.mockResolvedValue([task]);
    const repo = new TaskAwareRepository(fakeInner(false));
    const { events } = await repo.load();
    expect(events.map((e) => e.id).sort()).toEqual(['e', 't']);
  });

  it('routes tasks to the local store and the rest to the inner repo on save', async () => {
    const inner = fakeInner(false);
    const repo = new TaskAwareRepository(inner);
    await repo.saveAll([ev, task]);
    expect(saveTasks).toHaveBeenCalledWith([task]);
    expect(inner.saved.map((e) => e.id)).toEqual(['e']);
  });

  it('passes everything through when the backend handles tasks', async () => {
    loadTasks.mockResolvedValue([{ id: 'should-not-be-used' } as CalendarEvent]);
    const inner = fakeInner(true);
    const repo = new TaskAwareRepository(inner);
    await repo.saveAll([ev, task]);
    expect(saveTasks).not.toHaveBeenCalled();
    expect(inner.saved.map((e) => e.id)).toEqual(['e', 't']);
    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['e']); // no local tasks merged
  });
});
