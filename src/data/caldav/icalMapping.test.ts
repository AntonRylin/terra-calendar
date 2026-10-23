import { describe, it, expect } from 'vitest';
import { eventToICS, icsToEvent } from './icalMapping';
import type { CalendarEvent } from '../../core/types';

const base: CalendarEvent = {
  id: 'abc-123',
  title: 'Lunch, with Sam',
  date: '2026-06-18',
  recurrence: null,
  createdAt: '2026-06-14T08:00:00.000Z',
  updatedAt: '2026-06-14T08:00:00.000Z',
};

describe('eventToICS', () => {
  it('exports and round-trips an event repeating every three days', () => {
    const ics = eventToICS({ ...base, recurrence: { unit: 'day', interval: 3 } });
    expect(ics).toContain('RRULE:FREQ=DAILY;INTERVAL=3');
    expect(icsToEvent(ics)?.recurrence).toEqual({ unit: 'day', interval: 3 });
  });
  it('emits an all-day VEVENT with VALUE=DATE and escaped text', () => {
    const ics = eventToICS(base);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:abc-123');
    expect(ics).toContain('SUMMARY:Lunch\\, with Sam');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260618');
    expect(ics).toContain('END:VEVENT');
  });

  it('emits a timed VEVENT with TZID', () => {
    const ics = eventToICS({ ...base, time: '12:30', tz: 'Europe/Berlin' });
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20260618T123000');
    expect(ics).toContain('DURATION:PT1H');
  });

  it('emits the real DURATION when the event has an end time', () => {
    expect(eventToICS({ ...base, time: '12:30', endTime: '14:00' })).toContain('DURATION:PT1H30M');
    expect(eventToICS({ ...base, time: '12:30', endTime: '12:45' })).toContain('DURATION:PT15M');
    expect(eventToICS({ ...base, time: '12:30', endTime: '14:30' })).toContain('DURATION:PT2H');
  });

  it('emits RRULE, EXDATE, color, cosmetic and the minimap X-prop', () => {
    const ics = eventToICS({
      ...base,
      recurrence: { unit: 'week', interval: 2 },
      exdates: ['2026-07-02'],
      color: '#ff375f',
      cosmetic: 'aurora',
      showOnMinimap: false,
    });
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(ics).toContain('EXDATE;VALUE=DATE:20260702');
    expect(ics).toContain('COLOR:#ff375f');
    expect(ics).toContain('X-OPENCAL-COSMETIC:aurora');
    expect(ics).toContain('X-OPENCAL-MINIMAP:FALSE');
  });

  it('emits timed EXDATE matching DTSTART time and timezone', () => {
    const ics = eventToICS({
      ...base,
      time: '14:30',
      tz: 'Europe/Vienna',
      recurrence: { unit: 'week', interval: 1 },
      exdates: ['2026-07-02'],
    });
    expect(ics).toContain('EXDATE;TZID=Europe/Vienna:20260702T143000');
  });

  it('emits an exclusive DTEND and type for a multi-day span', () => {
    const ics = eventToICS({ ...base, date: '2026-06-18', endDate: '2026-06-20', type: 'holiday' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260618');
    expect(ics).toContain('DTEND;VALUE=DATE:20260621'); // exclusive = endDate + 1
    expect(ics).toContain('X-OPENCAL-TYPE:holiday');
  });

  it('emits a next-day DTEND for a single-day event', () => {
    expect(eventToICS(base)).toContain('DTEND;VALUE=DATE:20260619');
  });

  it('emits VEVENT with multiple VALARMs for reminders', () => {
    const ics = eventToICS({
      ...base,
      reminders: [
        { value: 15, unit: 'minutes' },
        { value: 2, unit: 'hours' },
        { value: 3, unit: 'days' },
        { value: 0, unit: 'minutes' },
      ],
    });
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM');
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT2H\r\nDESCRIPTION:Reminder\r\nEND:VALARM');
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-P3D\r\nDESCRIPTION:Reminder\r\nEND:VALARM');
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0S\r\nDESCRIPTION:Reminder\r\nEND:VALARM');
  });
});

describe('icsToEvent', () => {
  it('imports a daily rule with the default interval', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:daily', 'SUMMARY:Daily event', 'DTSTART;VALUE=DATE:20260908',
      'RRULE:FREQ=DAILY', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    expect(icsToEvent(ics)?.recurrence).toEqual({ unit: 'day', interval: 1 });
  });
  it('parses an all-day event', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x1', 'SUMMARY:Offsite', 'DTSTART;VALUE=DATE:20260616',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.id).toBe('x1');
    expect(e.title).toBe('Offsite');
    expect(e.date).toBe('2026-06-16');
    expect(e.time).toBeUndefined();
  });

  it('parses a timed recurring event with tz and exdate', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x2', 'SUMMARY:Standup',
      'DTSTART;TZID=Europe/Berlin:20260615T090000',
      'RRULE:FREQ=WEEKLY;INTERVAL=2',
      'EXDATE;VALUE=DATE:20260629',
      'X-OPENCAL-MINIMAP:FALSE',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.time).toBe('09:00');
    // No DTEND/DURATION in the payload → the default 1-hour end.
    expect(e.endTime).toBe('10:00');
    expect(e.tz).toBe('Europe/Berlin');
    expect(e.recurrence).toEqual({ unit: 'week', interval: 2 });
    expect(e.exdates).toEqual(['2026-06-29']);
    expect(e.showOnMinimap).toBe(false);
  });

  it('derives endTime from a timed DTEND', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x5', 'SUMMARY:Review',
      'DTSTART;TZID=Europe/Berlin:20260615T090000',
      'DTEND;TZID=Europe/Berlin:20260615T103000',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.time).toBe('09:00');
    expect(e.endTime).toBe('10:30');
  });

  it('parses a multi-day span, converting exclusive DTEND to inclusive endDate', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x3', 'SUMMARY:Trip',
      'DTSTART;VALUE=DATE:20260618', 'DTEND;VALUE=DATE:20260621',
      'X-OPENCAL-TYPE:holiday',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.date).toBe('2026-06-18');
    expect(e.endDate).toBe('2026-06-20'); // DTEND - 1 day
    expect(e.type).toBe('holiday');
  });

  it('leaves endDate undefined for a single-day all-day event with next-day DTEND', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x4', 'SUMMARY:One day',
      'DTSTART;VALUE=DATE:20260618', 'DTEND;VALUE=DATE:20260619',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.date).toBe('2026-06-18');
    expect(e.endDate).toBeUndefined();
  });

  it('parses VALARM triggers into reminders', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'UID:x_reminders', 'SUMMARY:Alerted Event', 'DTSTART;VALUE=DATE:20260618',
      'CREATED:20260614T080000Z', 'LAST-MODIFIED:20260614T080000Z',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'DESCRIPTION:Reminder', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT2H', 'DESCRIPTION:Reminder', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P3D', 'DESCRIPTION:Reminder', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0S', 'DESCRIPTION:Reminder', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = icsToEvent(ics)!;
    expect(e.reminders).toEqual([
      { value: 15, unit: 'minutes' },
      { value: 2, unit: 'hours' },
      { value: 3, unit: 'days' },
      { value: 0, unit: 'minutes' },
    ]);
  });

  it('returns null when there is no VEVENT', () => {
    expect(icsToEvent('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBeNull();
  });
});

