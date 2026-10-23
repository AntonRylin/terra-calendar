import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { addDays, dayDiff, parseISODate, todayISO } from '../../core/dates';
import { getContrastColor } from '../../core/colors';
import { cosmeticById, cosmeticClass, resolveEventLook, getMatchedEventStyle } from '../../core/cosmetics';
import { expandOccurrences } from '../../core/occurrences';
import { displayOccurrence, instantToWallClock } from '../../core/timezone';
import { timeToMinutes, minutesToTime, durationMinutes } from '../../core/timeOfDay';
import { textWidth } from '../../core/textWidth';
import { isSpan, spanEndDate } from '../../core/spans';
import { useCalendarStore, type EventPatch } from '../../app/store';
import { useVisibleEvents } from '../../app/visibleEvents';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { mondayOf, buildWeek } from '../month-grid/weeks';
import { parseQuickEntry } from '../../core/timeParser';
import {
  layoutDayBlocks,
  packLanes,
  contiguousRuns,
  snapMinutes,
  dayWeight,
  busyGaps,
  MIN_DURATION_MIN,
  type BlockPlacement,
} from './weekLayout';
import { Dropdown } from '../../ui/Dropdown';
import { ToolbarButton } from '../../ui/ToolbarButton';
import { AccountMenu } from '../../ui/AccountMenu';
import { SidebarToggle } from '../../app/SidebarToggle';
import { MobileHeader } from '../../app/MobileHeader';
import { useIsMobile } from '../../ui/useMediaQuery';
import { WeekEventContent } from './WeekEventContent';
import { confirmChoice } from '../../ui/confirmStore';
import { ContextMenu, pointAnchor, type ContextMenuItem } from '../../ui/ContextMenu';
import { eventHoverProps } from '../../ui/eventHoverStore';
import { buildEventMenuItems, pasteEvent } from '../../app/eventActions';
import { useEventClipboard } from '../../app/eventClipboard';
import type { VirtualElement } from '@floating-ui/react';
import type { CalendarEvent } from '../../core/types';
import './weekView.css';
import '../../ui/cosmetics.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Keep hours readable when the full day needs to scroll. */
const MIN_HOUR_HEIGHT = 48;
const DAY_MIN = 24 * 60;

interface TimedOcc {
  /** Unique per occurrence: `${event.id}:${occDate}`. */
  key: string;
  event: CalendarEvent;
  /** The day column (display tz) this occurrence sits in. */
  occDate: string;
  startMin: number;
  endMin: number;
  /** Room enough for its own text — what it gets if it has to share the day. */
  wantWidthPx: number;
}

interface DragState {
  mode: 'move' | 'resize';
  key: string;
  event: CalendarEvent;
  occDate: string;
  origDayIdx: number;
  origStartMin: number;
  origEndMin: number;
  dayIdx: number;
  startMin: number;
  endMin: number;
  /** Pointer offset from the block top at grab time, in minutes. */
  grabOffsetMin: number;
  /** Where the pointer went down, in client px — for the click-vs-drag test. */
  startX: number;
  startY: number;
  /** Pointer offset from the block's top-left corner at grab time, in px. */
  grabDX: number;
  grabDY: number;
  /** Free (unsnapped) ghost position in px relative to the columns area —
   *  the block follows the hand 1:1; dayIdx/startMin hold the snap target. */
  ghostLeftPx: number;
  ghostTopPx: number;
  moved: boolean;
}

/** A released block gliding into its snapped slot (purely visual — the data
 *  change is committed at pointerup; the real block stays hidden meanwhile). */
interface SettleState {
  event: CalendarEvent;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  widthPx: number;
  heightPx: number;
  startMin: number;
  endMin: number;
}

interface CreateState {
  dayIdx: number;
  anchorMin: number;
  startMin: number;
  endMin: number;
  /** Pointer still down (dragging out the range). */
  active: boolean;
  startX: number;
  startY: number;
  moved: boolean;
}

/** A press is a click until the pointer travels this far (px); only then does
 *  a drag begin. Keeps small jitters from moving events or opening overlays. */
const DRAG_THRESHOLD_PX = 5;

/** Height of one all-day lane row in px (bar height 46 + 4 gap). */
const LANE_H = 50;

/** The 6px of padding a block carries each side. */
const BLOCK_PAD_X = 12;

/**
 * Reserve the time column alongside a comfortable title width. The title is
 * fitted after layout, so its enlarged font never feeds back into day widths.
 * A long name can request at most a quiet day's width, then wraps within it.
 */
function blockContentWidth(title: string, startMin: number, endMin: number, base: number): number {
  const timeWidth = Math.max(
    textWidth(minutesToTime(startMin), 14, 600),
    textWidth(minutesToTime(endMin), 14, 600),
  );
  const want = Math.ceil(textWidth(title, 16, 500) + timeWidth) + 15 + BLOCK_PAD_X;
  return base > 0 ? Math.min(want, base) : want;
}

/** Inset of an all-day bar's title from each end — keep in sync with the
 *  padding on .wv-allday-bar in weekView.css. */
const BAR_PAD = 6;

/** Thresholds offered by a gap marker's right-click menu, in minutes. */
const GAP_THRESHOLD_CHOICES = [15, 30, 60, 120, 180, 240, 360, 720, 1440];

/** "45 min", "1 h", "1 h 30 min" — how long an opening between events is. */
function gapLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A trackpad swipe keeps its axis for this long after the last wheel event, so
 *  a sideways pan survives the vertical wobble of two drifting fingers. */
const WHEEL_AXIS_LOCK_MS = 150;

/** Spare day columns rendered off each end of the strip, so a part-way pan
 *  reveals the neighbouring day instead of empty space. Three, not one: the
 *  days a scrub asks for arrive a render later, and a fast one covers a column
 *  or two in that time. Two of these are the room it needs to keep moving
 *  while they come; the third is the margin the valve in recycle works to. */
const PAD_DAYS = 3;
const STRIP_DAYS = 7 + PAD_DAYS * 2;

/** Momentum after the hand lets go: the share of speed kept per frame, the
 *  crawl at which the glide gives way to the magnet, and a ceiling so a flick
 *  can't outrun the day columns being built behind it. All px/ms. */
const GLIDE_FRICTION = 0.94;
const GLIDE_MIN_SPEED = 0.05;
const GLIDE_MAX_SPEED = 2.5;
/** How long the strip takes to line back up on whole days when a day is
 *  clicked. Nothing else lines it up — a scroll rests where it stops. */
const ALIGN_MS = 220;

