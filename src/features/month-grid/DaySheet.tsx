import type { ReactNode } from 'react';
import { addDays, parseISODate } from '../../core/dates';
import { dayTime, dayTitle, isSpan, spanEndDate } from '../../core/spans';
import { durationMinutes, addMinutesToTime } from '../../core/timeOfDay';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { eventSwatch } from '../../app/eventSwatch';
import type { DayEvent } from './grid';
import './daySheet.css';

export interface DaySheetWeather {
  emoji: string;
  description: string;
  minTemp: number;
  maxTemp: number;
  rainChance?: number;
}

interface Props {
  date: string;
  today: string;
  /** The day's tile in the grid: anchors whatever the sheet opens next. */
  anchorEl: HTMLElement;
  events: DayEvent[];
  weather?: DaySheetWeather | null;
  locationName?: string;
  onLocationClick?(): void;
  /** Cosmetic classes of the day's style (e.g. " cosmetic-candy cosmetic-gradient"). */
  styleClassName: string;
  /** Image/CSS fill for a custom day background, painted behind the badge. */
  styleFill?: ReactNode;
  emoji?: string;
  onClose(): void;
}

const fmtShort = (iso: string) =>
  parseISODate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "09:00 – 09:15", "All day", or the span's range for multi-day events. */
function whenLabel({ event, time }: DayEvent, date: string): string {
  if (isSpan(event)) {
    const t = dayTime(event, date);
    const range = `${fmtShort(event.date)} – ${fmtShort(spanEndDate(event))}`;
    return t ? `${t} · ${range}` : range;
  }
  if (!time) return 'All day';
  const end = event.time && event.endTime
    ? addMinutesToTime(time, durationMinutes(event.time, event.endTime))
    : undefined;
  return end ? `${time} – ${end}` : time;
}

/**
 * Phone: the bottom sheet a tapped day opens. Shows the date (on a badge
 * carrying the day's own style), the forecast when known, the day's events as
 * list rows (tap → editor), and the two things you do with a day: add an event
 * or style it. The shared sheet handles the Android back gesture.
 */
export function DaySheet({
  date,
  today,
  anchorEl,
  events,
  weather,
  locationName,
  onLocationClick,
  styleClassName,
  styleFill,
  emoji,
  onClose,
}: Props) {
  const categories = useSettingsStore((s) => s.categories);
  const d = parseISODate(date);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const year = d.getFullYear();
  const isToday = date === today;
  const relative = isToday ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : null;
  const styled = styleClassName.trim().length > 0 || !!styleFill;

  const openEvent = (item: DayEvent) => {
    onClose();
    const ui = useUiStore.getState();
    ui.setHighlightedEvent({ id: item.event.id, date });
    if (isSpan(item.event)) ui.openSpanDayChooser(item.event.id, date, anchorEl);
    else ui.openEditor(item.event.id, anchorEl, date);
  };

  return (
    <AnchoredPopover anchorEl={anchorEl} onClose={onClose} className="popover--day-sheet">
      <div className="day-sheet" role="dialog" aria-label={`${weekday}, ${dayMonth}`}>
        <div className="day-sheet-head">
          <div
            className={
              'day-tile day-sheet-badge' +
              (isToday ? ' is-today' : '') +
              (styled ? ' is-styled' : '') +
              styleClassName
            }
            aria-hidden="true"
          >
            {styleFill}
            <span className="day-number">{d.getDate()}</span>
            {emoji && <span className="day-sheet-badge-emoji">{emoji}</span>}
          </div>
          <div className="day-sheet-heading">
            <h2 className="day-sheet-title">
              {weekday}, {dayMonth}
              {year !== Number(today.slice(0, 4)) && <span className="day-sheet-year"> {year}</span>}
            </h2>
            <div className="day-sheet-sub">
              {relative && <span className={'day-sheet-rel' + (isToday ? ' is-today' : '')}>{relative}</span>}
              {relative && <span className="day-sheet-dot" aria-hidden="true">·</span>}
              <span>{events.length === 0 ? 'No events' : events.length === 1 ? '1 event' : `${events.length} events`}</span>
            </div>
          </div>
        </div>

        {weather && (
          <button type="button" className="day-sheet-weather" onClick={onLocationClick} disabled={!onLocationClick}>
            <span className="day-sheet-weather-emoji" aria-hidden="true">{weather.emoji}</span>
            <span className="day-sheet-weather-text">
              {weather.description}
              <span className="day-sheet-weather-temp">
                {Math.round(weather.maxTemp)}° / {Math.round(weather.minTemp)}°
              </span>
              {weather.rainChance !== undefined && weather.rainChance >= 20 && (
                <span className="day-sheet-weather-rain">{weather.rainChance}% rain</span>
              )}
            </span>
            {locationName && <span className="day-sheet-weather-place">{locationName}</span>}
          </button>
        )}

        {events.length > 0 && (
          <ul className="day-sheet-list">
            {events.map((item) => {
              const title = isSpan(item.event) ? dayTitle(item.event, date) : item.event.title;
              return (
                <li key={item.event.id}>
                  <button type="button" className="day-sheet-row" onClick={() => openEvent(item)}>
                    <span
                      className="day-sheet-bar"
                      style={{ background: eventSwatch(item.event, categories) }}
                      aria-hidden="true"
                    />
                    <span className="day-sheet-row-text">
                      <span className="day-sheet-row-title">{title}</span>
                      <span className="day-sheet-row-when">
                        {whenLabel(item, date)}
                        {item.event.type && <> · {item.event.type}</>}
                      </span>
                    </span>
                    <svg className="day-sheet-row-chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {events.length === 0 && <p className="day-sheet-empty">Nothing planned yet.</p>}

        <div className="day-sheet-actions">
          <button
            type="button"
            className="day-sheet-btn is-filled"
            onClick={() => {
              onClose();
              useUiStore.getState().openQuickEntry(date, anchorEl);
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New event
          </button>
          <button
            type="button"
            className="day-sheet-btn is-tonal"
            onClick={() => {
              onClose();
              useUiStore.getState().openSpecialDayEditor(date, anchorEl);
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
              <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" />
            </svg>
            Style this day
          </button>
        </div>
      </div>
    </AnchoredPopover>
  );
}