describe('round-trip', () => {
  it('event -> ICS -> event preserves core fields', () => {
    const e: CalendarEvent = {
      id: 'rt1', title: 'Gym', date: '2026-06-15', time: '18:00',
      tz: 'Europe/Berlin', recurrence: { unit: 'week', interval: 1 },
      color: '#ff375f', cosmetic: 'aurora',
      createdAt: '2026-06-14T08:00:00.000Z', updatedAt: '2026-06-14T08:00:00.000Z',
    };
    const back = icsToEvent(eventToICS(e))!;
    expect(back.title).toBe('Gym');
    expect(back.date).toBe('2026-06-15');
    expect(back.time).toBe('18:00');
    expect(back.tz).toBe('Europe/Berlin');
    expect(back.recurrence).toEqual({ unit: 'week', interval: 1 });
    expect(back.color).toBe('#ff375f');
    expect(back.cosmetic).toBe('aurora');
  });

  it('preserves a multi-day span across event -> ICS -> event', () => {
    const e: CalendarEvent = {
      id: 'rt2', title: 'Holiday', date: '2026-08-06', endDate: '2026-08-20', type: 'holiday',
      recurrence: null,
      createdAt: '2026-06-14T08:00:00.000Z', updatedAt: '2026-06-14T08:00:00.000Z',
    };
    const back = icsToEvent(eventToICS(e))!;
    expect(back.date).toBe('2026-08-06');
    expect(back.endDate).toBe('2026-08-20');
    expect(back.type).toBe('holiday');
  });

  it('preserves per-day overrides across event -> ICS -> event', () => {
    const e: CalendarEvent = {
      id: 'rt3', title: 'Trip', date: '2026-08-06', endDate: '2026-08-20', type: 'holiday',
      recurrence: null,
      dayOverrides: {
        '2026-08-08': { title: 'Travel day', time: '14:30' },
        '2026-08-10': { showOnMinimap: false },
      },
      createdAt: '2026-06-14T08:00:00.000Z', updatedAt: '2026-06-14T08:00:00.000Z',
    };
    const back = icsToEvent(eventToICS(e))!;
    expect(back.dayOverrides).toEqual(e.dayOverrides);
  });

  it('preserves reminders across event -> ICS -> event', () => {
    const e: CalendarEvent = {
      ...base,
      id: 'rt_reminders',
      reminders: [
        { value: 5, unit: 'minutes' },
        { value: 1, unit: 'days' },
      ],
    };
    const back = icsToEvent(eventToICS(e))!;
    expect(back.reminders).toEqual(e.reminders);
  });
});