/** An all-day bar being dragged across days (horizontal only). */
interface AlldayDragState {
  event: CalendarEvent;
  segStartIdx: number;
  segDays: number;
  lane: number;
  /** Pointer offset from the bar's left edge at grab time, in px. */
  grabDX: number;
  /** Free (unsnapped) ghost position; targetStartIdx holds the magnet day. */
  ghostLeftPx: number;
  targetStartIdx: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/** A horizontal drag on empty grid space, scrubbing the visible week. Kept in a
 *  ref: the strip follows the hand by writing one CSS variable, so a scrub
 *  doesn't re-render the grid on every move. */
interface PanState {
  lastX: number;
  lastT: number;
  /** Smoothed hand speed in px/ms, handed to the momentum glide on release. */
  velocity: number;
}

/** A released all-day bar gliding into its snapped day (purely visual). */
interface AlldaySettleState {
  event: CalendarEvent;
  fromLeft: number;
  toLeft: number;
  lane: number;
  startIdx: number;
  segDays: number;
}

/** A timed occurrence with its place in the day's column. */
type TimedBlock = TimedOcc & BlockPlacement;

/** Dates visited by scrubbing pile up in the block cache; start over past this. */
const BLOCK_CACHE_MAX = 60;

/** What a day column needs from the view. Handed over as a ref so the column's
 *  props stay identical between renders — these close over live state, and a
 *  fresh function each render would defeat the memo below. */
interface ColumnApi {
  blockLook: (event: CalendarEvent) => { className: string; style: React.CSSProperties };
  onBlockPointerDown: (e: React.PointerEvent, b: TimedBlock) => void;
  onBlockPointerMove: (e: React.PointerEvent) => void;
  onBlockPointerUp: (e: React.PointerEvent) => void;
  onBlockContextMenu: (e: React.MouseEvent, b: TimedBlock) => void;
  onResizePointerDown: (e: React.PointerEvent, b: TimedBlock) => void;
  onGapContextMenu: (e: React.MouseEvent) => void;
  openEditor: (id: string, anchor: HTMLElement, date: string) => void;
}

interface DayColumnProps {
  hourHeight: number;
  date: string;
  isToday: boolean;
  blocks: TimedBlock[];
  /** Null while nothing is being dragged — which is the whole time the week is
   *  being scrubbed, so columns the scrub didn't touch re-render for nothing. */
  drag: DragState | null;
  settleEventId: string | null;
  /** Minutes past midnight for the now line, or null if it isn't this day. */
  nowMin: number | null;
  /** Openings between events up to this long get a gap marker; 0 shows none. */
  gapThresholdMin: number;
  api: React.MutableRefObject<ColumnApi>;
}

/**
 * One day of the hour grid. Memoised, and fed block arrays that keep their
 * identity from render to render (see the cache in dayData), so panning the
 * week — which changes only the day at one end — leaves the other columns
 * untouched instead of rebuilding every block on screen.
 */
const DayColumn = memo(function DayColumn({
  hourHeight,
  date,
  isToday,
  blocks,
  drag,
  settleEventId,
  nowMin,
  gapThresholdMin,
  api,
}: DayColumnProps) {
  return (
    <div className={'wv-day' + (isToday ? ' is-today' : '')} data-date={date}>
      {busyGaps(blocks, gapThresholdMin).map((g) => (
        <div
          key={`gap:${g.startMin}`}
          className="wv-gap"
          style={{
            top: (g.startMin / 60) * hourHeight,
            height: ((g.endMin - g.startMin) / 60) * hourHeight,
          }}
        >
          <span
            className="wv-gap-label"
            title="Free time between events — right-click to adjust"
            onContextMenu={(e) => api.current.onGapContextMenu(e)}
          >
            {gapLabel(g.endMin - g.startMin)}
          </span>
        </div>
      ))}
      {blocks.map((b) => {
        const held = drag && drag.key === b.key ? drag : null;
        const resizing = held?.mode === 'resize';
        const startMin = resizing ? held.startMin : b.startMin;
        const endMin = resizing ? held.endMin : b.endMin;
        const look = api.current.blockLook(b.event);
        const beingMoved =
          (held?.mode === 'move' && held.moved) || settleEventId === b.event.id;
        const height = Math.max(((endMin - startMin) / 60) * hourHeight, 14);
        return (
          <div
            key={b.key}
            className={
              'wv-block' +
              look.className +
              (beingMoved ? ' is-drag-source' : '') +
              (resizing ? ' is-resizing' : '')
            }
            style={{
              ...look.style,
              top: (startMin / 60) * hourHeight,
              height,
              left: `${b.leftPct}%`,
              width: `${b.widthPct}%`,
              '--wv-z': b.z,
            } as React.CSSProperties}
            onPointerDown={(e) => api.current.onBlockPointerDown(e, b)}
            onPointerMove={(e) => api.current.onBlockPointerMove(e)}
            onPointerUp={(e) => api.current.onBlockPointerUp(e)}
            onContextMenu={(e) => api.current.onBlockContextMenu(e, b)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                api.current.openEditor(b.event.id, e.currentTarget, b.occDate);
              }
            }}
            {...eventHoverProps({
              title: b.event.title,
              when: `${minutesToTime(startMin)}–${minutesToTime(Math.min(endMin, DAY_MIN - 1))}`,
              description: b.event.description ?? '',
              color: b.event.color,
            })}
          >
            <WeekEventContent title={b.event.title} startMin={startMin} endMin={endMin} />
            {/* Move/up events bubble to the block's handlers — attaching
                them here too would run every commit twice. */}
            <div className="wv-resize" onPointerDown={(e) => api.current.onResizePointerDown(e, b)} />
          </div>
        );
      })}
      {nowMin !== null && (
        <div className="wv-now" style={{ top: (nowMin / 60) * hourHeight }}>
          <span className="wv-now-dot" />
        </div>
      )}
    </div>
  );
});

