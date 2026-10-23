import { useEffect, useMemo, useRef } from 'react';
import { addDays, dayDiff, daysInMonth, pad2, todayISO } from '../../core/dates';
import { mondayOf } from '../month-grid/weeks';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { MinimapHeader } from './MinimapHeader';
import './yearCircle.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Monday-first, matching the month grid and week view. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** `delta` months from an ISO date, keeping the day where the target month has one. */
function shiftISOMonth(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}-${pad2(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Move the viewed date, reading the live value so quick repeats all land. */
function nudgeViewedDate(fn: (iso: string) => string) {
  useUiStore.setState((s) => ({ viewedDate: fn(s.viewedDate || todayISO()) }));
}

/** Picking a day scrolls the calendar to it and makes it the selected day —
 *  the same pair of moves a click on a day tile performs. */
function pickDate(date: string) {
  useUiStore.setState({ viewedDate: date, selectedDate: date });
}

/**
 * The month-days minimap: a compact Notion-style month of numbered days,
 * mirroring what the calendar is showing — the visible week in Week view, the
 * hovered and selected day in the scrolling views. Clicking a day moves the
 * calendar there; the wheel steps whole months.
 */
export function MonthDays() {
  const viewedDate = useUiStore((s) => s.viewedDate);
  const selectedDate = useUiStore((s) => s.selectedDate);
  const hoveredDate = useUiStore((s) => s.hoveredDate);
  const weekWindowStart = useUiStore((s) => s.weekWindowStart);
  const calendarViewMode = useSettingsStore((s) => s.calendarViewMode);

  const today = todayISO();
  const anchor = viewedDate || today;
  const [year, month] = anchor.split('-').map(Number);

  // The exact seven days Week view is showing, published by the view itself —
  // its window rolls, so it does not always start on a Monday. The scrolling
  // views show many weeks at once, so they get no band.
  const bandStart = calendarViewMode === 'week' ? weekWindowStart : null;
  const bandEnd = bandStart && addDays(bandStart, 6);

  const gridStart = mondayOf(`${year}-${pad2(month)}-01`);
  const monthEnd = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const rows = Math.ceil((dayDiff(gridStart, monthEnd) + 1) / 7);

  const shiftMonth = (delta: number) => nudgeViewedDate((iso) => shiftISOMonth(iso, delta));

  // A wheel over the grid steps months, as the year wheel steps weeks.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let acc = 0;
    // One notch of a mouse wheel (~120px) is one month; trackpad deltas add up.
    const threshold = 120;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < threshold) return;
      const steps = Math.trunc(acc / threshold);
      acc %= threshold;
      nudgeViewedDate((iso) => shiftISOMonth(iso, steps));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const cells = useMemo(
    () => Array.from({ length: rows * 7 }, (_, i) => addDays(gridStart, i)),
    [gridStart, rows],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0;
    if (step === 0) return;
    e.preventDefault();
    nudgeViewedDate((iso) => addDays(iso, step));
  };

  return (
    <div className="year-circle-panel">
      {/* The month and its arrows are the left of the panel's one header row:
          they name the panel better than the word "Minimap" did, and they cost
          nothing beyond the band the layout toggle and the gear already need. */}
      <MinimapHeader>
        <div className="minimap-days-nav">
          <button
            type="button"
            className="minimap-days-step"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="minimap-days-title"
            onClick={() => pickDate(today)}
            title="Jump to today"
          >
            {MONTH_NAMES[month - 1]} <span className="minimap-days-year">{year}</span>
          </button>
          <button
            type="button"
            className="minimap-days-step"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </MinimapHeader>

      {/* The row count sits on the body because the grid's width is worked out
          from it and the height the pane has left. */}
      <div
        className="minimap-days-body"
        ref={bodyRef}
        style={{ '--minimap-day-rows': rows } as React.CSSProperties}
      >
        <div
          className="minimap-days-grid"
          role="group"
          aria-label={`${MONTH_NAMES[month - 1]} ${year} — arrow keys to move day by day`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {WEEKDAYS.map((label, i) => (
            <div key={`wd-${i}`} className="minimap-days-weekday" aria-hidden="true">{label}</div>
          ))}
          {cells.map((date, i) => {
            const outside = Number(date.slice(5, 7)) !== month;
            // A rolling window can wrap onto the next row, so the band is capped
            // both at its real ends and wherever a row ends.
            const inWeek = bandStart != null && date >= bandStart && date <= bandEnd!;
            return (
              <button
                key={date}
                type="button"
                className={
                  'minimap-day' +
                  (outside ? ' is-outside' : '') +
                  (date === today ? ' is-today' : '') +
                  (date === selectedDate ? ' is-selected' : '') +
                  (date === hoveredDate ? ' is-hovered' : '') +
                  (inWeek ? ' is-in-week' : '') +
                  (inWeek && (date === bandStart || i % 7 === 0) ? ' is-week-start' : '') +
                  (inWeek && (date === bandEnd || i % 7 === 6) ? ' is-week-end' : '')
                }
                onClick={() => pickDate(date)}
                aria-label={date}
                aria-current={date === today ? 'date' : undefined}
                aria-pressed={date === selectedDate}
              >
                <span className="minimap-day-num">{Number(date.slice(8, 10))}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
