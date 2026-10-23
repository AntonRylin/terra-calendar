import { useMemo, useRef, useEffect, useState } from 'react';
import { dayOfYear, daysInYear, todayISO, addDays } from '../../core/dates';
import { mondayOf } from '../month-grid/weeks';
import { useVisibleEvents } from '../../app/visibleEvents';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { MONTH_SHORT, visibleMonths } from '../settings/monthLabels';
import { computeYearBands, computeYearDots } from './circle';
import { MinimapHeader } from './MinimapHeader';
import './yearCircle.css';

const CENTER = 130;
const RING_RADIUS = 100;

/** SVG position for an angle (0 = top, clockwise) at a given radius. */
function dotPosition(angle: number, radius: number) {
  return { cx: CENTER + radius * Math.sin(angle), cy: CENTER - radius * Math.cos(angle) };
}

/** Clockwise arc path along the ring from startAngle to endAngle. */
function arcPath(startAngle: number, endAngle: number, radius: number): string {
  const p1 = dotPosition(startAngle, radius);
  const p2 = dotPosition(endAngle, radius);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${p1.cx} ${p1.cy} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.cx} ${p2.cy}`;
}

// anti-loop check
function angleOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return (2 * Math.PI * (dayOfYear(iso) - 1)) / daysInYear(y);
}

/**
 * A small triangle just outside the ring, tip pointing inward at the ring
 * position for `angle`. Returns the three SVG points.
 */
function inwardArrow(angle: number): string {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const px = Math.cos(angle);
  const py = Math.sin(angle);
  const tipR = RING_RADIUS + 3; // tip just outside the ring, aimed at the dot
  const backR = RING_RADIUS + 11;
  const halfW = 3.5;
  const tx = CENTER + tipR * dx;
  const ty = CENTER + tipR * dy;
  const bx = CENTER + backR * dx;
  const by = CENTER + backR * dy;
  return `${tx},${ty} ${bx + halfW * px},${by + halfW * py} ${bx - halfW * px},${by - halfW * py}`;
}

export function YearCircle() {
  // Own events plus anything shared with this user (see visibleEvents).
  const events = useVisibleEvents();
  const viewedDate = useUiStore((s) => s.viewedDate);
  const setViewedDate = useUiStore((s) => s.setViewedDate);
  const monthLabelMode = useSettingsStore((s) => s.monthLabelMode);
  const customMonths = useSettingsStore((s) => s.customMonths);
  const minimapFilter = useSettingsStore((s) => s.minimapFilter);
  const categories = useSettingsStore((s) => s.categories);
  const minimapSize = useSettingsStore((s) => s.minimapSize);
  const minimapRotation = useSettingsStore((s) => s.minimapRotation);
  const maxMinimapSize = useSettingsStore((s) => s.maxMinimapSize);
  const setMaxMinimapSize = useSettingsStore((s) => s.setMaxMinimapSize);
  const today = todayISO();

  const [isEditingYear, setIsEditingYear] = useState(false);
  const [editYearValue, setEditYearValue] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const fitScale = Math.min(width, height) / 448;
        const fitPercent = Math.max(50, Math.min(150, Math.floor(fitScale * 100)));
        setMaxMinimapSize(fitPercent);
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [setMaxMinimapSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let accumulatedDelta = 0;
    const threshold = 40; // 40px of scroll delta = 1 week jump

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const { minimapSize, setMinimapSize, maxMinimapSize } = useSettingsStore.getState();
        const step = e.deltaY < 0 ? 5 : -5;
        const nextSize = Math.max(50, Math.min(maxMinimapSize, minimapSize + step));
        setMinimapSize(nextSize);
        return;
      }

      e.preventDefault();
      accumulatedDelta += e.deltaY;

      if (Math.abs(accumulatedDelta) >= threshold) {
        const steps = Math.trunc(accumulatedDelta / threshold);
        accumulatedDelta = accumulatedDelta % threshold;

        // Wheel forward (deltaY < 0, steps < 0) and backward (deltaY > 0, steps > 0) move in the same magnitude direction.
        // Positive steps (wheel down) => move forward in time (positive deltaDays).
        // Negative steps (wheel up) => move backward in time (negative deltaDays).
        const deltaDays = steps * 7;

        useUiStore.setState((state) => {
          const current = state.viewedDate || todayISO();
          return { viewedDate: addDays(current, deltaDays) };
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const monthTicks = visibleMonths(monthLabelMode, customMonths).map((m) => ({
    label: MONTH_SHORT[m - 1],
    angle: (2 * Math.PI * (m - 1)) / 12,
  }));

  // The wheel is a minimap of the year currently shown in the calendar.
  const viewedYear = viewedDate ? Number(viewedDate.slice(0, 4)) : Number(today.slice(0, 4));
  const isCurrentYear = Number(today.slice(0, 4)) === viewedYear;
  const dots = useMemo(
    () => computeYearDots(events, viewedYear, RING_RADIUS, minimapFilter, categories),
    [events, viewedYear, minimapFilter, categories],
  );
  const bands = useMemo(
    () => computeYearBands(events, viewedYear, minimapFilter, categories),
    [events, viewedYear, minimapFilter, categories],
  );

  const todayAngle = angleOf(today);
  const todayPos = dotPosition(todayAngle, RING_RADIUS);
  // Show the viewed-week arrow unless it would sit right on top of today's arrow (i.e. they are in the same week).
  const showViewed =
    viewedDate != null && (!isCurrentYear || mondayOf(viewedDate) !== mondayOf(today));

  // Animate the viewed-week arrow by rotating it around the ring. We track a
  // *continuous* rotation (not clamped to 0–360) so jumps across the year
  // boundary rotate the short way instead of unwinding the whole circle.
  const [viewedRotation, setViewedRotation] = useState(0);
  const rotationRef = useRef(0);
  useEffect(() => {
    if (viewedDate == null) return;
    const target = (angleOf(viewedDate) * 180) / Math.PI;
    let delta = (((target - rotationRef.current) % 360) + 360) % 360;
    if (delta > 180) delta -= 360;
    const next = rotationRef.current + delta;
    rotationRef.current = next;
    setViewedRotation(next);
  }, [viewedDate, viewedYear]);

  const startEditingYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditYearValue(viewedYear.toString());
    setIsEditingYear(true);
  };

  const handleYearSubmit = () => {
    const year = parseInt(editYearValue, 10);
    if (!isNaN(year) && year >= 1000 && year <= 9999) {
      const current = viewedDate || today;
      const parts = current.split('-');
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      const iso = d.toISOString().slice(0, 10);
      setViewedDate(iso);
    }
    setIsEditingYear(false);
  };

  const handleYearKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleYearSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingYear(false);
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to 260x260 coordinates
    const svgX = (x / rect.width) * 260;
    const svgY = (y / rect.height) * 260;

    const dx = svgX - CENTER;
    const dy = CENTER - svgY;

    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 50) return; // ignore clicks near the center label

    let angle = Math.atan2(dx, dy);
    // Undo the minimap's visual rotation so the click maps to the real day.
    angle -= (minimapRotation * Math.PI) / 180;
    angle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    const totalDays = daysInYear(viewedYear);
    let dayIdx = Math.round((angle / (2 * Math.PI)) * totalDays) + 1;
    dayIdx = Math.max(1, Math.min(totalDays, dayIdx));

    const jan1 = `${viewedYear}-01-01`;
    const targetDate = addDays(jan1, dayIdx - 1);

    setViewedDate(targetDate);
  };

  const effectiveMinimapSize = Math.min(minimapSize, maxMinimapSize);

  return (
    <div className="year-circle-panel" style={{ '--minimap-scale': effectiveMinimapSize / 100 } as React.CSSProperties}>
      <MinimapHeader />
      <div className="year-circle-body" ref={containerRef}>
        <svg viewBox="0 0 260 260" className="year-circle-svg" onClick={handleSvgClick}>
          <g transform={`rotate(${minimapRotation} ${CENTER} ${CENTER})`}>
          <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} className="year-ring" />
          {bands.map((band) => (
            <path
              key={`${band.eventId}-${band.start}`}
              d={arcPath(band.startAngle, band.endAngle, RING_RADIUS)}
              className="year-band"
              style={band.color ? { stroke: band.color } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                useUiStore.getState().setHighlightedEvent({ id: band.eventId, date: band.start });
                setViewedDate(band.start);
              }}
            >
              <title>{`${band.title} · ${band.start} → ${band.end}`}</title>
            </path>
          ))}
          {monthTicks.map(({ label, angle }) => {
            const pos = dotPosition(angle, RING_RADIUS + 14);
            return (
              <text
                key={label}
                x={pos.cx}
                y={pos.cy + 3}
                className="month-tick"
                // Counter-rotate so labels stay upright as the wheel is rotated.
                transform={`rotate(${-minimapRotation} ${pos.cx} ${pos.cy + 3})`}
              >
                {label}
              </text>
            );
          })}

          {viewedDate != null && (
            <g
              className={`viewed-arrow-group${showViewed ? ' is-visible' : ''}`}
              style={{ transform: `rotate(${viewedRotation}deg)` }}
            >
              <polygon points={inwardArrow(0)} className="viewed-arrow">
                <title>{`Viewing · ${viewedDate}`}</title>
              </polygon>
            </g>
          )}

          {isCurrentYear && (
            <>
              <circle cx={todayPos.cx} cy={todayPos.cy} r={3} className="today-marker" />
              <polygon points={inwardArrow(todayAngle)} className="today-arrow">
                <title>{`Today · ${today}`}</title>
              </polygon>
            </>
          )}

          {dots.map((dot) => {
            const angle = dot.angle;
            const length = 8;
            const r1 = dot.radius - length / 2;
            const r2 = dot.radius + length / 2;
            const x1 = CENTER + r1 * Math.sin(angle);
            const y1 = CENTER - r1 * Math.cos(angle);
            const x2 = CENTER + r2 * Math.sin(angle);
            const y2 = CENTER - r2 * Math.cos(angle);
            return (
              <line
                key={`${dot.eventId}-${dot.date}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="year-tick-line"
                style={dot.color ? { stroke: dot.color } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  useUiStore.getState().setHighlightedEvent({ id: dot.eventId, date: dot.date });
                  setViewedDate(dot.date);
                }}
              >
                <title>{`${dot.title} · ${dot.date}`}</title>
              </line>
            );
          })}
          </g>
          {!isEditingYear && (
            <text x={CENTER} y={CENTER + 6} className="year-label" onClick={startEditingYear}>
              {viewedYear}
            </text>
          )}
        </svg>
        {isEditingYear && (
          <input
            className="year-input"
            type="text"
            pattern="[0-9]*"
            maxLength={4}
            value={editYearValue}
            onChange={(e) => setEditYearValue(e.target.value.replace(/\D/g, ''))}
            onBlur={handleYearSubmit}
            onKeyDown={handleYearKeyDown}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
    </div>
  );
}