export function WeekView() {
  const today = todayISO();
  // Own events plus anything shared with this user (see visibleEvents).
  const events = useVisibleEvents();
  const displayTimeZone = useSettingsStore((s) => s.displayTimeZone);
  const categories = useSettingsStore((s) => s.categories);
  const calendarViewMode = useSettingsStore((s) => s.calendarViewMode);
  const isMobile = useIsMobile();
  const showTodayButton = useSettingsStore((s) => s.showWeekTodayButton);
  const setShowTodayButton = useSettingsStore((s) => s.setShowWeekTodayButton);
  const gapThresholdMin = useSettingsStore((s) => s.weekGapThresholdMin);
  const setWeekGapThresholdMin = useSettingsStore((s) => s.setWeekGapThresholdMin);
  const setCalendarViewMode = useSettingsStore((s) => s.setCalendarViewMode);
  const openEditor = useUiStore((s) => s.openEditor);
  const openQuickEntry = useUiStore((s) => s.openQuickEntry);
  const openSpanEdit = useUiStore((s) => s.openSpanEdit);
  const selectedDate = useUiStore((s) => s.selectedDate);
  const viewedDate = useUiStore((s) => s.viewedDate);
  const setViewedDate = useUiStore((s) => s.setViewedDate);

  const [weekStart, setWeekStart] = useState(() => {
    const ui = useUiStore.getState();
    if (ui.weekFocusDate) return addDays(ui.weekFocusDate, -3);
    return mondayOf(ui.viewedDate || ui.selectedDate || today);
  });
  const focusOnOpen = useRef(useUiStore.getState().weekFocusDate);
  useEffect(() => {
    const date = focusOnOpen.current;
    if (!date) return;
    headersRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus({ preventScroll: true });
    useUiStore.setState({ weekFocusDate: null });
  }, []);
  // The strip carries a spare day at each end; the seven that make up the week
  // sit at PAD_DAYS..PAD_DAYS+6 and are the only ones on screen at rest.
  const stripStart = addDays(weekStart, -PAD_DAYS);
  const week = useMemo(
    () => buildWeek(stripStart, today, STRIP_DAYS),
    [stripStart, today],
  );
  const days = week.days;

  // Follow the upcoming/highlight selection into the right week. Skips the
  // mount run so it doesn't clobber the minimap-derived initial week.
  const prevSelectedRef = useRef(selectedDate);
  useEffect(() => {
    if (selectedDate === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedDate;
    if (!selectedDate) return;
    // Already on screen — clicking an event in this very week must not throw
    // the week back to its Monday underneath the click.
    if (selectedDate >= weekStart && selectedDate <= addDays(weekStart, 6)) return;
    setWeekStart(mondayOf(selectedDate));
    // weekStart is read to leave a visible week alone, not to re-run on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Follow the minimap anchor (wheel scroll / click): shift just enough to
  // bring the viewed date into the week, so wheel panning feels continuous.
  useEffect(() => {
    if (!viewedDate) return;
    setWeekStart((ws) => {
      if (viewedDate >= ws && viewedDate <= addDays(ws, 6)) return ws;
      return viewedDate < ws ? viewedDate : addDays(viewedDate, -6);
    });
  }, [viewedDate]);

  // Keep the minimap anchor in sync with the visible week — but leave it be
  // while it already points inside the week (moving it would fight the
  // follow-the-anchor effect above).
  useEffect(() => {
    const vd = useUiStore.getState().viewedDate;
    if (vd && vd >= weekStart && vd <= addDays(weekStart, 6)) return;
    setViewedDate(weekStart);
  }, [weekStart, setViewedDate]);

  // Publish the seven days on screen so the minimap can band them. The window
  // rolls day by day, so this is the only reliable source for its exact start.
  useEffect(() => {
    useUiStore.getState().setWeekWindowStart(weekStart);
  }, [weekStart]);
  useEffect(() => () => useUiStore.getState().setWeekWindowStart(null), []);

  // ---- how wide the track is -----------------------------------------------

  /** Track width, watched rather than measured on demand — see dayWidth. Kept
   *  in state as well because the columns are sized from it. */
  const [trackWidth, setTrackWidth] = useState(0);
  const [hourHeight, setHourHeight] = useState(MIN_HOUR_HEIGHT);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      // Layout pixels already account for interface zoom and exclude the
      // header, all-day lanes, and any horizontal scrollbar.
      setHourHeight(Math.max(MIN_HOUR_HEIGHT, el.clientHeight / 24));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const trackWidthRef = useRef(0);
  useLayoutEffect(() => {
    const el = clipRef.current;
    if (!el) return;
    const measure = () => {
      // Visual px, to match pointer coordinates under the interface zoom.
      const w = el.getBoundingClientRect().width;
      trackWidthRef.current = w;
      setTrackWidth(Math.round(w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Width of a day of weight 1. A quiet week fills the track exactly; days
   *  that widen for their crowd push the rest of the week past its right edge,
   *  where scrolling reaches them. Pinning this to the track — rather than
   *  dividing the track between whichever seven days happen to be up — is what
   *  lets the view move over the days instead of being rearranged by them. */
  const dayBase = trackWidth > 0 ? trackWidth / 7 : 0;
  const dayBaseRef = useRef(0);
  dayBaseRef.current = dayBase;

  // ---- occurrence prep -----------------------------------------------------

  const blockCacheRef = useRef({
    events: null as CalendarEvent[] | null,
    tz: '',
    base: 0,
    hourHeight: 0,
    byDate: new Map<string, TimedBlock[]>(),
  });

  const dayData = useMemo(() => {
    const cache = blockCacheRef.current;
    // The base is in the key because a block's share of its day is measured
    // against it: a resize re-lays every day out.
    if (cache.events !== events || cache.tz !== displayTimeZone || cache.base !== dayBase || cache.hourHeight !== hourHeight) {
      cache.events = events;
      cache.tz = displayTimeZone;
      cache.base = dayBase;
      cache.hourHeight = hourHeight;
      cache.byDate.clear();
    } else if (cache.byDate.size > BLOCK_CACHE_MAX) {
      // Scrubbing visits a new date every column; don't hoard them all.
      cache.byDate.clear();
    }

    // Laid out a day at a time and kept: a scrub brings one new day into the
    // strip, and rebuilding the other eight would hand their columns fresh
    // arrays every time, re-rendering the whole grid for one day of movement.
    const timed = days.map((d) => {
      const cached = cache.byDate.get(d.date);
      if (cached) return cached;
      const blocks: TimedOcc[] = [];
      for (const event of events) {
        // Widen by a day so tz conversion can pull events into this one.
        for (const original of expandOccurrences(event, addDays(d.date, -1), addDays(d.date, 1))) {
          const occ = displayOccurrence(event, original, displayTimeZone);
          if (occ.date !== d.date || !occ.time || isSpan(event)) continue;
          const startMin = timeToMinutes(occ.time);
          const dur = durationMinutes(event.time ?? occ.time, event.endTime);
          const endMin = Math.min(startMin + dur, DAY_MIN);
          blocks.push({
            key: `${event.id}:${occ.date}`,
            event,
            occDate: occ.date,
            startMin,
            endMin,
            wantWidthPx: blockContentWidth(event.title, startMin, endMin, dayBase),
          });
        }
      }
      const laid = layoutDayBlocks(blocks);
      cache.byDate.set(d.date, laid);
      return laid;
    });

    // All-day bars span days, so they are read across the whole strip at once.
    const first = days[0].date;
    const last = days[days.length - 1].date;
    const allDayByEvent = new Map<string, { event: CalendarEvent; dates: string[] }>();
    for (const event of events) {
      for (const original of expandOccurrences(event, addDays(first, -1), addDays(last, 1))) {
        const occ = displayOccurrence(event, original, displayTimeZone);
        const idx = dayDiff(first, occ.date);
        if (idx < 0 || idx >= days.length) continue;
        if (occ.time && !isSpan(event)) continue;
        const entry = allDayByEvent.get(event.id) ?? { event, dates: [] };
        entry.dates.push(occ.date);
        allDayByEvent.set(event.id, entry);
      }
    }

    const segments: { event: CalendarEvent; startIdx: number; endIdx: number }[] = [];
    for (const { event, dates } of allDayByEvent.values()) {
      for (const run of contiguousRuns(dates)) {
        segments.push({
          event,
          startIdx: dayDiff(first, run.start),
          endIdx: dayDiff(first, run.end),
        });
      }
    }
    const allDay = packLanes(segments);
    const laneCount = allDay.reduce((m, s) => Math.max(m, s.lane + 1), 0);
    // Crowded days get a wider grid column; `lefts` are the cumulative
    // fractional (0..1) left edges of each day across the strip, ending at 1.
    const weights = timed.map((blocks) => dayWeight(blocks, dayBase));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const lefts = [0];
    for (const w of weights) lefts.push(lefts[lefts.length - 1] + w / totalWeight);
    // Weight of the spare columns the strip starts with — how far left it has
    // to be parked for the week to begin at the track's left edge.
    const padWeight = weights.slice(0, PAD_DAYS).reduce((a, b) => a + b, 0);
    return { timed, allDay, laneCount, weights, lefts, totalWeight, padWeight };
  }, [events, days, displayTimeZone, dayBase, hourHeight]);

  /** Left edge of day column i as a fraction of the columns area (0..1). */
  const dayLeftFrac = (i: number) => dayData.lefts[i];
  /** Width of day column i as a fraction of the columns area. */
  const dayWidthFrac = (i: number) => dayData.lefts[i + 1] - dayData.lefts[i];
  /** Width of days [start..endInclusive] as a fraction of the columns area. */
  const spanWidthFrac = (start: number, endInclusive: number) =>
    dayData.lefts[endInclusive + 1] - dayData.lefts[start];
  // Columns in absolute px once the track has been measured, so a day keeps its
  // width whatever else is on the strip. `fr` covers the first frame only.
  const gridTemplate = dayBase
    ? dayData.weights.map((w) => `${(w * dayBase).toFixed(3)}px`).join(' ')
    : dayData.weights.map((w) => `${w}fr`).join(' ');
  const stripWidth = dayBase
    ? `${(dayData.totalWeight * dayBase).toFixed(3)}px`
    : '100%';
  const stripPad = dayBase ? `${(-dayData.padWeight * dayBase).toFixed(3)}px` : '0px';

  // ---- current time line ---------------------------------------------------

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowWall = instantToWallClock(new Date(nowTick), displayTimeZone);
  const nowMin = timeToMinutes(nowWall.time);
  const todayIdx = dayDiff(days[0].date, nowWall.date);

  // ---- scrolling -----------------------------------------------------------

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const prevWeekStartRef = useRef(weekStart);
  useEffect(() => {
    const from = prevWeekStartRef.current;
    prevWeekStartRef.current = weekStart;
    // A scrub owns the scroll position while it runs — even a fast one, which
    // can hand over several days at once.
    if (!outsideMoveRef.current) return;
    // Sub-week shifts come from the minimap following along — keep the user's
    // vertical position instead of re-focusing.
    if (from !== weekStart && Math.abs(dayDiff(from, weekStart)) < 7) return;
    const el = scrollRef.current;
    if (!el) return;
    const focusMin = todayIdx >= 0 && todayIdx < days.length ? nowMin : 8 * 60;
    el.scrollTop = Math.max(0, (focusMin / 60) * hourHeight - el.clientHeight / 3);
    // Re-run only when the shown week changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // ---- pointer helpers -----------------------------------------------------

  const colsRef = useRef<HTMLDivElement>(null);

  /** Capture the pointer so drags keep tracking outside the element; a stale
   *  pointer id (e.g. a lifted touch) must not abort the handler. */
  function capturePointer(e: React.PointerEvent) {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // Safe to continue uncaptured.
    }
  }

  /** The interface-scale zoom (html { zoom: var(--font-scale) }) makes pointer
   *  and rect coordinates VISUAL px while style left/top render in LAYOUT px
   *  (see AnchoredPopover). Divide visual measurements by this factor before
   *  using them as layout positions. Exactly 1 when unzoomed. */
  function zoomScale(el: HTMLElement): number {
    return el.clientWidth > 0 ? el.getBoundingClientRect().width / el.clientWidth : 1;
  }

  function pointToSlot(clientX: number, clientY: number): { dayIdx: number; min: number } {
    const el = colsRef.current!;
    const rect = el.getBoundingClientRect();
    // Ratios of the (visual-px) rect are zoom-independent. Day columns have
    // weighted widths, so walk the cumulative boundaries.
    const xf = (clientX - rect.left) / rect.width;
    let dayIdx = 0;
    while (dayIdx < days.length - 1 && xf >= dayData.lefts[dayIdx + 1]) dayIdx++;
    const min = ((clientY - rect.top) / rect.height) * DAY_MIN;
    return { dayIdx, min };
  }

  // ---- panning the strip ---------------------------------------------------

  /** How far the strip is pushed from its resting place, in px — positive
   *  reveals earlier days. Measured from `offsetAnchor`, the day currently
   *  drawn at the start of the week, not from `weekStart`: a day handed over is
   *  only paid for once it is actually on screen. */
  const panOffsetRef = useRef(0);
  const offsetAnchorRef = useRef(weekStart);
  /** The week already asked of React. It can land in pieces — a forced render
   *  takes what is queued at its own priority and leaves the rest — so what has
   *  been asked for and what has arrived are tracked apart. */
  const requestedAnchorRef = useRef(weekStart);
  /** Whether the last move of the week came from outside the view (Today, the
   *  minimap, a selection) rather than from a scrub. */
  const outsideMoveRef = useRef(true);
  /** Handle of the running glide or align frame. */
  const motionRef = useRef(0);
  const panRef = useRef<PanState | null>(null);
  const [panning, setPanning] = useState(false);

  const stripLayoutRef = useRef({ first: '', weights: [] as number[], padWeight: 0 });
  stripLayoutRef.current = {
    first: days[0].date,
    weights: dayData.weights,
    padWeight: dayData.padWeight,
  };

  /** Move the strips. Written as the `translate` property on the three of them
   *  rather than as a custom property on the view: a variable on the root is
   *  inherited, so every block on screen had its style recalculated on every
   *  frame of a scrub. `translate` composes with the parking transform in CSS
   *  and touches nothing but the element itself. */
  function writePan() {
    const px = `${panOffsetRef.current}px`;
    if (headersRef.current) headersRef.current.style.translate = px;
    if (lanesRef.current) lanesRef.current.style.translate = px;
    if (colsRef.current) colsRef.current.style.translate = px;
    writeBarLabels();
  }

  /** All-day bars, measured against the strip: where each one starts and how far
   *  its title can travel inside it before it runs into the far end. Both are
   *  fixed by the layout, so they are read once a render rather than per frame —
   *  the pan moves the strip, not the bars within it. */
  const barLabelsRef = useRef<{ el: HTMLElement; left: number; slack: number }[]>([]);

  function measureBarLabels() {
    const lanes = lanesRef.current;
    const found: { el: HTMLElement; left: number; slack: number }[] = [];
    if (lanes) {
      const bars = lanes.querySelectorAll<HTMLElement>('.wv-allday-bar:not(.wv-allday-ghost)');
      for (const bar of bars) {
        const el = bar.querySelector<HTMLElement>('.wv-bar-label');
        if (!el) continue;
        // A title too long for its bar is already clipped to the full width, so
        // its slack comes out at zero and it simply stays put.
        const room = bar.clientWidth - BAR_PAD * 2 - el.offsetWidth;
        found.push({ el, left: bar.offsetLeft, slack: Math.max(0, room) });
      }
    }
    barLabelsRef.current = found;
  }

  /** A bar longer than the week runs off both sides of the track, and its title
   *  went with it — the event was there, but nameless. Slide each title along
   *  inside its own bar to keep it at the near edge of what's on screen, and let
   *  it stop once the bar's far end catches up with it. */
  function writeBarLabels() {
    // Where the track's left edge falls on the strip: the strip is parked
    // padWeight columns to the left, then moved by the pan.
    const visLeft = stripLayoutRef.current.padWeight * dayBaseRef.current - panOffsetRef.current;
    for (const { el, left, slack } of barLabelsRef.current) {
      const shift = Math.max(0, Math.min(slack, visLeft - left));
      el.style.translate = shift ? `${shift}px` : '';
    }
  }

  // The bars are re-read whenever the layout that placed them changed, and put
  // straight back where the pan wants them — a title mid-slide would otherwise
  // snap home for a frame.
  useLayoutEffect(() => {
    measureBarLabels();
    writeBarLabels();
    // Measuring is a layout read, so it is kept to renders that moved the bars.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayData, dayBase]);

  /** Focusing a block on a spare column would let the browser scroll the track
   *  to reveal it, leaving the strip parked off its anchor. The strip moves by
   *  transform only — so put the track straight back. */
  function keepTrackPinned(e: React.UIEvent<HTMLDivElement>) {
    e.currentTarget.scrollLeft = 0;
  }

  /** Width of one day, in px. Worked out rather than measured: reading geometry
   *  straight after writing the strip's position forces a full layout, and a
   *  scrub does that every frame. A day's width depends on that day alone, so
   *  trading it for a day of `weekStart` is exact whatever else is on screen. */
  function dayWidth(date: string): number {
    const { first, weights } = stripLayoutRef.current;
    const w = first ? weights[dayDiff(first, date)] : undefined;
    return (w ?? 1) * dayBaseRef.current;
  }

  /** What the offset owes for moving its anchor from one day to another: the
   *  widths of the days crossed, signed by the direction. */
  function widthBetween(from: string, to: string): number {
    const steps = dayDiff(from, to);
    let sum = 0;
    for (let k = 0; k < Math.abs(steps); k++) {
      sum += dayWidth(addDays(from, steps > 0 ? k : -k - 1));
    }
    return steps > 0 ? sum : -sum;
  }

  /** Once a whole column has been travelled, hand it to `weekStart` and take its
   *  width back out of the offset — the same picture, re-anchored. One fast
   *  wheel event can carry several columns at once, so keep trading until the
   *  offset is back under a column; anything left over would show as a gap past
   *  the spare column, and then lurch as later events caught it up.
   *
   *  The days are only *asked* for here. Forcing the render through
   *  synchronously (flushSync) stalled the scrub for the whole of it — around
   *  25ms, twice a frame's budget, every time a day went by. Letting React
   *  schedule it keeps the handler cheap and lets several crossings collapse
   *  into one render; applyPendingShift puts the offset right when it lands. */
  function recycle() {
    let want = requestedAnchorRef.current;
    for (let guard = 0; guard < 40; guard++) {
      // Where the offset will stand once every day asked for has arrived.
      const eff = panOffsetRef.current + widthBetween(offsetAnchorRef.current, want);
      const back = eff >= 0;
      const w = dayWidth(back ? addDays(want, -1) : want);
      if (w <= 0 || Math.abs(eff) < w) break;
      want = addDays(want, back ? -1 : 1);
    }
    if (want === requestedAnchorRef.current) return;
    requestedAnchorRef.current = want;
    outsideMoveRef.current = false;
    // Absolute, not a step: a forced render can take one queued update and
    // leave another, and asking for a fixed day is the same answer either way.
    const handOver = () => setWeekStart(want);
    // The spare columns are what let that render wait. Once the strip has eaten
    // most of them it cannot wait any longer: force the render through, stall
    // and all. Sliding off the end of the days it is drawn with is what showed
    // as a gap and then one jump forward when they finally arrived.
    const slack = dayWidth(want) * (PAD_DAYS - 1.5);
    if (slack > 0 && Math.abs(panOffsetRef.current) > slack) {
      flushSync(handOver);
    } else {
      handOver();
    }
  }

  // The days move, so the offset measured against them has to move too — here,
  // after the DOM has them and before anything is painted. It pays the exact
  // width of each day that arrived, so it stays right however React chose to
  // break the work up.
  useLayoutEffect(() => {
    const from = offsetAnchorRef.current;
    if (from === weekStart) return;
    offsetAnchorRef.current = weekStart;
    if (outsideMoveRef.current) {
      // Somebody jumped the week: start from a clean edge.
      stopMotion();
      panOffsetRef.current = 0;
      requestedAnchorRef.current = weekStart;
    } else {
      panOffsetRef.current += widthBetween(from, weekStart);
      if (weekStart === requestedAnchorRef.current) outsideMoveRef.current = true;
    }
    writePan();
  }, [weekStart]);

  // Crowded days can be wider than their neighbors. Center the requested day
  // by its measured width as well as starting the seven-day window around it.
  useLayoutEffect(() => {
    const date = focusOnOpen.current;
    if (!date || !dayBase) return;
    const index = dayDiff(days[0].date, date);
    if (index < 0 || index >= days.length) return;
    const before = dayData.weights.slice(0, index).reduce((sum, weight) => sum + weight, 0);
    // translate and the column widths are CSS pixels; trackWidth is visual
    // pixels under interface zoom. clientWidth gives the matching layout size.
    const viewportWidth = clipRef.current?.clientWidth ?? 0;
    panOffsetRef.current = viewportWidth / 2 - (before - dayData.padWeight + dayData.weights[index] / 2) * dayBase;
    writePan();
    focusOnOpen.current = null;
  }, [dayBase, dayData, days, trackWidth]);

  function nudgePan(dx: number) {
    panOffsetRef.current += dx;
    recycle();
    writePan();
  }

  function stopMotion() {
    if (motionRef.current) cancelAnimationFrame(motionRef.current);
    motionRef.current = 0;
  }

  /** Line the strip back up on whole days, nearest edge. Scrolling never does
   *  this — it rests wherever it stops, part-days and all; picking a day is
   *  what asks for the grid back. */
  function alignToGrid() {
    stopMotion();
    const from = panOffsetRef.current;
    if (from === 0) return;
    const anchor = offsetAnchorRef.current;
    const w = dayWidth(from > 0 ? addDays(anchor, -1) : anchor);
    const to = w > 0 && Math.abs(from) > w / 2 ? Math.sign(from) * w : 0;
    // Timed from the first frame, not from now: frame timestamps come off a
    // different clock in some webviews, and a k below zero blows the ease up.
    let startedAt = 0;
    const step = (now: number) => {
      if (!startedAt) startedAt = now;
      const k = Math.max(0, Math.min(1, (now - startedAt) / ALIGN_MS));
      panOffsetRef.current = from + (to - from) * (1 - (1 - k) ** 3);
      writePan();
      if (k < 1) {
        motionRef.current = requestAnimationFrame(step);
        return;
      }
      motionRef.current = 0;
      panOffsetRef.current = to;
      recycle(); // a target of one full column trades itself for that day
      writePan();
    };
    motionRef.current = requestAnimationFrame(step);
  }

  /** Momentum: carry the hand's speed on, shedding it until it dies out. Where
   *  it stops is where the week stays. */
  function glide(speed: number) {
    stopMotion();
    let v = Math.max(-GLIDE_MAX_SPEED, Math.min(GLIDE_MAX_SPEED, speed));
    if (Math.abs(v) < GLIDE_MIN_SPEED) return;
    let last = 0;
    const step = (now: number) => {
      // Cap the step so a stalled frame doesn't fling the week across a month.
      const dt = last ? Math.max(0, Math.min(32, now - last)) : 16;
      last = now;
      nudgePan(v * dt);
      v *= GLIDE_FRICTION ** (dt / 16.667);
      if (Math.abs(v) < GLIDE_MIN_SPEED) {
        motionRef.current = 0;
        return;
      }
      motionRef.current = requestAnimationFrame(step);
    };
    motionRef.current = requestAnimationFrame(step);
  }

  useEffect(() => stopMotion, []);

  /** Point the upcoming list at the event that was just clicked, the way the
   *  month grids do. If it isn't listed there — hidden from the view, or
   *  already past — there is simply nothing to point at. */
  function highlightInUpcoming(eventId: string, date: string) {
    useUiStore.getState().setHighlightedEvent({ id: eventId, date });
  }

  // ---- move / resize -------------------------------------------------------

  const [drag, setDrag] = useState<DragState | null>(null);
  const [settle, setSettle] = useState<SettleState | null>(null);
  const settleRef = useRef<HTMLDivElement>(null);

  // Glide the released block into its snapped slot. Purely visual and
  // idempotent — StrictMode's double effect run in dev just re-animates.
  useEffect(() => {
    if (!settle) return;
    const el = settleRef.current;
    if (!el) {
      setSettle(null);
      return;
    }
    const anim = el.animate(
      [
        { left: `${settle.fromLeft}px`, top: `${settle.fromTop}px` },
        { left: `${settle.toLeft}px`, top: `${settle.toTop}px` },
      ],
      { duration: 190, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => setSettle(null);
    const safety = setTimeout(() => setSettle(null), 350);
    return () => clearTimeout(safety);
  }, [settle]);

  function onBlockPointerDown(e: React.PointerEvent, b: TimedOcc) {
    if (e.button !== 0) return;
    e.stopPropagation();
    capturePointer(e);
    const { min } = pointToSlot(e.clientX, e.clientY);
    const origDayIdx = dayDiff(days[0].date, b.occDate);
    const blockRect = (e.currentTarget as Element).getBoundingClientRect();
    const colsRect = colsRef.current!.getBoundingClientRect();
    const scale = zoomScale(colsRef.current!);
    setDrag({
      mode: 'move',
      key: b.key,
      event: b.event,
      occDate: b.occDate,
      origDayIdx,
      origStartMin: b.startMin,
      origEndMin: b.endMin,
      dayIdx: origDayIdx,
      startMin: b.startMin,
      endMin: b.endMin,
      grabOffsetMin: min - b.startMin,
      startX: e.clientX,
      startY: e.clientY,
      grabDX: (e.clientX - blockRect.left) / scale,
      grabDY: (e.clientY - blockRect.top) / scale,
      ghostLeftPx: (blockRect.left - colsRect.left) / scale,
      ghostTopPx: (blockRect.top - colsRect.top) / scale,
      moved: false,
    });
  }

  function onResizePointerDown(e: React.PointerEvent, b: TimedOcc) {
    if (e.button !== 0) return;
    e.stopPropagation();
    capturePointer(e);
    const { min } = pointToSlot(e.clientX, e.clientY);
    const origDayIdx = dayDiff(days[0].date, b.occDate);
    setDrag({
      mode: 'resize',
      key: b.key,
      event: b.event,
      occDate: b.occDate,
      origDayIdx,
      origStartMin: b.startMin,
      origEndMin: b.endMin,
      dayIdx: origDayIdx,
      startMin: b.startMin,
      endMin: b.endMin,
      // Anchor to the grabbed spot so the end edge moves with the hand
      // instead of jumping to the cursor.
      grabOffsetMin: min - b.endMin,
      startX: e.clientX,
      startY: e.clientY,
      grabDX: 0,
      grabDY: 0,
      ghostLeftPx: 0,
      ghostTopPx: 0,
      moved: false,
    });
  }

  function onBlockPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    // Still a click until the pointer clearly travels — don't preview anything.
    if (
      !drag.moved &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    const { dayIdx, min } = pointToSlot(e.clientX, e.clientY);
    if (drag.mode === 'move') {
      const dur = drag.origEndMin - drag.origStartMin;
      let startMin = snapMinutes(min - drag.grabOffsetMin);
      startMin = Math.max(0, Math.min(DAY_MIN - dur, startMin));
      // The ghost follows the hand freely; dayIdx/startMin track the magnet slot.
      // All ghost math is in LAYOUT px: clientWidth for widths, pointer deltas
      // divided by the zoom scale (grabDX/DY are already layout px).
      const colsEl = colsRef.current!;
      const colsRect = colsEl.getBoundingClientRect();
      const scale = zoomScale(colsEl);
      const colsW = colsEl.clientWidth;
      const ghostW = dayWidthFrac(dayIdx) * colsW;
      const heightPx = (dur / 60) * hourHeight;
      const ghostLeftPx = Math.max(
        0,
        Math.min(colsW - ghostW, (e.clientX - colsRect.left) / scale - drag.grabDX),
      );
      const ghostTopPx = Math.max(
        0,
        Math.min(24 * hourHeight - heightPx, (e.clientY - colsRect.top) / scale - drag.grabDY),
      );
      setDrag({
        ...drag,
        dayIdx,
        startMin,
        endMin: startMin + dur,
        ghostLeftPx,
        ghostTopPx,
        moved: true,
      });
    } else {
      let endMin = snapMinutes(min - drag.grabOffsetMin);
      endMin = Math.max(drag.origStartMin + MIN_DURATION_MIN, Math.min(DAY_MIN, endMin));
      setDrag({ ...drag, endMin, moved: true });
    }
  }

  function onBlockPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      // A clean click (never crossed the drag threshold) opens the editor —
      // resize presses that didn't move do nothing.
      if (d.mode === 'move') {
        highlightInUpcoming(d.event.id, d.occDate);
        openEditor(d.event.id, e.currentTarget, d.occDate);
      }
      return;
    }
    if (d.mode === 'resize') {
      if (d.endMin !== d.origEndMin) void commitDrag(d);
      return;
    }
    // Commit once, right here — the glide below is purely visual (the real
    // block stays hidden until the ghost lands on the slot).
    const changed = d.dayIdx !== d.origDayIdx || d.startMin !== d.origStartMin;
    if (changed) void commitDrag(d);
    const colsW = colsRef.current?.clientWidth ?? 0;
    setSettle({
      event: d.event,
      fromLeft: d.ghostLeftPx,
      fromTop: d.ghostTopPx,
      toLeft: dayLeftFrac(d.dayIdx) * colsW,
      toTop: (d.startMin / 60) * hourHeight,
      widthPx: dayWidthFrac(d.dayIdx) * colsW,
      heightPx: Math.max(((d.endMin - d.startMin) / 60) * hourHeight, 14),
      startMin: d.startMin,
      endMin: d.endMin,
    });
  }

  async function commitDrag(d: DragState) {
    const store = useCalendarStore.getState();
    const targetDate = days[d.dayIdx].date;
    const newTime = minutesToTime(d.startMin);
    const newEndTime = minutesToTime(Math.min(d.endMin, DAY_MIN - 1));
    const ev = d.event;

    let scope: 'one' | 'all' = 'all';
    if (ev.recurrence) {
      const choice = await confirmChoice({
        title: d.mode === 'resize' ? 'Resize recurring event' : 'Move recurring event',
        message: 'Apply this change to only this occurrence, or to all events in the series?',
        actions: [
          { label: 'Only this event', value: 'one', primary: true },
          { label: 'All events', value: 'all' },
        ],
      });
      if (choice !== 'one' && choice !== 'all') return; // dismissed — no change
      scope = choice;
    }

    if (scope === 'one' && ev.recurrence) {
      // Detach this occurrence: exclude it from the series and add a
      // standalone copy at the new position (same pattern as the month grid).
      const override = ev.dayOverrides?.[d.occDate];
      await store.addEvent({
        title: override?.title ?? ev.title,
        date: targetDate,
        time: newTime,
        endTime: newEndTime,
        type: ev.type,
        description: ev.description,
        recurrence: null,
        color: ev.color,
        cosmetic: ev.cosmetic,
        tz: displayTimeZone,
        showOnMinimap: ev.showOnMinimap,
        showInUpcoming: ev.showInUpcoming,
        calendarUrls: ev.calendarUrls,
      });
      const nextOverrides = { ...(ev.dayOverrides ?? {}) };
      delete nextOverrides[d.occDate];
      await store.updateEvent(ev.id, {
        exdates: [...(ev.exdates ?? []), d.occDate],
        dayOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
      });
      return;
    }

    if (d.mode === 'resize') {
      await store.updateEvent(ev.id, { endTime: newEndTime });
      return;
    }

    const patch: EventPatch = { time: newTime, endTime: newEndTime, tz: displayTimeZone };
    const diffDays = dayDiff(d.occDate, targetDate);
    if (diffDays !== 0) {
      patch.date = addDays(ev.date, diffDays);
      if (ev.exdates) patch.exdates = ev.exdates.map((x) => addDays(x, diffDays));
      if (ev.dayOverrides) {
        const next: Record<string, (typeof ev.dayOverrides)[string]> = {};
        for (const [k, v] of Object.entries(ev.dayOverrides)) next[addDays(k, diffDays)] = v;
        patch.dayOverrides = next;
      }
    }
    await store.updateEvent(ev.id, patch);
  }

  // ---- click / drag on empty slots to create --------------------------------

  const [create, setCreate] = useState<CreateState | null>(null);
  const createGhostRef = useRef<HTMLDivElement>(null);
  // A mostly-horizontal drag on empty grid space scrubs through weeks instead
  // of creating an event; the split is decided at the drag threshold, and the
  // scrub itself runs through the pan engine above.

  // Drop the create ghost once its quick entry is dismissed.
  const quickEntry = useUiStore((s) => s.quickEntry);
  const quickEntryOpen = quickEntry !== null;
  useEffect(() => {
    if (!quickEntryOpen) setCreate((c) => (c && !c.active ? null : c));
  }, [quickEntryOpen]);

  function onGridPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || drag) return;
    capturePointer(e);
    const { dayIdx, min } = pointToSlot(e.clientX, e.clientY);
    const hourStart = Math.floor(min / 60) * 60;
    const hourEnd = hourStart + 60;
    const dayEvents = dayData.timed[dayIdx] || [];
    const overlapping = dayEvents.filter(
      (b) => b.startMin < hourEnd && b.endMin > hourStart
    );
    let start = hourStart;
    if (overlapping.length > 0) {
      start = Math.max(...overlapping.map((b) => b.endMin));
    }
    start = Math.max(0, Math.min(DAY_MIN - 60, start));
    setCreate({
      dayIdx,
      anchorMin: start,
      startMin: start,
      endMin: start + 60,
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
  }

  function onGridPointerMove(e: React.PointerEvent) {
    const p = panRef.current;
    if (p) {
      // The strip follows the hand 1:1; the speed is smoothed so the momentum
      // reads the swipe rather than the last twitch of it.
      const dt = Math.max(1, e.timeStamp - p.lastT);
      const dx = e.clientX - p.lastX;
      p.lastX = e.clientX;
      p.lastT = e.timeStamp;
      p.velocity = 0.75 * (dx / dt) + 0.25 * p.velocity;
      nudgePan(dx);
      return;
    }
    if (!create?.active) return;
    if (!create.moved) {
      const dx = e.clientX - create.startX;
      const dy = e.clientY - create.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Mostly horizontal: pan between weeks instead of creating an event.
        setCreate(null);
        stopMotion();
        // The travel since the press is paid out now, so the next move is
        // measured from here — from the press would spend it twice.
        panRef.current = { lastX: e.clientX, lastT: e.timeStamp, velocity: 0 };
        setPanning(true);
        nudgePan(dx);
        return;
      }
    }
    const { min } = pointToSlot(e.clientX, e.clientY);
    const m = Math.max(0, Math.min(DAY_MIN, snapMinutes(min)));
    if (m >= create.anchorMin) {
      setCreate({
        ...create,
        moved: true,
        startMin: create.anchorMin,
        endMin: Math.max(m, create.anchorMin + MIN_DURATION_MIN),
      });
    } else {
      setCreate({
        ...create,
        moved: true,
        startMin: Math.min(m, create.anchorMin - MIN_DURATION_MIN),
        endMin: create.anchorMin,
      });
    }
  }

  function onGridPointerUp() {
    if (panRef.current) {
      const { velocity } = panRef.current;
      panRef.current = null;
      setPanning(false);
      glide(velocity);
      return;
    }
    if (!create?.active) return;
    const c = { ...create, active: false };
    setCreate(c);
    // The ghost stays rendered and anchors the quick entry popover.
    requestAnimationFrame(() => {
      const anchor = createGhostRef.current;
      if (!anchor) return;
      openQuickEntry(days[c.dayIdx].date, anchor, {
        time: minutesToTime(c.startMin),
        endTime: minutesToTime(Math.min(c.endMin, DAY_MIN - 1)),
      });
    });
  }

  // ---- all-day bar drag ------------------------------------------------------

  const lanesRef = useRef<HTMLDivElement>(null);
  const [alldayDrag, setAlldayDrag] = useState<AlldayDragState | null>(null);
  const [alldaySettle, setAlldaySettle] = useState<AlldaySettleState | null>(null);
  const alldaySettleRef = useRef<HTMLDivElement>(null);
  /** Set when a bar drag just committed, so the click the browser fires right
   *  after the pointerup doesn't also open the editor. */
  const suppressBarClickRef = useRef(false);

  useEffect(() => {
    if (!alldaySettle) return;
    const el = alldaySettleRef.current;
    if (!el) {
      setAlldaySettle(null);
      return;
    }
    const anim = el.animate(
      [{ left: `${alldaySettle.fromLeft}px` }, { left: `${alldaySettle.toLeft}px` }],
      { duration: 190, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => setAlldaySettle(null);
    const safety = setTimeout(() => setAlldaySettle(null), 350);
    return () => clearTimeout(safety);
  }, [alldaySettle]);

  function onBarPointerDown(
    e: React.PointerEvent,
    seg: { event: CalendarEvent; startIdx: number; endIdx: number; lane: number },
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    capturePointer(e);
    const barRect = (e.currentTarget as Element).getBoundingClientRect();
    const lanesRect = lanesRef.current!.getBoundingClientRect();
    const scale = zoomScale(lanesRef.current!);
    setAlldayDrag({
      event: seg.event,
      segStartIdx: seg.startIdx,
      segDays: seg.endIdx - seg.startIdx + 1,
      lane: seg.lane,
      grabDX: (e.clientX - barRect.left) / scale,
      ghostLeftPx: (barRect.left - lanesRect.left) / scale,
      targetStartIdx: seg.startIdx,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
  }

  function onBarPointerMove(e: React.PointerEvent) {
    if (!alldayDrag) return;
    if (
      !alldayDrag.moved &&
      Math.hypot(e.clientX - alldayDrag.startX, e.clientY - alldayDrag.startY) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    const lanesEl = lanesRef.current!;
    const rect = lanesEl.getBoundingClientRect();
    const scale = zoomScale(lanesEl);
    const lanesW = lanesEl.clientWidth;
    const ghostW =
      spanWidthFrac(alldayDrag.segStartIdx, alldayDrag.segStartIdx + alldayDrag.segDays - 1) *
      lanesW;
    const ghostLeftPx = Math.max(
      0,
      Math.min(lanesW - ghostW, (e.clientX - rect.left) / scale - alldayDrag.grabDX),
    );
    // Snap to the day whose (weighted) left edge is nearest the ghost.
    let targetStartIdx = 0;
    let best = Infinity;
    for (let i = 0; i <= days.length - alldayDrag.segDays; i++) {
      const dist = Math.abs(dayLeftFrac(i) * lanesW - ghostLeftPx);
      if (dist < best) {
        best = dist;
        targetStartIdx = i;
      }
    }
    setAlldayDrag({ ...alldayDrag, ghostLeftPx, targetStartIdx, moved: true });
  }

  function onBarPointerUp() {
    if (!alldayDrag) return;
    const d = alldayDrag;
    setAlldayDrag(null);
    // A clean click falls through to the bar's onClick (opens the editor).
    if (!d.moved) return;
    suppressBarClickRef.current = true;
    if (d.targetStartIdx !== d.segStartIdx) void commitAlldayMove(d);
    const lanesW = lanesRef.current?.clientWidth ?? 0;
    setAlldaySettle({
      event: d.event,
      fromLeft: d.ghostLeftPx,
      toLeft: dayLeftFrac(d.targetStartIdx) * lanesW,
      lane: d.lane,
      startIdx: d.targetStartIdx,
      segDays: d.segDays,
    });
  }

  async function commitAlldayMove(d: AlldayDragState) {
    const diffDays = d.targetStartIdx - d.segStartIdx;
    const ev = d.event;
    const store = useCalendarStore.getState();

    let scope: 'one' | 'all' = 'all';
    if (ev.recurrence) {
      const choice = await confirmChoice({
        title: 'Move recurring event',
        message: 'Apply this change to only this occurrence, or to all events in the series?',
        actions: [
          { label: 'Only this event', value: 'one', primary: true },
          { label: 'All events', value: 'all' },
        ],
      });
      if (choice !== 'one' && choice !== 'all') return;
      scope = choice;
    }

    if (scope === 'one' && ev.recurrence) {
      const occDate = days[d.segStartIdx].date;
      const override = ev.dayOverrides?.[occDate];
      await store.addEvent({
        title: override?.title ?? ev.title,
        date: addDays(occDate, diffDays),
        type: ev.type,
        description: ev.description,
        recurrence: null,
        color: ev.color,
        cosmetic: ev.cosmetic,
        showOnMinimap: ev.showOnMinimap,
        showInUpcoming: ev.showInUpcoming,
        calendarUrls: ev.calendarUrls,
      });
      const nextOverrides = { ...(ev.dayOverrides ?? {}) };
      delete nextOverrides[occDate];
      await store.updateEvent(ev.id, {
        exdates: [...(ev.exdates ?? []), occDate],
        dayOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
      });
      return;
    }

    const patch: EventPatch = { date: addDays(ev.date, diffDays) };
    if (ev.endDate) patch.endDate = addDays(ev.endDate, diffDays);
    if (ev.recurrence) {
      if (ev.exdates) patch.exdates = ev.exdates.map((x) => addDays(x, diffDays));
      if (ev.dayOverrides) {
        const next: Record<string, (typeof ev.dayOverrides)[string]> = {};
        for (const [k, v] of Object.entries(ev.dayOverrides)) next[addDays(k, diffDays)] = v;
        patch.dayOverrides = next;
      }
    }
    await store.updateEvent(ev.id, patch);
  }

  // ---- trackpad pan --------------------------------------------------------

  /** Timestamp of the last sideways wheel event (for the axis lock). */
  const wheelAtRef = useRef(0);
  /** A pointer gesture owns the week while it runs; the wheel stays out. */
  const gestureRef = useRef(false);
  useEffect(() => {
    gestureRef.current = Boolean(drag || alldayDrag || panning || create?.active);
  }, [drag, alldayDrag, panning, create]);

  // Two fingers sideways on a trackpad scrub the week, following them 1:1 like
  // the drag does. Vertical scrolling is left to the hour grid, Ctrl+wheel to
  // the zoom; when the fingers stop, the magnet takes over.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || gestureRef.current) return;
      // A mouse wheel has no X axis; Shift+wheel is its sideways gesture.
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const stillSwiping = e.timeStamp - wheelAtRef.current < WHEEL_AXIS_LOCK_MS;
      if (!stillSwiping && Math.abs(dx) <= Math.abs(e.deltaY)) return;
      if (dx === 0) return;
      // Ours now: stop the webview from reading it as a back-swipe.
      e.preventDefault();
      wheelAtRef.current = e.timeStamp;
      // A fresh swipe overrides whatever the last one was still doing. Nothing
      // is armed for when it ends: the trackpad's own momentum is the ending.
      stopMotion();
      nudgePan(-dx);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- right-click menus ---------------------------------------------------

  const [menu, setMenu] = useState<{ anchor: VirtualElement; items: ContextMenuItem[] } | null>(
    null,
  );
  const copied = useEventClipboard((s) => s.copied);

  /** The same actions the month grids and the upcoming list offer. */
  function openEventMenu(
    e: React.MouseEvent,
    event: CalendarEvent,
    occurrenceDate: string,
    span?: { start: string; end: string },
  ) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: buildEventMenuItems({
        event,
        occurrenceDate,
        anchorEl: e.currentTarget as Element,
        span,
      }),
    });
  }

  /** Right-click on empty grid: somewhere to put whatever was copied. The hour
   *  under the pointer is the hour it lands at. */
  function onGridContextMenu(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('.wv-block')) return;
    if (!copied) return;
    e.preventDefault();
    const { dayIdx, min } = pointToSlot(e.clientX, e.clientY);
    const date = days[dayIdx].date;
    const time = minutesToTime(Math.max(0, Math.min(DAY_MIN - 1, snapMinutes(min, 15))));
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: [
        {
          label: `Paste “${copied.event.title}” at ${time}`,
          onClick: () => void pasteEvent({ date, time }),
        },
      ],
    });
  }

  /** Right-click on a gap marker: how long an opening still gets marked. */
  function onGapContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const current = useSettingsStore.getState().weekGapThresholdMin;
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: GAP_THRESHOLD_CHOICES.map((min) => ({
        label: `${min === current ? '✓' : '  '} Show gaps up to ${gapLabel(min)}`,
        onClick: () => setWeekGapThresholdMin(min),
      })),
    });
  }

  /** Right-click on the all-day strip pastes as an all-day event. */
  function onLanesContextMenu(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('.wv-allday-bar')) return;
    if (!copied) return;
    e.preventDefault();
    const rect = lanesRef.current!.getBoundingClientRect();
    const xf = (e.clientX - rect.left) / rect.width;
    let dayIdx = 0;
    while (dayIdx < days.length - 1 && xf >= dayData.lefts[dayIdx + 1]) dayIdx++;
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: [
        {
          label: `Paste “${copied.event.title}”`,
          onClick: () => void pasteEvent({ date: days[dayIdx].date }),
        },
      ],
    });
  }

  // ---- looks ---------------------------------------------------------------

  function blockLook(event: CalendarEvent): { className: string; style: React.CSSProperties } {
    if (event.color) {
      return {
        className: '',
        style: {
          '--event-color': event.color,
          '--event-text-color': getContrastColor(event.color),
        } as React.CSSProperties,
      };
    }
    const look = resolveEventLook(event, categories);
    if (look.kind === 'cosmetic') {
      const cls = cosmeticClass(look.id);
      return {
        className: cls ? ` ${cls} cosmetic-${cosmeticById(look.id)!.kind}` : '',
        style: {},
      };
    }
    if (look.kind === 'match') {
      return {
        className: look.config.type === 'gradient' ? ' event-match-gradient' : '',
        style: getMatchedEventStyle(look.config) as React.CSSProperties,
      };
    }
    return { className: '', style: {} };
  }

  // What the memoised day columns call into. Rewritten every render so the
  // handlers are current, while the ref they arrive in never changes identity.
  const columnApiRef = useRef<ColumnApi>({} as ColumnApi);
  columnApiRef.current = {
    blockLook,
    onBlockPointerDown,
    onBlockPointerMove,
    onBlockPointerUp,
    onBlockContextMenu: (e, b) => openEventMenu(e, b.event, b.occDate),
    onResizePointerDown,
    onGapContextMenu,
    openEditor,
  };

  // ---- header --------------------------------------------------------------

  // Panning and minimap-follow can start the week on any weekday, so derive
  // the column labels from the actual dates. The header reads the week, not
  // the strip, so the spare columns are skipped.
  const startDow = (parseISODate(stripStart).getDay() + 6) % 7;
  const midMonth = days[PAD_DAYS + 3].date.split('-').map(Number);
  const rangeStart = days[PAD_DAYS].date.split('-').map(Number);
  const rangeEnd = days[PAD_DAYS + 6].date.split('-').map(Number);
  const crossesYear = rangeStart[0] !== rangeEnd[0];
  const rangeDate = (date: number[]) => `${date[2]} ${MONTH_NAMES[date[1] - 1].slice(0, 3)}${crossesYear ? ` ${date[0]}` : ''}`;
  const rangeLabel = rangeStart[1] === rangeEnd[1] && !crossesYear
    ? `${rangeStart[2]} – ${rangeEnd[2]}`
    : `${rangeDate(rangeStart)} – ${rangeDate(rangeEnd)}`;
  const isCurrentWeek = weekStart === mondayOf(today);

  /** Which way today lies when it isn't on screen — the side the button sits
   *  on and the way its arrow points, so it reads as "today is over there".
   *  Null while today is in the week, or once the button has been sent away. */
  const todayLies: 'back' | 'ahead' | null = !showTodayButton
    ? null
    : today < weekStart
      ? 'back'
      : today > addDays(weekStart, 6)
        ? 'ahead'
        : null;

  const prevWeek = (
    <ToolbarButton variant="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
      ‹
    </ToolbarButton>
  );
  const nextWeek = (
    <ToolbarButton variant="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
      ›
    </ToolbarButton>
  );
  const todayButton = (
    <ToolbarButton onClick={() => setWeekStart(mondayOf(today))} disabled={isCurrentWeek}>
      {isCurrentWeek && !isMobile ? 'This week' : 'Today'}
    </ToolbarButton>
  );
  const viewSwitcher = (
    <Dropdown
      ariaLabel="Calendar layout"
      value={calendarViewMode}
      options={[
        { value: 'continuous', label: 'Continuous', hint: 'C' },
        { value: 'separate', label: 'Months', hint: 'M' },
        { value: 'week', label: 'Week', hint: 'W' },
      ] as const}
      onChange={setCalendarViewMode}
    />
  );

  return (
    <div
      className="week-view"
      ref={rootRef}
      style={
        {
          '--wv-strip-w': stripWidth,
          '--wv-hour': `${hourHeight}px`,
          '--wv-pad': stripPad,
        } as React.CSSProperties
      }
    >
      {isMobile ? (
        <MobileHeader
          title={
            <>
              {MONTH_NAMES[midMonth[1] - 1]} <span className="month-year">{midMonth[0]}</span>
              <span className="wv-range">{rangeLabel}</span>
            </>
          }
        >
          {viewSwitcher}
          {prevWeek}
          {todayButton}
          {nextWeek}
        </MobileHeader>
      ) : (
      <header className="month-header" data-tauri-drag-region>
        <div className="month-header-left" data-tauri-drag-region>
          <SidebarToggle />
          <h1 className="month-title" data-tauri-drag-region>
            {MONTH_NAMES[midMonth[1] - 1]} <span className="month-year">{midMonth[0]}</span>
            <span className="wv-range">{rangeLabel}</span>
          </h1>
        </div>
        <nav className="month-nav">
          {prevWeek}
          {todayButton}
          {nextWeek}
          {viewSwitcher}
          <div className="month-nav-sep" />
          <AccountMenu />
        </nav>
      </header>
      )}

      <div className="wv-top">
        <div className="wv-top-gutter">
          {dayData.laneCount > 0 && (
            // Given the lanes' own height, so it sits at their middle however
            // many of them the week happens to need.
            <span className="wv-allday-tag" style={{ height: dayData.laneCount * LANE_H }}>
              <span>all</span>
              <span>day</span>
            </span>
          )}
        </div>
        <div className="wv-top-days" onScroll={keepTrackPinned}>
          <div
            className="wv-day-headers wv-strip"
            ref={headersRef}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                data-date={d.date}
                className={'wv-day-head' + (d.isToday ? ' is-today' : '') + (d.date === selectedDate ? ' is-selected' : '')}
                onClick={alignToGrid}
                title="Line the week up on whole days"
                aria-label={`Line the week up on whole days (${d.date})`}
              >
                <span className="wv-dow">{WEEKDAYS[(startDow + i) % 7]}</span>
                <span className="wv-dom">{d.day}</span>
              </button>
            ))}
          </div>
          {dayData.laneCount > 0 && (
            <div
              className="wv-lanes wv-strip"
              ref={lanesRef}
              style={{ height: dayData.laneCount * LANE_H }}
              onContextMenu={onLanesContextMenu}
            >
              {dayData.allDay.map((seg) => {
                const look = blockLook(seg.event);
                const hidden =
                  (alldayDrag?.moved && alldayDrag.event.id === seg.event.id) ||
                  alldaySettle?.event.id === seg.event.id;
                return (
                  <button
                    key={`${seg.event.id}:${seg.startIdx}`}
                    className={'wv-allday-bar' + look.className}
                    style={{
                      ...look.style,
                      left: `${dayLeftFrac(seg.startIdx) * 100}%`,
                      width: `${spanWidthFrac(seg.startIdx, seg.endIdx) * 100}%`,
                      top: seg.lane * LANE_H,
                      visibility: hidden ? 'hidden' : undefined,
                    }}
                    {...eventHoverProps({
                      title: seg.event.title,
                      when: 'All day',
                      description: seg.event.description ?? '',
                      color: seg.event.color,
                    })}
                    onPointerDown={(e) => onBarPointerDown(e, seg)}
                    onPointerMove={onBarPointerMove}
                    onPointerUp={onBarPointerUp}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (suppressBarClickRef.current) {
                        suppressBarClickRef.current = false;
                        return;
                      }
                      highlightInUpcoming(seg.event.id, days[seg.startIdx].date);
                      if (isSpan(seg.event)) {
                        openSpanEdit(seg.event.id, seg.event.date, spanEndDate(seg.event), e.currentTarget);
                      } else {
                        openEditor(seg.event.id, e.currentTarget, days[seg.startIdx].date);
                      }
                    }}
                    onContextMenu={(e) =>
                      openEventMenu(
                        e,
                        seg.event,
                        days[seg.startIdx].date,
                        isSpan(seg.event)
                          ? { start: seg.event.date, end: spanEndDate(seg.event) }
                          : undefined,
                      )
                    }
                  >
                    <span className="wv-bar-label">{seg.event.title}</span>
                  </button>
                );
              })}

              {alldayDrag?.moved && (
                <>
                  <div
                    className="wv-snap-target"
                    style={{
                      left: `${dayLeftFrac(alldayDrag.targetStartIdx) * 100}%`,
                      width: `${spanWidthFrac(alldayDrag.targetStartIdx, alldayDrag.targetStartIdx + alldayDrag.segDays - 1) * 100}%`,
                      top: alldayDrag.lane * LANE_H,
                      height: 46,
                    }}
                  />
                  {(() => {
                    const look = blockLook(alldayDrag.event);
                    return (
                      <div
                        className={'wv-allday-bar wv-allday-ghost is-held' + look.className}
                        style={{
                          ...look.style,
                          left: alldayDrag.ghostLeftPx,
                          width: `${spanWidthFrac(alldayDrag.segStartIdx, alldayDrag.segStartIdx + alldayDrag.segDays - 1) * 100}%`,
                          top: alldayDrag.lane * LANE_H,
                        }}
                      >
                        <span className="wv-bar-label">{alldayDrag.event.title}</span>
                      </div>
                    );
                  })()}
                </>
              )}

              {alldaySettle && (() => {
                const look = blockLook(alldaySettle.event);
                return (
                  <div
                    ref={alldaySettleRef}
                    className={'wv-allday-bar wv-allday-ghost' + look.className}
                    style={{
                      ...look.style,
                      left: alldaySettle.fromLeft,
                      width: `${spanWidthFrac(alldaySettle.startIdx, alldaySettle.startIdx + alldaySettle.segDays - 1) * 100}%`,
                      top: alldaySettle.lane * LANE_H,
                    }}
                  >
                    <span className="wv-bar-label">{alldaySettle.event.title}</span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <div className="wv-scroll" ref={scrollRef}>
        <div className="wv-canvas">
          <div className="wv-gutter">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="wv-hour-label" style={{ top: (i + 1) * hourHeight }}>
                {String(i + 1).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          <div className="wv-cols-clip" ref={clipRef} onScroll={keepTrackPinned}>
            <div
              className={'wv-cols wv-strip' + (panning ? ' is-panning' : '')}
              style={{ gridTemplateColumns: gridTemplate }}
              ref={colsRef}
              onPointerDown={onGridPointerDown}
              onPointerMove={onGridPointerMove}
              onPointerUp={onGridPointerUp}
              onContextMenu={onGridContextMenu}
            >
              {days.map((d, i) => (
                <DayColumn
                  hourHeight={hourHeight}
                  key={d.date}
                  date={d.date}
                  isToday={d.isToday}
                  blocks={dayData.timed[i]}
                  drag={drag}
                  settleEventId={settle?.event.id ?? null}
                  nowMin={i === todayIdx ? nowMin : null}
                  gapThresholdMin={gapThresholdMin}
                  api={columnApiRef}
                />
              ))}

              {drag && drag.mode === 'move' && drag.moved && (
                <>
                  {/* The magnet slot: glides (CSS transition) to the snapped target. */}
                  <div
                    className="wv-snap-target"
                    style={{
                      left: `${dayLeftFrac(drag.dayIdx) * 100}%`,
                      width: `${dayWidthFrac(drag.dayIdx) * 100}%`,
                      top: (drag.startMin / 60) * hourHeight,
                      height: Math.max(((drag.endMin - drag.startMin) / 60) * hourHeight, 14),
                    }}
                  />
                  {/* The piece in hand: follows the pointer 1:1, unsnapped. */}
                  {(() => {
                    const look = blockLook(drag.event);
                    return (
                      <div
                        className={'wv-ghost-solid is-held' + look.className}
                        style={{
                          ...look.style,
                          left: drag.ghostLeftPx,
                          width: `${dayWidthFrac(drag.dayIdx) * 100}%`,
                          top: drag.ghostTopPx,
                          height: Math.max(((drag.endMin - drag.startMin) / 60) * hourHeight, 14),
                        }}
                      >
                        <WeekEventContent title={drag.event.title} startMin={drag.startMin} endMin={drag.endMin} />
                      </div>
                    );
                  })()}
                </>
              )}

              {settle && (() => {
                const look = blockLook(settle.event);
                return (
                  <div
                    ref={settleRef}
                    className={'wv-ghost-solid' + look.className}
                    style={{
                      ...look.style,
                      left: settle.fromLeft,
                      width: settle.widthPx,
                      top: settle.fromTop,
                      height: settle.heightPx,
                    }}
                  >
                    <WeekEventContent title={settle.event.title} startMin={settle.startMin} endMin={settle.endMin} />
                  </div>
                );
              })()}

              {create && (create.moved || !create.active) && (() => {
                const parsed = quickEntry?.value ? parseQuickEntry(quickEntry.value) : null;
                let startMin = create.startMin;
                let endMin = create.endMin;
                if (parsed?.time) {
                  const parsedStart = timeToMinutes(parsed.time);
                  let dur = create.endMin - create.startMin;
                  if (parsed.endTime) {
                    const parsedEnd = timeToMinutes(parsed.endTime);
                    if (parsedEnd > parsedStart) {
                      dur = parsedEnd - parsedStart;
                    }
                  }
                  startMin = Math.max(0, Math.min(DAY_MIN - dur, parsedStart));
                  endMin = startMin + dur;
                }
                const displayTitle = (parsed?.title || '').trim() || 'New event';
                return (
                  <div
                    ref={createGhostRef}
                    className="wv-ghost wv-create-ghost"
                    style={{
                      left: `${dayLeftFrac(create.dayIdx) * 100}%`,
                      width: `${dayWidthFrac(create.dayIdx) * 100}%`,
                      top: (startMin / 60) * hourHeight,
                      height: Math.max(((endMin - startMin) / 60) * hourHeight, 14),
                    }}
                  >
                    <WeekEventContent title={displayTitle} startMin={startMin} endMin={endMin} />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {todayLies && (
        <button
          type="button"
          className={`wv-today-fab is-${todayLies}`}
          onClick={() => setWeekStart(mondayOf(today))}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({
              anchor: pointAnchor(e.clientX, e.clientY),
              items: [{ label: 'Hide this button', onClick: () => setShowTodayButton(false) }],
            });
          }}
          title="Back to today"
          aria-label={`Back to today, ${todayLies === 'back' ? 'earlier' : 'later'}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points={todayLies === 'back' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
          </svg>
          <span>Today</span>
        </button>
      )}

      {menu && (
        <ContextMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
