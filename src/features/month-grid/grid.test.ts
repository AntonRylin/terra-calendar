import type { CalendarEvent } from '../../core/types';
import { groupOccurrences } from './grid';

describe('groupOccurrences', () => {
  const base = {
    recurrence: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  it('maps dates to events, all-day first then by time', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Late', date: '2026-06-12', time: '18:00', recurrence: null },
      { ...base, id: '2', title: 'AllDay', date: '2026-06-12', recurrence: null },
      { ...base, id: '3', title: 'Early', date: '2026-06-12', time: '08:00', recurrence: null },
    ];
    const map = groupOccurrences(events, '2026-06-01', '2026-06-30', 'UTC');
    expect(map.get('2026-06-12')!.map((x) => x.event.title)).toEqual(['AllDay', 'Early', 'Late']);
  });
  it('includes recurring occurrences', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Gym', date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } },
    ];
    const map = groupOccurrences(events, '2026-06-01', '2026-06-30', 'UTC');
    expect(map.get('2026-06-08')!.map((x) => x.event.title)).toEqual(['Gym']);
  });
});
