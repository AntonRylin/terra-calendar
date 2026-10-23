import ICAL from 'ical.js';
import type { CalendarEvent, Recurrence, EventReminder } from '../../core/types';
import { addDays } from '../../core/dates';
import { spanEndDate } from '../../core/spans';
import { durationMinutes, addMinutesToTime, DEFAULT_DURATION_MIN } from '../../core/timeOfDay';

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Fold to <=75 chars per RFC 5545 (char-based; adequate for our ASCII data). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

/** UTF-8-safe base64, so JSON payloads survive ICS without escaping (ical.js
 *  does not unescape unknown X-property values). */
function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

function toICSUtc(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function rrule(r: Recurrence): string {
  const freq = r.unit === 'day' ? 'DAILY' : r.unit === 'week' ? 'WEEKLY' : r.unit === 'month' ? 'MONTHLY' : 'YEARLY';
  const interval = Math.max(1, Math.floor(r.interval) || 1);
  return interval > 1 ? `FREQ=${freq};INTERVAL=${interval}` : `FREQ=${freq}`;
}

export function eventToICS(e: CalendarEvent): string {
  const compact = (d: string) => d.replace(/-/g, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Terra Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}`,
    `DTSTAMP:${toICSUtc(e.updatedAt)}`,
    `CREATED:${toICSUtc(e.createdAt)}`,
    `LAST-MODIFIED:${toICSUtc(e.updatedAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);

  if (e.time) {
    const dt = `${compact(e.date)}T${e.time.replace(':', '')}00`;
    lines.push(e.tz ? `DTSTART;TZID=${e.tz}:${dt}` : `DTSTART:${dt}`);
    const mins = durationMinutes(e.time, e.endTime);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    lines.push(`DURATION:PT${h > 0 ? `${h}H` : ''}${m > 0 || h === 0 ? `${m}M` : ''}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compact(addDays(spanEndDate(e), 1))}`);
  }
  if (e.type) lines.push(`X-OPENCAL-TYPE:${escapeText(e.type)}`);

  if (e.recurrence) lines.push(`RRULE:${rrule(e.recurrence)}`);
  if (e.exdates?.length) {
    for (const d of e.exdates) {
      if (e.time) {
        const t = e.time.replace(':', '') + '00';
        const val = `${compact(d)}T${t}`;
        lines.push(e.tz ? `EXDATE;TZID=${e.tz}:${val}` : `EXDATE:${val}`);
      } else {
        lines.push(`EXDATE;VALUE=DATE:${compact(d)}`);
      }
    }
  }
  if (e.color) lines.push(`COLOR:${e.color}`);
  if (e.cosmetic) lines.push(`X-OPENCAL-COSMETIC:${escapeText(e.cosmetic)}`);
  if (e.showOnMinimap === false) lines.push('X-OPENCAL-MINIMAP:FALSE');
  if (e.showInUpcoming === false) lines.push('X-OPENCAL-UPCOMING:FALSE');
  if (e.dayOverrides && Object.keys(e.dayOverrides).length > 0) {
    lines.push(`X-OPENCAL-DAYOVERRIDES:${b64encode(JSON.stringify(e.dayOverrides))}`);
  }
  if (e.reminders && e.reminders.length > 0) {
    for (const r of e.reminders) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      let trigger = '';
      if (r.value === 0) {
        trigger = 'PT0S';
      } else {
        const unitChar = r.unit === 'minutes' ? 'M' : r.unit === 'hours' ? 'H' : 'D';
        const hasT = r.unit === 'minutes' || r.unit === 'hours' ? 'T' : '';
        trigger = `-P${hasT}${r.value}${unitChar}`;
      }
      lines.push(`TRIGGER:${trigger}`);
      lines.push('DESCRIPTION:Reminder');
      lines.push('END:VALARM');
    }
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function pad4(n: number): string { return String(n).padStart(4, '0'); }

function icalTimeToIso(t: unknown): string | undefined {
  if (t && typeof (t as { toJSDate?: () => Date }).toJSDate === 'function') {
    return (t as { toJSDate: () => Date }).toJSDate().toISOString();
  }
  return undefined;
}

export function icsToEvent(ics: string): CalendarEvent | null {
  let vevent: ICAL.Component | null;
  try {
    const comp = new ICAL.Component(ICAL.parse(ics));
    vevent = comp.getFirstSubcomponent('vevent');
  } catch {
    return null;
  }
  if (!vevent) return null;

  const ev = new ICAL.Event(vevent);
  const start = ev.startDate;
  const date = `${pad4(start.year)}-${pad2(start.month)}-${pad2(start.day)}`;

  // All-day DTEND is exclusive: a span's inclusive endDate is DTEND - 1 day.
  // Only kept when it extends beyond the start day (multi-day span).
  let endDate: string | undefined;
  if (start.isDate) {
    const dtend = vevent.getFirstPropertyValue('dtend') as { year: number; month: number; day: number } | null;
    if (dtend?.year) {
      const inclusive = addDays(`${pad4(dtend.year)}-${pad2(dtend.month)}-${pad2(dtend.day)}`, -1);
      if (inclusive > date) endDate = inclusive;
    }
  }

  let time: string | undefined;
  let endTime: string | undefined;
  let tz: string | undefined;
  if (!start.isDate) {
    time = `${pad2(start.hour)}:${pad2(start.minute)}`;
    // End of the timed event, from DTEND or DURATION (ical.js resolves either).
    // Clamped to the start day — the app models timed events as same-day.
    try {
      const durSec = ev.duration?.toSeconds?.();
      const durMin = durSec && durSec > 0 ? Math.round(durSec / 60) : DEFAULT_DURATION_MIN;
      endTime = addMinutesToTime(time, durMin);
    } catch {
      endTime = addMinutesToTime(time, DEFAULT_DURATION_MIN);
    }
    // Read the TZID parameter off DTSTART directly: ical.js only resolves
    // start.zone.tzid when a matching VTIMEZONE is present in the payload,
    // which iCloud's calendar-data for a single event often omits.
    const tzidParam = vevent.getFirstProperty('dtstart')?.getParameter('tzid');
    if (typeof tzidParam === 'string' && tzidParam) {
      tz = tzidParam;
    } else if (start.zone?.tzid === 'UTC') {
      tz = 'UTC';
    }
  }

  let recurrence: Recurrence | null = null;
  const rule = vevent.getFirstPropertyValue('rrule') as { freq?: string; interval?: number } | null;
  if (rule?.freq) {
    const unit =
      rule.freq === 'DAILY' ? 'day' :
      rule.freq === 'WEEKLY' ? 'week' :
      rule.freq === 'MONTHLY' ? 'month' :
      rule.freq === 'YEARLY' ? 'year' : null;
    if (unit) recurrence = { unit, interval: rule.interval && rule.interval > 0 ? rule.interval : 1 };
  }

  const exdates: string[] = [];
  for (const p of vevent.getAllProperties('exdate')) {
    const v = p.getFirstValue() as { year: number; month: number; day: number };
    if (v?.year) exdates.push(`${pad4(v.year)}-${pad2(v.month)}-${pad2(v.day)}`);
  }

  const minimap = vevent.getFirstPropertyValue('x-opencal-minimap');
  const upcoming = vevent.getFirstPropertyValue('x-opencal-upcoming');
  const typeVal = vevent.getFirstPropertyValue('x-opencal-type');
  const overridesRaw = vevent.getFirstPropertyValue('x-opencal-dayoverrides');
  let dayOverrides: CalendarEvent['dayOverrides'];
  if (typeof overridesRaw === 'string' && overridesRaw) {
    try {
      dayOverrides = JSON.parse(b64decode(overridesRaw));
    } catch {
      dayOverrides = undefined;
    }
  }
  const reminders: EventReminder[] = [];
  for (const valarm of vevent.getAllSubcomponents('valarm')) {
    const trigger = valarm.getFirstPropertyValue('trigger');
    if (trigger && typeof trigger === 'object') {
      const d = trigger as any;
      if (d.days > 0) {
        reminders.push({ value: d.days, unit: 'days' });
      } else if (d.hours > 0) {
        reminders.push({ value: d.hours, unit: 'hours' });
      } else if (d.minutes > 0) {
        reminders.push({ value: d.minutes, unit: 'minutes' });
      } else if (d.weeks > 0) {
        reminders.push({ value: d.weeks * 7, unit: 'days' });
      } else {
        reminders.push({ value: 0, unit: 'minutes' });
      }
    }
  }

  const color = vevent.getFirstPropertyValue('color');
  const cosmetic = vevent.getFirstPropertyValue('x-opencal-cosmetic');
  const created = icalTimeToIso(vevent.getFirstPropertyValue('created'));
  const modified = icalTimeToIso(vevent.getFirstPropertyValue('last-modified'));
  const nowIso = new Date().toISOString();

  return {
    id: ev.uid,
    title: ev.summary ?? '',
    description: ev.description || undefined,
    date,
    endDate,
    type: typeof typeVal === 'string' && typeVal ? typeVal : undefined,
    dayOverrides,
    time,
    endTime,
    tz,
    recurrence,
    exdates: exdates.length ? exdates : undefined,
    color: typeof color === 'string' ? color : undefined,
    cosmetic: typeof cosmetic === 'string' && cosmetic ? cosmetic : undefined,
    showOnMinimap: typeof minimap === 'string' && minimap.toUpperCase() === 'FALSE' ? false : undefined,
    showInUpcoming: typeof upcoming === 'string' && upcoming.toUpperCase() === 'FALSE' ? false : undefined,
    reminders: reminders.length > 0 ? reminders : undefined,
    createdAt: created ?? nowIso,
    updatedAt: modified ?? created ?? nowIso,
  };
}
