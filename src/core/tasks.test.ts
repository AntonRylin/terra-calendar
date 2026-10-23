import { describe, it, expect } from 'vitest';
import { isTaskEvent } from './tasks';
import { expandOccurrences } from './occurrences';
import { isSpan } from './spans';
import type { CalendarEvent } from './types';

const task: CalendarEvent = {
  id: 't1', title: 'Buy milk', date: '', isTask: true, recurrence: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const event: CalendarEvent = {
  id: 'e1', title: 'Dentist', date: '2026-02-10', recurrence: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('tasks', () => {
  it('isTaskEvent is true only for tasks', () => {
    expect(isTaskEvent(task)).toBe(true);
    expect(isTaskEvent(event)).toBe(false);
  });

  it('recognizes legacy dateless tasks even when isTask was never stored', () => {
    const legacy = { ...event, date: '' };
    expect(isTaskEvent(legacy)).toBe(true);
    expect(expandOccurrences(legacy, '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('a task has no occurrences and is not a span', () => {
    expect(expandOccurrences(task, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(isSpan(task)).toBe(false);
  });

  it('a normal event still expands', () => {
    expect(expandOccurrences(event, '2026-01-01', '2026-12-31')).toEqual(['2026-02-10']);
  });
});
