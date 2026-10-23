import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, parseISODate, todayISO } from '../../core/dates';
import { getContrastColor } from '../../core/colors';
import { clockTextStyle, formatClockTime } from '../../core/clockStyle';
import { cosmeticById, cosmeticClass, resolveEventLook, getMatchedEventStyle } from '../../core/cosmetics';
import { resolveDayBackground, type DayBackground } from '../../core/dayBackground';
import { useDayImageUrls } from '../day-background/useDayImageUrls';
import { DayCustomStyleSheet } from '../day-background/DayCustomStyleSheet';
import { mediaFileFromDataTransfer, ingestMediaForDay, isMotionFile } from '../day-background/imageImport';
import { DayMediaFill } from '../day-background/DayMediaFill';
import '../day-background/dayBackground.css';
import { dayTime, dayTitle, isSpan, spanEndDate } from '../../core/spans';
import { useCalendarStore } from '../../app/store';
import { useVisibleEvents } from '../../app/visibleEvents';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { useSelectionStore } from '../../app/selectionStore';
import { useSpecialDaysStore, getSpecialDayForDate, type SpecialDay } from '../../app/specialDaysStore';
import { HabitTabSwitcher } from '../habit-tabs/HabitTabSwitcher';
import { HabitDayContent, HabitEntryEditor } from '../habit-tabs/HabitDayContent';
import { useHabitEntriesStore } from '../../app/habitEntriesStore';
import { groupOccurrences } from './grid';
import { useExpandedDay } from './ExpandedDay';
import { buildWeeks, mondayOf, weekMonth } from './weeks';
import { Dropdown } from '../../ui/Dropdown';
import { ZoomStepper } from '../../ui/ZoomStepper';
import { ToolbarButton } from '../../ui/ToolbarButton';
import { AccountMenu } from '../../ui/AccountMenu';
import { SidebarToggle } from '../../app/SidebarToggle';
import { useAutoHideScrollbar } from '../../ui/useAutoHideScrollbar';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { eventHoverProps } from '../../ui/eventHoverStore';
import { ContextMenu, pointAnchor, type ContextMenuItem } from '../../ui/ContextMenu';
import { buildEventMenuItems, pasteEvent } from '../../app/eventActions';
import { useEventClipboard } from '../../app/eventClipboard';
import { FloatingPortal, type VirtualElement } from '@floating-ui/react';
import type { CalendarEvent } from '../../core/types';
import './monthGrid.css';
import '../../ui/cosmetics.css';
import '../special-day/specialDay.css';
import './expandedDay.css';
import { confirmChoice, confirmDialog } from '../../ui/confirmStore';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

// Holds a copied day style across cell selections. Module-scoped (not a ref or
// state) so it survives the grid re-mounting when the selected cell changes.
let styleClipboard: Omit<SpecialDay, 'id' | 'date'> | null = null;

const INITIAL_BEFORE = 26; // weeks rendered before the current week
const INITIAL_AFTER = 26; // weeks rendered after the current week
const CHUNK = 12; // weeks added when scrolling near an edge

function weeksBetween(fromMonday: string, toMonday: string): number {
  return Math.round(
    (parseISODate(toMonday).getTime() - parseISODate(fromMonday).getTime()) / (7 * 86_400_000),
  );
}

/** Feed the pointer position into a cosmetic event as `--mx`/`--my` (percent of
 *  the element) so the CSS cursor-spotlight can follow the mouse. */
function trackCosmeticPointer(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

interface WeatherInfo {
  code: number;
  emoji: string;
  maxTemp: number;
  minTemp: number;
  description: string;
  uvIndex?: number;
  rainChance?: number;
  hourlyUv?: { hour: string; value: number }[];
}

type WeatherForecast = Record<string, WeatherInfo>;

function getWeatherDescription(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57].includes(code)) return 'Freezing drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([71, 73, 75].includes(code)) return 'Snow fall';
  if (code === 77) return 'Snow grains';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if ([96, 99].includes(code)) return 'Thunderstorm with hail';
  return 'Unknown weather';
}

function getWeatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if ([1, 2, 3].includes(code)) return '⛅';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '☀️';
}

function isRainyOrSunny(code: number): boolean {
  // Sunny: 0 (Clear sky), 1 (Mainly clear), 2 (Partly cloudy), 3 (Overcast)
  // Rainy: drizzle, freezing drizzle, rain, freezing rain, rain showers, thunderstorm, thunderstorm with hail
  const sunnyCodes = [0, 1, 2, 3];
  const rainyCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  return sunnyCodes.includes(code) || rainyCodes.includes(code);
}

async function getCurrentCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
    );
  });
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    if (res.ok) {
      const data = await res.json();
      return data.city || data.locality || data.village || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }
  } catch (err) {
    console.error('Reverse geocode error:', err);
  }
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max&hourly=uv_index&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch weather forecast');
  }
  const data = await res.json();
  const forecast: WeatherForecast = {};

  const times = data.daily.time as string[];
  const codes = data.daily.weathercode as number[];
  const maxTemps = data.daily.temperature_2m_max as number[];
  const minTemps = data.daily.temperature_2m_min as number[];
  const uvIndices = data.daily.uv_index_max as number[];
  const rainChances = data.daily.precipitation_probability_max as number[];

  const hourlyTime = data.hourly?.time as string[];
  const hourlyUv = data.hourly?.uv_index as number[];
  const hourlyByDate: Record<string, { hour: string; value: number }[]> = {};

  if (hourlyTime && hourlyUv) {
    for (let i = 0; i < hourlyTime.length; i++) {
      const datePart = hourlyTime[i].slice(0, 10);
      const hourPart = hourlyTime[i].slice(11, 16);
      const hourNum = parseInt(hourPart.slice(0, 2), 10);

      // Even hours between 08:00 and 20:00 for compact display
      if (hourNum >= 8 && hourNum <= 20 && hourNum % 2 === 0) {
        if (!hourlyByDate[datePart]) {
          hourlyByDate[datePart] = [];
        }
        hourlyByDate[datePart].push({
          hour: hourPart,
          value: hourlyUv[i],
        });
      }
    }
  }

  for (let i = 0; i < times.length; i++) {
    const d = times[i];
    forecast[d] = {
      code: codes[i],
      emoji: getWeatherEmoji(codes[i]),
      maxTemp: Math.round(maxTemps[i]),
      minTemp: Math.round(minTemps[i]),
      description: getWeatherDescription(codes[i]),
      uvIndex: uvIndices ? uvIndices[i] : undefined,
      rainChance: rainChances ? rainChances[i] : undefined,
      hourlyUv: hourlyByDate[d] || [],
    };
  }
  return forecast;
}

function TodayClock() {
  const clockStyle = useSettingsStore((s) => s.clockStyle);
  const [time, setTime] = useState(() => new Date());
  const showSeconds = clockStyle.showSeconds;

  // Tick only as often as the rendered format actually changes. Without
  // seconds the display moves once a minute, so a fixed 250ms interval was
  // re-rendering ~240 times per minute to paint the same string; align to the
  // next minute boundary instead.
  useEffect(() => {
    let timer: number;
    const tick = () => {
      const now = new Date();
      setTime(now);
      const delay = showSeconds
        ? 1000 - now.getMilliseconds()
        : (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      timer = window.setTimeout(tick, Math.max(50, delay));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [showSeconds]);

  return (
    <span className="today-clock" style={clockTextStyle(clockStyle)}>
      {formatClockTime(time, clockStyle)}
    </span>
  );
}

interface LocationDialogProps {
  isOpen: boolean;
  onClose(): void;
  currentLocation: string;
  onUpdateLocation(name: string, lat: number, lon: number): void;
  onDisableLocationAndWeather(): void;
}

function LocationDialog({
  isOpen,
  onClose,
  currentLocation,
  onUpdateLocation,
  onDisableLocationAndWeather,
}: LocationDialogProps) {
  const [inputValue, setInputValue] = useState(currentLocation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputValue(currentLocation);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, currentLocation]);

  if (!isOpen) return null;

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const query = inputValue.trim();
    if (!query) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const result = data.results[0];
          const cleanName = result.admin1 ? `${result.name}, ${result.admin1}` : result.name;
          onUpdateLocation(cleanName, result.latitude, result.longitude);
          onClose();
        } else {
          setError(`City or village "${query}" not found.`);
        }
      } else {
        setError('Failed to fetch location from geocoding service.');
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      setError('Error searching for location. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <FloatingPortal>
      <div className="confirm-overlay" onClick={onClose}>
        <div
          className="confirm-card"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="confirm-title" style={{ marginBottom: 'var(--space-1)' }}>Update Location</div>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div className="confirm-message" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span>Enter your city or village:</span>
              <input
                id="location-input"
                ref={inputRef}
                type="text"
                className="location-input-field"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. London, Paris, New York"
                disabled={loading}
              />
            </div>
            {error && (
              <div className="location-dialog-error" style={{ color: 'var(--color-danger, #ff453a)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⚠️ {error}
              </div>
            )}
            <div className="confirm-actions">
              <button
                type="submit"
                className="confirm-btn primary"
                disabled={loading || !inputValue.trim()}
              >
                {loading ? 'Searching...' : 'Search & Update'}
              </button>
              <button
                type="button"
                className="confirm-btn danger"
                onClick={() => {
                  onDisableLocationAndWeather();
                  onClose();
                }}
              >
                Disable Location & Weather
              </button>
              <button type="button" className="confirm-cancel" onClick={onClose} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </FloatingPortal>
  );
}

export function MonthGrid() {
  const today = todayISO();
  const tileScale = useSettingsStore((s) => s.tileScale);
  const setTileScale = useSettingsStore((s) => s.setTileScale);
  const tileScaleAuto = useSettingsStore((s) => s.tileScaleAuto);
  const setTileScaleAuto = useSettingsStore((s) => s.setTileScaleAuto);
  const showWeatherIconOnDays = useSettingsStore((s) => s.showWeatherIconOnDays);
  const showClockOnToday = useSettingsStore((s) => s.showClockOnToday);
  const weatherAndLocationEnabled = useSettingsStore((s) => s.weatherAndLocationEnabled);
  const setWeatherAndLocationEnabled = useSettingsStore((s) => s.setWeatherAndLocationEnabled);
  const setShowWeatherIconOnDays = useSettingsStore((s) => s.setShowWeatherIconOnDays);
  const setShowHourlyWeather = useSettingsStore((s) => s.setShowHourlyWeather);
  const setShowUvIndex = useSettingsStore((s) => s.setShowUvIndex);
  const calendarViewMode = useSettingsStore((s) => s.calendarViewMode) ?? 'continuous';
  const setCalendarViewMode = useSettingsStore((s) => s.setCalendarViewMode);
  const showGrid = useSettingsStore((s) => s.showGrid) ?? true;

  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const WEEK_HEIGHT = 186 * tileScale;
  const EDGE_PX = WEEK_HEIGHT * 4;

  const currentMonday = useMemo(() => mondayOf(today), [today]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutoHideScrollbar(scrollRef);
  const lastSelfSetDateRef = useRef<string | null>(null);
  const prevWeekHeightRef = useRef(WEEK_HEIGHT);
  const prevScrollHeightRef = useRef(0);

  // Each week row carries content-visibility:auto to skip offscreen rows, whose
  // paint containment clips a bouncing/wiggling tile at the row edge and traps
  // its z-index inside the row. specialDay.css lifts a row out of that
  // containment — but only while it's tagged `week-row-near`. This observer tags
  // rows within ~a screenful of the viewport and untags them once they scroll
  // away, so the opt-out (and the offscreen-skipping it costs) stays limited to
  // rows actually on screen: even a weekly-recurring effect keeps every far-off
  // row skipped.
  const weekRowObserver = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // A row removed from the DOM reports one last non-intersecting entry;
          // drop it so the observer doesn't retain detached nodes.
          if (!e.target.isConnected) {
            obs.unobserve(e.target);
            continue;
          }
          e.target.classList.toggle('week-row-near', e.isIntersecting);
        }
      },
      { root, rootMargin: '400px 0px' },
    );
    weekRowObserver.current = obs;
    // Rows already committed before this effect ran (the initial viewport)
    // aren't caught by the ref callback, so observe them here too; observe() is
    // idempotent, so double-observing a row is harmless.
    root.querySelectorAll('.week-row').forEach((el) => obs.observe(el));
    return () => {
      obs.disconnect();
      weekRowObserver.current = null;
    };
  }, []);
  const registerWeekRow = useCallback((node: HTMLDivElement | null) => {
    if (node) weekRowObserver.current?.observe(node);
  }, []);

  // Ctrl + Mouse Wheel up/down to scale tiles
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        const target = e.target as Element;
        if (target && target.closest('.month-grid')) {
          e.preventDefault();
          const delta = e.deltaY;
          const current = useSettingsStore.getState().tileScale;
          const next = delta < 0 ? current + 0.05 : current - 0.05;
          setTileScale(Math.max(0.5, Math.min(1.5, Number(next.toFixed(2)))));
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [setTileScale]);

  // Auto-fit: in auto mode, pick the tileScale that makes day tiles square for
  // the current grid width, and re-fit whenever that width changes. A tile's
  // width is independent of tileScale while its height is proportional to it, so
  // scaling the current scale by (width / height) lands on square in one step.
  useEffect(() => {
    if (!tileScaleAuto) return;
    const container = scrollRef.current;
    if (!container) return;
    const fit = () => {
      const tile = container.querySelector('.day-tile') as HTMLElement | null;
      if (!tile) return;
      const { width, height } = tile.getBoundingClientRect();
      if (height === 0) return;
      const current = useSettingsStore.getState().tileScale;
      const target = current * (width / height);
      const clamped = Math.max(0.5, Math.min(1.5, Number(target.toFixed(2))));
      if (clamped !== current) setTileScaleAuto(clamped);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [tileScaleAuto, setTileScaleAuto]);


  const [firstMonday, setFirstMonday] = useState(() => addDays(currentMonday, -INITIAL_BEFORE * 7));
  /** firstMonday from the previous commit — drives the prepend scroll anchor. */
  const prevFirstMonday = useRef(firstMonday);
  const [count, setCount] = useState(INITIAL_BEFORE + INITIAL_AFTER + 1);
  const [header, setHeader] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m };
  });
  // Whether today's week is within the viewport (drives the button label).
  const [todayVisible, setTodayVisible] = useState(true);

  const weeks = useMemo(() => buildWeeks(firstMonday, count, today), [firstMonday, count, today]);

  // Own events plus anything shared with this user (see visibleEvents).
  const events = useVisibleEvents();
  const displayTimeZone = useSettingsStore((s) => s.displayTimeZone);
  const categories = useSettingsStore((s) => s.categories);
  const openQuickEntry = useUiStore((s) => s.openQuickEntry);
  const openEditor = useUiStore((s) => s.openEditor);
  const openSpanCreate = useUiStore((s) => s.openSpanCreate);
  const spanCreate = useUiStore((s) => s.span);
  const openSpanDayChooser = useUiStore((s) => s.openSpanDayChooser);
  const openSpecialDayEditor = useUiStore((s) => s.openSpecialDayEditor);
  const setViewedDate = useUiStore((s) => s.setViewedDate);
  const viewedDate = useUiStore((s) => s.viewedDate);
  const selectionActive = useSelectionStore((s) => s.active);
  const selectedIds = useSelectionStore((s) => s.selected);
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const { specialDays, init: initSpecialDays, setSpecialDay, removeSpecialDay } = useSpecialDaysStore();
  const dayImageUrls = useDayImageUrls(specialDays);
  const notify = useCalendarStore((s) => s.notify);

  // ---- right-click menus ----------------------------------------------------

  const [menu, setMenu] = useState<{ anchor: VirtualElement; items: ContextMenuItem[] } | null>(
    null,
  );
  const copied = useEventClipboard((s) => s.copied);
  const [expandedDay, setExpandedDay] = useState<{
    date: string; tile: HTMLElement; collapsedHeight: number;
  } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const closeExpandedDay = (restoreFocus = false) => {
    if (restoreFocus) returnFocusRef.current = expandedDay?.tile ?? null;
    setExpandedDay(null);
  };
  useLayoutEffect(() => {
    if (!expandedDay && returnFocusRef.current) {
      returnFocusRef.current.querySelector<HTMLButtonElement>('.event-more')?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
  }, [expandedDay]);

  const openDayInWeekView = (date: string) => {
    useUiStore.getState().closeOverlays();
    useUiStore.setState({ selectedDate: date, viewedDate: date, weekFocusDate: date });
    setCalendarViewMode('week');
  };

  /** The same actions the week view and the upcoming list offer on an event. */
  const openEventMenu = (
    e: React.MouseEvent,
    event: CalendarEvent,
    occurrenceDate: string,
    span?: { start: string; end: string },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionActive) return;
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: buildEventMenuItems({
        event,
        occurrenceDate,
        anchorEl: e.currentTarget as Element,
        span,
      }),
    });
  };

  /** Day navigation and styling, plus paste when an event has been copied. */
  const onDayContextMenu = (e: React.MouseEvent, date: string) => {
    e.preventDefault();
    setSelectedDate(date);
    const cell = e.currentTarget as Element;
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: [
        { label: 'Open in week view', onClick: () => openDayInWeekView(date) },
        ...(copied ? [{
          label: `Paste “${copied.event.title}”`,
          onClick: () => void pasteEvent({ date }),
        }] : []),
        { label: 'Special day…', onClick: () => openSpecialDayEditor(date, cell) },
      ],
    });
  };

  // Habit tabs: the switcher swaps the day cells' event content for the active
  // tab's per-day entries. A disabled feature or a stale (deleted) tab id
  // resolves to null → the grid shows events as usual.
  const habitTabsEnabled = useSettingsStore((s) => s.habitTabsEnabled);
  const habitTabs = useSettingsStore((s) => s.habitTabs);
  const activeHabitTabId = useUiStore((s) => s.activeHabitTab);
  useEffect(() => { setExpandedDay(null); }, [calendarViewMode, activeHabitTabId]);
  const habitEntries = useHabitEntriesStore((s) => s.entries);
  const activeTab = habitTabsEnabled ? habitTabs.find((t) => t.id === activeHabitTabId) ?? null : null;

  useEffect(() => {
    initSpecialDays();
  }, []);

  const selectedDate = useUiStore((s) => s.selectedDate);
  const setSelectedDate = useUiStore((s) => s.setSelectedDate);

  // Copy/paste a day's style (cosmetic, animation, emoji, recurrence) between
  // selected cells with Ctrl/Cmd+C and Ctrl/Cmd+V. Refs keep the listener stable
  // while always reading the latest selection and special-day data.
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const specialDaysRef = useRef(specialDays);
  specialDaysRef.current = specialDays;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'v') return;

      // Don't hijack copy/paste while the user is actually editing text in a
      // field. Selecting a cell autofocuses a popover input (quick-entry / day
      // editor), so an empty, just-focused field must NOT block the shortcut —
      // only defer when the field has content or an active text selection.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (el.isContentEditable) {
          if (el.textContent?.trim()) return;
        } else {
          const field = el as HTMLInputElement | HTMLTextAreaElement;
          const hasSelection = field.selectionStart !== field.selectionEnd;
          if (field.value || hasSelection) return;
        }
      }
      // …or when the user is copying selected text elsewhere on the page.
      if (key === 'c' && window.getSelection()?.toString()) return;

      const date = selectedDateRef.current;
      if (!date) return;

      if (key === 'c') {
        e.preventDefault();
        const sd = getSpecialDayForDate(specialDaysRef.current, date);
        const hasStyle = sd && (sd.cosmetic || sd.animations.length > 0 || sd.emoji);
        if (hasStyle) {
          styleClipboard = {
            cosmetic: sd.cosmetic,
            animations: sd.animations,
            emoji: sd.emoji,
            recurrence: sd.recurrence,
          };
          notify('Day style copied');
        } else {
          // Copying an unstyled day yields a blank style — paste it onto other
          // cells to clear them.
          styleClipboard = { cosmetic: '', animations: [], emoji: '', recurrence: 'none' };
          notify('Blank style copied');
        }
      } else {
        if (!styleClipboard) {
          notify('Nothing copied yet');
          return;
        }
        e.preventDefault();
        const isBlank =
          !styleClipboard.cosmetic &&
          styleClipboard.animations.length === 0 &&
          !styleClipboard.emoji;
        if (isBlank) {
          // Clear the target: drop any rule anchored on this date, then if a
          // recurring rule still decorates it, add a blank one-off override
          // (recurrence 'none' wins priority and renders nothing).
          removeSpecialDay(date);
          const remaining = useSpecialDaysStore.getState().specialDays;
          const inherited = getSpecialDayForDate(remaining, date);
          if (inherited && (inherited.cosmetic || inherited.animations.length > 0 || inherited.emoji)) {
            setSpecialDay(date, { cosmetic: '', animations: [], emoji: '', recurrence: 'none' });
          }
          notify('Day cleared');
        } else {
          setSpecialDay(date, styleClipboard);
          notify('Day style pasted');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notify, setSpecialDay]);

  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      // Don't hijack if focused on an input/textarea/editable element
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }

      const highlighted = useUiStore.getState().highlightedEvent;
      if (!highlighted) return;

      const events = useCalendarStore.getState().events;
      const event = events.find((ev) => ev.id === highlighted.id);
      if (!event) return;

      e.preventDefault();

      const deleteEvent = useCalendarStore.getState().deleteEvent;
      const updateEvent = useCalendarStore.getState().updateEvent;

      if (event.recurrence && highlighted.date) {
        const choice = await confirmChoice({
          title: 'Delete recurring event',
          message: 'Would you like to delete only this occurrence, or all events in the series?',
          actions: [
            { label: 'Only this event', value: 'occurrence' },
            { label: 'All events', value: 'all', danger: true },
          ],
        });
        if (choice === 'occurrence') {
          const exdates = event.exdates || [];
          if (!exdates.includes(highlighted.date)) {
            await updateEvent(event.id, {
              exdates: [...exdates, highlighted.date],
            });
          }
          useUiStore.setState({ highlightedEvent: null });
        } else if (choice === 'all') {
          await deleteEvent(event.id);
          useUiStore.setState({ highlightedEvent: null });
        }
      } else {
        const confirmed = await confirmDialog({
          title: 'Delete event',
          message: `Are you sure you want to delete "${event.title}"?`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (confirmed) {
          await deleteEvent(event.id);
          useUiStore.setState({ highlightedEvent: null });
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const [locationName, setLocationName] = useState(() => localStorage.getItem('open-calendar.weather-city') || 'London');
  const [coords, setCoords] = useState<{ lat: number; lon: number }>(() => {
    const saved = localStorage.getItem('open-calendar.weather-coords');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {}
    }
    return { lat: 51.5074, lon: -0.1278 };
  });
  const [weather, setWeather] = useState<WeatherForecast | null>(null);

  useEffect(() => {
    const savedCoords = localStorage.getItem('open-calendar.weather-coords');
    if (!savedCoords && weatherAndLocationEnabled) {
      initializeLocation();
    }
  }, [weatherAndLocationEnabled]);

  // A daily forecast does not change minute to minute, so poll every 30 minutes
  // rather than every 60 seconds. On failure (offline, or the API unreachable)
  // back off exponentially up to an hour instead of retrying on the same tight
  // loop forever — an unreachable endpoint used to mean a request and a console
  // error every minute for as long as the app stayed open.
  useEffect(() => {
    if (!weatherAndLocationEnabled) return;
    const OK_INTERVAL = 30 * 60_000;
    const FIRST_RETRY = 60_000;
    const MAX_RETRY = 60 * 60_000;
    let timer: number | undefined;
    let retry = FIRST_RETRY;
    let cancelled = false;

    const run = () => {
      fetchWeather(coords.lat, coords.lon)
        .then((data) => {
          if (cancelled) return;
          setWeather(data);
          retry = FIRST_RETRY;
          timer = window.setTimeout(run, OK_INTERVAL);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Weather error:', err);
          timer = window.setTimeout(run, retry);
          retry = Math.min(retry * 2, MAX_RETRY);
        });
    };

    run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [coords, weatherAndLocationEnabled]);

  async function initializeLocation() {
    try {
      const browserCoords = await getCurrentCoordinates();
      if (browserCoords) {
        const name = await reverseGeocode(browserCoords.latitude, browserCoords.longitude);
        updateLocation(name, browserCoords.latitude, browserCoords.longitude);
      } else {
        const geoRes = await fetch('https://ipapi.co/json/');
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.latitude && geoData.longitude) {
            updateLocation(geoData.city || 'London', geoData.latitude, geoData.longitude);
            return;
          }
        }
        const fallbackRes = await fetch('https://freeipapi.com/api/json');
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.latitude && fallbackData.longitude) {
            updateLocation(fallbackData.cityName || 'London', fallbackData.latitude, fallbackData.longitude);
          }
        }
      }
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  function updateLocation(name: string, lat: number, lon: number) {
    setLocationName(name);
    setCoords({ lat, lon });
    localStorage.setItem('open-calendar.weather-city', name);
    localStorage.setItem('open-calendar.weather-coords', JSON.stringify({ lat, lon }));
  }

  function handleLocationClick() {
    setIsLocationDialogOpen(true);
  }
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  // Open text/number habit-entry editor (check tabs toggle inline, no popover).
  const [habitEditor, setHabitEditor] = useState<{ date: string; anchorEl: Element } | null>(null);
  const [moveChoice, setMoveChoice] = useState<{
    event: CalendarEvent;
    originalDate: string;
    targetDate: string;
    anchorEl: Element;
  } | null>(null);

  function handleDragStart(e: React.DragEvent, event: CalendarEvent, currentDate: string) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ eventId: event.id, currentDate }));
    e.dataTransfer.effectAllowed = 'move';
  }

  // A day tile clicked while a habit tab is active: check tabs toggle their
  // boolean in place; text/number tabs open the entry editor popover.
  function handleHabitTileClick(date: string, anchorEl: Element) {
    if (!activeTab) return;
    setSelectedDate(date);
    if (activeTab.kind === 'check') {
      const current = useHabitEntriesStore.getState().entries[activeTab.id]?.[date]?.v === true;
      if (current) {
        useHabitEntriesStore.getState().clearEntry(activeTab.id, date);
      } else {
        useHabitEntriesStore.getState().setEntry(activeTab.id, date, true);
      }
      return;
    }
    setHabitEditor({ date, anchorEl });
  }

  async function executeMove(
    event: CalendarEvent,
    originalDate: string,
    targetDate: string,
    onlyThisOccurrence: boolean,
  ) {
    const diffDays = Math.round(
      (parseISODate(targetDate).getTime() - parseISODate(originalDate).getTime()) / 86_400_000,
    );
    if (diffDays === 0) return;

    const nextDate = addDays(event.date, diffDays);
    const nextEndDate = event.endDate ? addDays(event.endDate, diffDays) : undefined;

    if (event.recurrence && onlyThisOccurrence) {
      // 1. Create a copy of the event on the new target date (no recurrence rule)
      const override = event.dayOverrides?.[originalDate];
      const eventDuration = event.endDate
        ? Math.round((parseISODate(event.endDate).getTime() - parseISODate(event.date).getTime()) / 86_400_000)
        : 0;
      const copyEndDate = event.endDate ? addDays(targetDate, eventDuration) : undefined;
      
      const newEventInput = {
        title: override?.title ?? event.title,
        date: targetDate,
        endDate: copyEndDate,
        type: event.type,
        time: override?.time !== undefined ? override.time : event.time,
        description: event.description,
        recurrence: null,
        color: event.color,
        tz: event.tz,
        showOnMinimap: override?.showOnMinimap !== undefined ? override.showOnMinimap : event.showOnMinimap,
        calendarUrls: event.calendarUrls,
      };

      // 2. Add original occurrence to exdates in the source recurring event
      const exdates = event.exdates || [];
      const updatedExdates = [...exdates, originalDate];

      // Remove the override for the moved date if it exists
      const nextOverrides = { ...(event.dayOverrides ?? {}) };
      delete nextOverrides[originalDate];

      // Perform updates
      await useCalendarStore.getState().addEvent(newEventInput);
      await useCalendarStore.getState().updateEvent(event.id, {
        exdates: updatedExdates,
        dayOverrides: Object.keys(nextOverrides).length ? nextOverrides : undefined,
      });
    } else {
      // Non-recurring event or "All events" chosen: shift the base date(s)
      const patch: any = {
        date: nextDate,
      };
      if (nextEndDate) {
        patch.endDate = nextEndDate;
      }

      if (event.recurrence) {
        if (event.exdates) {
          patch.exdates = event.exdates.map((d) => addDays(d, diffDays));
        }
        if (event.dayOverrides) {
          const nextOverrides: Record<string, any> = {};
          for (const [d, val] of Object.entries(event.dayOverrides)) {
            nextOverrides[addDays(d, diffDays)] = val;
          }
          patch.dayOverrides = nextOverrides;
        }
      }

      await useCalendarStore.getState().updateEvent(event.id, patch);
    }
  }

  function handleDrop(e: React.DragEvent, targetDate: string, anchorEl: Element) {
    e.preventDefault();
    setDragOverDate(null);

    const file = mediaFileFromDataTransfer(e.dataTransfer);
    if (file) {
      // Video and GIF clips are re-encoded in real time, so say so — a silent
      // ten-second wait after a drop reads as nothing having happened.
      notify(isMotionFile(file) ? 'Optimising clip for this day…' : 'Processing image background...');
      ingestMediaForDay(targetDate, file)
        .then(() => {
          notify('Day background updated');
        })
        .catch((err) => {
          notify('Failed to update background: ' + (err instanceof Error ? err.message : String(err)));
        });
      return;
    }

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const { eventId, currentDate } = JSON.parse(dataStr);
      if (!eventId || !currentDate) return;
      if (currentDate === targetDate) return;

      const event = events.find((ev) => ev.id === eventId);
      if (!event) return;

      if (event.recurrence) {
        setMoveChoice({
          event,
          originalDate: currentDate,
          targetDate,
          anchorEl,
        });
      } else {
        void executeMove(event, currentDate, targetDate, false);
      }
    } catch (err) {
      console.error('Drop handling failed:', err);
    }
  }

  // Click-drag across day tiles to create a multi-day span. While dragging,
  // `drag.anchor` is the press tile and `drag.current` the hovered tile.
  const [drag, setDrag] = useState<{ anchor: string; current: string } | null>(null);
  const dragAnchorElRef = useRef<Element | null>(null);

  function onTilePointerDown(e: React.PointerEvent, date: string) {
    // Left button only; ignore presses that start on a chip/span (those have
    // their own handlers) and ignore bulk-select mode.
    if (e.button !== 0 || selectionActive) return;
    if ((e.target as HTMLElement).closest('.event-chip, .span-seg, .event-more')) return;
    dragAnchorElRef.current = e.currentTarget as Element;
    setDrag({ anchor: date, current: date });
  }

  function onTilePointerEnter(date: string) {
    setDrag((d) => (d && d.current !== date ? { ...d, current: date } : d));
  }

  // Mirror the day under the pointer into the ui store so the minimap can show
  // where the eye is. Read off the event target rather than per-tile handlers,
  // and via getState so the grid itself never re-renders on hover.
  function onGridPointerOver(e: React.PointerEvent<HTMLDivElement>) {
    const tile = (e.target as Element | null)?.closest('.day-tile');
    useUiStore.getState().setHoveredDate(tile?.getAttribute('data-date') ?? null);
  }

  function onGridPointerLeave() {
    useUiStore.getState().setHoveredDate(null);
  }

  // Resolve the drag on pointer-up: a multi-day drag opens the span modal; a
  // press-release on a single tile falls through to the tile's click handler
  // (quick entry).
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const container = scrollRef.current;
      if (container) {
        autoScrollRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          containerRect: container.getBoundingClientRect(),
          isPointerDrag: true,
        };
        startScrollLoop();
      }
    };
    const onUp = () => {
      stopScrollLoop();
      const anchorEl = dragAnchorElRef.current;
      setDrag(null);
      if (!drag || drag.anchor === drag.current || !anchorEl) return;
      const start = drag.anchor < drag.current ? drag.anchor : drag.current;
      const end = drag.anchor < drag.current ? drag.current : drag.anchor;
      openSpanCreate(start, end, anchorEl);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      stopScrollLoop();
    };
  }, [drag, openSpanCreate]);

  const scrollFrameRef = useRef<number | null>(null);
  const autoScrollRef = useRef<{
    clientX: number;
    clientY: number;
    containerRect: DOMRect | null;
    isPointerDrag: boolean;
  } | null>(null);

  const startScrollLoop = () => {
    if (scrollFrameRef.current !== null) return;

    const tick = () => {
      const state = autoScrollRef.current;
      if (!state) {
        scrollFrameRef.current = null;
        return;
      }

      const container = scrollRef.current;
      if (!container) {
        scrollFrameRef.current = null;
        return;
      }

      const { clientX, clientY, containerRect } = state;
      if (!containerRect) {
        scrollFrameRef.current = null;
        return;
      }

      const EDGE_THRESHOLD = 80;
      const MAX_SPEED = 20;

      let delta = 0;
      if (clientY < containerRect.top + EDGE_THRESHOLD) {
        const dist = clientY - containerRect.top;
        const ratio = Math.max(0, Math.min(1, (EDGE_THRESHOLD - dist) / EDGE_THRESHOLD));
        delta = -Math.max(1, ratio * MAX_SPEED);
      } else if (clientY > containerRect.bottom - EDGE_THRESHOLD) {
        const dist = containerRect.bottom - clientY;
        const ratio = Math.max(0, Math.min(1, (EDGE_THRESHOLD - dist) / EDGE_THRESHOLD));
        delta = Math.max(1, ratio * MAX_SPEED);
      }

      if (delta !== 0) {
        container.scrollTop += delta;

        const element = document.elementFromPoint(clientX, clientY);
        const dayTile = element?.closest('.day-tile');
        if (dayTile) {
          const date = dayTile.getAttribute('data-date');
          if (date) {
            if (!state.isPointerDrag) {
              setDragOverDate(date);
            } else {
              setDrag((d) => (d && d.current !== date ? { ...d, current: date } : d));
            }
          }
        }
        scrollFrameRef.current = requestAnimationFrame(tick);
      } else {
        scrollFrameRef.current = null;
      }
    };

    scrollFrameRef.current = requestAnimationFrame(tick);
  };

  const stopScrollLoop = () => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    autoScrollRef.current = null;
  };

  useEffect(() => {
    const handleGlobalDragEnd = () => {
      stopScrollLoop();
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    window.addEventListener('drop', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
      window.removeEventListener('drop', handleGlobalDragEnd);
      stopScrollLoop();
    };
  }, []);

  function handleDragOver(e: React.DragEvent) {
    const container = scrollRef.current;
    if (container) {
      autoScrollRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        containerRect: container.getBoundingClientRect(),
        isPointerDrag: false,
      };
      startScrollLoop();
    }
  }

  // The highlighted range: the live drag while pressing, otherwise the range of
  // the open span-create modal so the selection stays visible behind it.
  const pendingSpan = !drag && spanCreate && !spanCreate.eventId ? spanCreate : null;
  const dragLo = drag
    ? (drag.anchor < drag.current ? drag.anchor : drag.current)
    : pendingSpan?.start ?? null;
  const dragHi = drag
    ? (drag.anchor < drag.current ? drag.current : drag.anchor)
    : pendingSpan?.end ?? null;

  const byDate = useMemo(() => {
    const start = weeks[0].days[0].date;
    const end = weeks[weeks.length - 1].days[6].date;
    return groupOccurrences(events, start, end, displayTimeZone);
  }, [events, weeks, displayTimeZone]);

  /** Effective look for an event chip/span: a cosmetic class suffix, or a
   *  matched-category inline style (event's own color always wins over both). */
  const eventLook = (event: CalendarEvent): { suffix: string; style?: React.CSSProperties; isCosmetic: boolean } => {
    const look = resolveEventLook(event, categories);
    if (look.kind === 'cosmetic') {
      const cls = cosmeticClass(look.id);
      return { suffix: cls ? ` ${cls} cosmetic-${cosmeticById(look.id)!.kind}` : '', isCosmetic: true };
    }
    if (look.kind === 'match' && !event.color) {
      return {
        suffix: look.config.type === 'gradient' ? ' event-match-gradient' : '',
        style: getMatchedEventStyle(look.config) as React.CSSProperties,
        isCosmetic: false,
      };
    }
    return { suffix: '', isCosmetic: false };
  };

  // When earlier weeks are prepended, firstMonday moves back. Shift scrollTop
  // down by the added height so the viewport stays put. Keyed on firstMonday
  // (not a counter) so it applies exactly once per change, even if React
  // double-invokes the effect.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || firstMonday === prevFirstMonday.current) return;
    
    if (calendarViewMode === 'separate') {
      const prevScrollHeight = prevScrollHeightRef.current;
      if (prevScrollHeight > 0) {
        const delta = el.scrollHeight - prevScrollHeight;
        if (delta > 0) {
          el.scrollTop += delta;
        }
      }
    } else {
      const weeksAddedAtTop = weeksBetween(firstMonday, prevFirstMonday.current);
      if (weeksAddedAtTop > 0) el.scrollTop += weeksAddedAtTop * WEEK_HEIGHT;
    }
    prevFirstMonday.current = firstMonday;
    prevScrollHeightRef.current = 0;
  }, [firstMonday, calendarViewMode]);

  // Jump to the current week on mount and seed the viewed-week marker.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = INITIAL_BEFORE * WEEK_HEIGHT;
    setViewedDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep scroll position proportional when week row height changes due to zooming
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prevHeight = prevWeekHeightRef.current;
    if (prevHeight !== WEEK_HEIGHT) {
      const weekIndex = el.scrollTop / prevHeight;
      el.scrollTop = weekIndex * WEEK_HEIGHT;
      prevWeekHeightRef.current = WEEK_HEIGHT;
    }
  }, [WEEK_HEIGHT]);

  // Synchronize header text when viewedDate changes (e.g. from minimap or "show today").
  useLayoutEffect(() => {
    if (viewedDate) {
      const [y, m] = viewedDate.split('-').map(Number);
      setHeader((h) => (h.year === y && h.month === m ? h : { year: y, month: m }));
    }
  }, [viewedDate]);

  // Synchronize scroll position with viewedDate (e.g. from minimap wheel scroll).
  useLayoutEffect(() => {
    if (!viewedDate) return;
    if (viewedDate === lastSelfSetDateRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const targetMonday = mondayOf(viewedDate);
    const targetWeeks = weeksBetween(firstMonday, targetMonday);

    if (targetWeeks < 0 || targetWeeks >= count) {
      // Out of bounds, load more weeks centered on targetMonday
      const newFirstMonday = addDays(targetMonday, -INITIAL_BEFORE * 7);
      setFirstMonday(newFirstMonday);
      setCount(INITIAL_BEFORE + INITIAL_AFTER + 1);
    } else {
      if (calendarViewMode === 'separate') {
        const [y, m] = viewedDate.split('-').map(Number);
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const blockEl = el.querySelector(`[data-month-block="${monthKey}"]`) as HTMLElement;
        if (blockEl) {
          el.scrollTop = blockEl.offsetTop;
        }
      } else {
        const targetScrollTop = targetWeeks * WEEK_HEIGHT;
        const currentScrollTop = el.scrollTop;
        const currentWeekIdx = Math.round(currentScrollTop / WEEK_HEIGHT);
        if (currentWeekIdx !== targetWeeks) {
          el.scrollTop = targetScrollTop;
        }
      }
    }
  }, [viewedDate, firstMonday, count, calendarViewMode]);

  function scrollToToday() {
    setViewedDate(today);
    setSelectedDate(today);
    const el = scrollRef.current;
    if (el) {
      if (calendarViewMode === 'separate') {
        const [y, m] = today.split('-').map(Number);
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const blockEl = el.querySelector(`[data-month-block="${monthKey}"]`) as HTMLElement;
        if (blockEl) {
          el.scrollTop = blockEl.offsetTop;
        }
      } else {
        const targetWeeks = weeksBetween(firstMonday, currentMonday);
        if (targetWeeks >= 0 && targetWeeks < count) {
          el.scrollTop = targetWeeks * WEEK_HEIGHT;
        }
      }
    }
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;

    let activeYear = header.year;
    let activeMonth = header.month;
    let targetDate = viewedDate;

    if (calendarViewMode === 'separate') {
      const blocks = el.querySelectorAll('.month-block-container');
      const containerRect = el.getBoundingClientRect();
      let bestBlock: Element | null = null;
      let bestIntersection = -Infinity;
      
      for (const block of Array.from(blocks)) {
        const rect = block.getBoundingClientRect();
        const top = Math.max(rect.top, containerRect.top);
        const bottom = Math.min(rect.bottom, containerRect.bottom);
        const visibleHeight = bottom - top;
        if (visibleHeight > bestIntersection) {
          bestIntersection = visibleHeight;
          bestBlock = block;
        }
      }
      
      if (bestBlock) {
        const blockMonthAttr = bestBlock.getAttribute('data-month-block'); // "YYYY-MM"
        if (blockMonthAttr) {
          const [y, m] = blockMonthAttr.split('-').map(Number);
          activeYear = y;
          activeMonth = m;
          
          if (viewedDate) {
            const [vy, vm] = viewedDate.split('-').map(Number);
            if (vy !== y || vm !== m) {
              targetDate = `${y}-${String(m).padStart(2, '0')}-01`;
            }
          } else {
            targetDate = `${y}-${String(m).padStart(2, '0')}-01`;
          }
        }
      }
    } else {
      const topIdx = Math.round(el.scrollTop / WEEK_HEIGHT);
      const wk = weeks[Math.min(Math.max(topIdx, 0), weeks.length - 1)];
      if (wk) {
        const m = weekMonth(wk);
        activeYear = m.year;
        activeMonth = m.month;
        
        targetDate = wk.days[3].date;
        const hasTodayInWeek = wk.days.some((d) => d.isToday);
        const hasViewedDateInWeek = viewedDate && wk.days.some((d) => d.date === viewedDate);
        if (hasTodayInWeek) {
          targetDate = today;
        } else if (hasViewedDateInWeek && viewedDate) {
          targetDate = viewedDate;
        } else {
          const eventDay = wk.days.find((d) => (byDate.get(d.date) ?? []).length > 0);
          if (eventDay) {
            targetDate = eventDay.date;
          }
        }
      }
    }

    setHeader((h) => (h.year === activeYear && h.month === activeMonth ? h : { year: activeYear, month: activeMonth }));
    if (targetDate) {
      lastSelfSetDateRef.current = targetDate;
      setViewedDate(targetDate);
    }

    const todayIdx = weeksBetween(firstMonday, currentMonday);
    if (calendarViewMode === 'separate') {
      const todayEl = el.querySelector(`[data-date="${today}"]`);
      if (todayEl) {
        const rect = todayEl.getBoundingClientRect();
        const containerRect = el.getBoundingClientRect();
        const isVisible = rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
        setTodayVisible(isVisible);
      } else {
        setTodayVisible(false);
      }
    } else {
      const topIdx = Math.round(el.scrollTop / WEEK_HEIGHT);
      const bottomIdx = Math.floor((el.scrollTop + el.clientHeight - 1) / WEEK_HEIGHT);
      setTodayVisible(todayIdx >= topIdx && todayIdx <= bottomIdx);
    }

    if (el.scrollTop < EDGE_PX) {
      prevScrollHeightRef.current = el.scrollHeight;
      setFirstMonday((fm) => addDays(fm, -CHUNK * 7));
      setCount((c) => c + CHUNK);
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_PX) {
      setCount((c) => c + CHUNK);
    }
  }

  // A wheel or trackpad gesture fires `scroll` many times per frame, and each run
  // of the handler above measures the DOM (getBoundingClientRect on every month
  // block in Months view) and pushes state into two stores — re-rendering every
  // day tile. Coalesce to at most one run per frame. The ref always holds the
  // current render's closure, so the deferred run never sees stale weeks/byDate.
  const scrollHandlerRef = useRef(onScroll);
  scrollHandlerRef.current = onScroll;
  const scrollRafRef = useRef<number | null>(null);

  function onScrollThrottled() {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollHandlerRef.current();
    });
  }

  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

  const groupedMonths = useMemo(() => {
    if (calendarViewMode !== 'separate') return [];
    
    const monthIndices = new Set<number>();
    for (const week of weeks) {
      for (const day of week.days) {
        monthIndices.add(day.monthIndex);
      }
    }
    const sortedIndices = Array.from(monthIndices).sort((a, b) => a - b);
    
    return sortedIndices.map((monthIndex) => {
      const year = Math.floor(monthIndex / 12);
      const monthNum = monthIndex % 12; // 0-11
      const key = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
      
      const monthWeeks = weeks.filter((week) =>
        week.days.some((day) => day.monthIndex === monthIndex)
      );
      
      return {
        year,
        month: monthNum + 1,
        monthIndex,
        key,
        weeks: monthWeeks,
      };
    });
  }, [weeks, calendarViewMode]);

  useExpandedDay({
    tile: expandedDay?.tile ?? null,
    collapsedHeight: expandedDay?.collapsedHeight ?? 0,
    childOverlayOpen: Boolean(menu || moveChoice),
    onClose: closeExpandedDay,
  });

  const renderDayCell = (cell: typeof weeks[0]['days'][0], dayIdx: number, isCurrentMonth: boolean) => {
    const expanded = expandedDay?.date === cell.date;
    if (!isCurrentMonth) {
      // Days that belong to an adjacent month (the leading/trailing slots in the
      // Months view) render as invisible placeholders — they only hold their grid
      // position so the columns stay aligned; no tile is shown.
      return (
        <div
          key={cell.date}
          className="day-tile day-tile-empty"
          style={{ visibility: 'hidden' }}
        />
      );
    }
    const dayEvents = byDate.get(cell.date) ?? [];
    const spans = dayEvents.filter((d) => isSpan(d.event));
    const chips = dayEvents.filter((d) => !isSpan(d.event));
    // While a habit tab is active the cell records entries instead of events:
    // no drag-to-create, no event drop targets, no event chips.
    const habitActive = activeTab != null;
    const monthYear = Math.floor(cell.monthIndex / 12);
    const monthNum = cell.monthIndex % 12;
    const inSelection = (d: string) => dragLo != null && d >= dragLo && d <= dragHi!;
    const inDragRange = isCurrentMonth && inSelection(cell.date);
    // Highlight the grid's existing shared dividers that bound or sit inside the
    // selection, rather than drawing a separate outline. A tile owns the line on
    // its right (border-right) and below it (border-bottom); we recolour those
    // when either side of the line is selected. border-right only borders the
    // same-row neighbour (date+1), so it's skipped on Sundays (dayIdx 6) whose
    // right edge wraps; border-bottom always borders the cell one week below.
    const hlBorderRight =
      isCurrentMonth && (inSelection(cell.date) || (dayIdx < 6 && inSelection(addDays(cell.date, 1))));
    const hlBorderBottom =
      isCurrentMonth && (inSelection(cell.date) || inSelection(addDays(cell.date, 7)));
    // The Monday column (dayIdx 0) has no left neighbour to lend its border-right
    // as the selection's left edge, so an in-range Monday draws its own.
    const hlBorderLeft = isCurrentMonth && dayIdx === 0 && inSelection(cell.date);
    const specialDay = isCurrentMonth ? getSpecialDayForDate(specialDays, cell.date) : null;
    const bg = specialDay
      ? resolveDayBackground(specialDay)
      : ({ kind: 'none' } as DayBackground);
    const specialCosmeticClass =
      bg.kind === 'cosmetic'
        ? (() => {
            const c = cosmeticById(bg.id);
            if (!c) return '';
            const cls = cosmeticClass(bg.id);
            return cls ? ` ${cls} cosmetic-${c.kind}` : '';
          })()
        : '';
    const customBgClass = bg.kind === 'image' || bg.kind === 'css' ? ' is-custom-bg' : '';
    const specialAnimationClass = specialDay?.animations.length
      ? specialDay.animations.map((a) => ` animation-${a}`).join('')
      : '';

    return (
      <div
        key={cell.date}
        data-date={cell.date}
        role={expanded ? 'dialog' : undefined}
        aria-label={expanded ? parseISODate(cell.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : undefined}
        tabIndex={expanded ? -1 : undefined}
        className={
          'day-tile' + (expanded ? ' day-tile-expanded' : '') +
          (cell.monthIndex % 2 === 0 ? ' month-tint-a' : ' month-tint-b') +
          (cell.date === selectedDate ? ' day-tile-today' : '') +
          (cell.isToday ? ' is-today' : '') +
          (inDragRange ? ' is-drag-range' : '') +
          (hlBorderRight ? ' hl-border-right' : '') +
          (hlBorderBottom ? ' hl-border-bottom' : '') +
          (hlBorderLeft ? ' hl-border-left' : '') +
          (dragOverDate === cell.date ? ' is-drag-over' : '') +
          specialCosmeticClass +
          customBgClass +
          (expanded ? '' : specialAnimationClass)
        }
        onPointerDown={isCurrentMonth && !habitActive && !expanded ? (e) => onTilePointerDown(e, cell.date) : undefined}
        onPointerEnter={isCurrentMonth && !habitActive ? () => onTilePointerEnter(cell.date) : undefined}

        onDragEnter={isCurrentMonth && !habitActive ? (e) => {
          e.preventDefault();
          if (dragOverDate !== cell.date) {
            setDragOverDate(cell.date);
          }
        } : undefined}
        onDragOver={isCurrentMonth && !habitActive ? (e) => {
          e.preventDefault();
          const isFile = e.dataTransfer.types?.includes('Files') ?? false;
          if (isFile) {
            e.dataTransfer.dropEffect = 'copy';
          } else {
            e.dataTransfer.dropEffect = 'move';
          }
          if (dragOverDate !== cell.date) {
            setDragOverDate(cell.date);
          }
        } : undefined}
        onDragLeave={isCurrentMonth && !habitActive ? (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX >= rect.right ||
            e.clientY < rect.top ||
            e.clientY >= rect.bottom
          ) {
            setDragOverDate(null);
          }
        } : undefined}
        onDrop={isCurrentMonth && !habitActive ? (e) => handleDrop(e, cell.date, e.currentTarget) : undefined}
        onClick={(e) => {
          if (!isCurrentMonth) {
            const [y, m] = cell.date.split('-').map(Number);
            const targetMonthKey = `${y}-${String(m).padStart(2, '0')}`;
            const blockEl = scrollRef.current?.querySelector(`[data-month-block="${targetMonthKey}"]`) as HTMLElement;
            if (blockEl) {
              scrollRef.current!.scrollTop = blockEl.offsetTop;
            }
            setSelectedDate(cell.date);
            setViewedDate(cell.date);
            return;
          }
          if (habitActive) {
            handleHabitTileClick(cell.date, e.currentTarget);
            return;
          }
          setSelectedDate(cell.date);
          if (selectionActive) return;
          openQuickEntry(cell.date, e.currentTarget);
        }}
        onContextMenu={isCurrentMonth ? (e) => onDayContextMenu(e, cell.date) : undefined}
      >
        {bg.kind === 'image' && dayImageUrls[bg.ref.id] && (
          <DayMediaFill url={dayImageUrls[bg.ref.id]} video={bg.ref.media === 'video'} />
        )}
        {bg.kind === 'css' && <div className={`day-fill ${bg.scopeClass}`} aria-hidden="true" />}
        {(bg.kind === 'image' || bg.kind === 'css') && <div className="day-scrim" aria-hidden="true" />}
        <span className="day-number">
          {calendarViewMode !== 'separate' && cell.isFirstOfMonth && (
            <span className="month-marker">
              {MONTH_NAMES[monthNum]}
              {monthNum === 0 ? ` ${monthYear}` : ''}
            </span>
          )}
          {cell.day}
          {specialDay?.emoji && (
            <span className="special-day-emoji-badge" title="Special day!">
              {specialDay.emoji}
            </span>
          )}
        </span>
        
        {/* Particle Overlays */}
        {specialDay?.animations.includes('sparkles') && (
          <div className="special-day-particles">
            <svg className="special-day-sparkle" style={{ top: '15%', left: '25%', animationDelay: '0s' }} viewBox="0 0 24 24"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
            <svg className="special-day-sparkle" style={{ top: '65%', left: '75%', animationDelay: '0.5s' }} viewBox="0 0 24 24"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
            <svg className="special-day-sparkle" style={{ top: '35%', left: '80%', animationDelay: '1s' }} viewBox="0 0 24 24"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
            <svg className="special-day-sparkle" style={{ top: '70%', left: '15%', animationDelay: '1.5s' }} viewBox="0 0 24 24"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
          </div>
        )}
        {specialDay?.animations.includes('snow') && (
          <div className="special-day-particles">
            <div className="special-day-snowflake" style={{ top: '-5px', left: '20%', animationDelay: '0s' }} />
            <div className="special-day-snowflake" style={{ top: '-5px', left: '50%', animationDelay: '1.2s' }} />
            <div className="special-day-snowflake" style={{ top: '-5px', left: '80%', animationDelay: '0.6s' }} />
            <div className="special-day-snowflake" style={{ top: '-5px', left: '35%', animationDelay: '2.1s' }} />
          </div>
        )}
        {specialDay?.animations.includes('fireflies') && (
          <div className="special-day-particles">
            <div className="special-day-firefly" style={{ top: '80%', left: '20%', animationDelay: '0s' }} />
            <div className="special-day-firefly" style={{ top: '60%', left: '60%', animationDelay: '1.5s' }} />
            <div className="special-day-firefly" style={{ top: '40%', left: '30%', animationDelay: '3s' }} />
            <div className="special-day-firefly" style={{ top: '75%', left: '75%', animationDelay: '0.8s' }} />
          </div>
        )}
        {specialDay?.animations.includes('comet') && (
          <div className="special-day-particles">
            <div className="special-day-comet" style={{ top: '6%', left: '5%', animationDelay: '0s', animationDuration: '3.8s' }} />
            <div className="special-day-comet" style={{ top: '13%', left: '33%', animationDelay: '0.5s', animationDuration: '4.3s' }} />
            <div className="special-day-comet" style={{ top: '9%', left: '70%', animationDelay: '1.4s', animationDuration: '4s' }} />
            <div className="special-day-comet" style={{ top: '3%', left: '55%', animationDelay: '2.1s', animationDuration: '3.6s' }} />
            <div className="special-day-comet" style={{ top: '19%', left: '18%', animationDelay: '2.7s', animationDuration: '4.6s' }} />
          </div>
        )}
        {specialDay?.animations.includes('confetti') && (
          <div className="special-day-particles">
            <div className="special-day-confetti" style={{ left: '12%', background: '#ff5fa2', animationDelay: '0s', animationDuration: '2.6s', '--cf-rot': '760deg' } as React.CSSProperties} />
            <div className="special-day-confetti" style={{ left: '28%', background: '#ffd23f', animationDelay: '0.8s', animationDuration: '3.1s', '--cf-rot': '-680deg' } as React.CSSProperties} />
            <div className="special-day-confetti" style={{ left: '44%', background: '#3fd4ff', animationDelay: '0.3s', animationDuration: '2.9s', '--cf-rot': '820deg' } as React.CSSProperties} />
            <div className="special-day-confetti" style={{ left: '60%', background: '#7bffab', animationDelay: '1.4s', animationDuration: '2.7s', '--cf-rot': '-720deg' } as React.CSSProperties} />
            <div className="special-day-confetti" style={{ left: '74%', background: '#c46bff', animationDelay: '0.5s', animationDuration: '3.3s', '--cf-rot': '700deg' } as React.CSSProperties} />
            <div className="special-day-confetti" style={{ left: '88%', background: '#ff9f43', animationDelay: '1.1s', animationDuration: '2.8s', '--cf-rot': '-780deg' } as React.CSSProperties} />
            <div className="special-day-confetti" style={{ left: '36%', background: '#ff5fa2', animationDelay: '1.9s', animationDuration: '3s', '--cf-rot': '640deg' } as React.CSSProperties} />
          </div>
        )}
        {specialDay?.animations.includes('fireworks') && (
          <div className="special-day-particles">
            <div className="special-day-firework" style={{ top: '30%', left: '25%', animationDelay: '0s', animationDuration: '2.4s', '--fw': '#ff4d6d' } as React.CSSProperties} />
            <div className="special-day-firework" style={{ top: '55%', left: '68%', animationDelay: '0.9s', animationDuration: '2.6s', '--fw': '#4dd2ff' } as React.CSSProperties} />
            <div className="special-day-firework" style={{ top: '22%', left: '72%', animationDelay: '1.6s', animationDuration: '2.5s', '--fw': '#ffd23f' } as React.CSSProperties} />
            <div className="special-day-firework" style={{ top: '62%', left: '32%', animationDelay: '2.2s', animationDuration: '2.3s', '--fw': '#b56bff' } as React.CSSProperties} />
            <div className="special-day-firework" style={{ top: '42%', left: '50%', animationDelay: '3s', animationDuration: '2.7s', '--fw': '#5cff9d' } as React.CSSProperties} />
          </div>
        )}
        {specialDay?.animations.includes('petals') && (
          <div className="special-day-particles">
            <div className="special-day-petal" style={{ left: '15%', background: '#ffb7c5', animationDelay: '0s', animationDuration: '4.5s' }} />
            <div className="special-day-petal" style={{ left: '38%', background: '#ff9fb2', animationDelay: '1.3s', animationDuration: '5.2s' }} />
            <div className="special-day-petal" style={{ left: '58%', background: '#ffc8dd', animationDelay: '0.6s', animationDuration: '4.8s' }} />
            <div className="special-day-petal" style={{ left: '78%', background: '#ffb7c5', animationDelay: '2s', animationDuration: '5s' }} />
            <div className="special-day-petal" style={{ left: '48%', background: '#ff8fab', animationDelay: '3.1s', animationDuration: '4.6s' }} />
          </div>
        )}
        {specialDay?.animations.includes('aurora') && (
          <div className="special-day-particles">
            <div className="special-day-aurora" />
          </div>
        )}
        {specialDay?.animations.includes('hearts') && (
          <div className="special-day-particles">
            <svg className="special-day-heart" style={{ left: '18%', width: 12, height: 12, fill: '#ff4d8d', animationDelay: '0s', animationDuration: '4.2s' }} viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.6-9.2C1 8.4 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.4 0 5 3.4 3.6 6.8C19.2 16.4 12 21 12 21z" /></svg>
            <svg className="special-day-heart" style={{ left: '42%', width: 10, height: 10, fill: '#ff85a1', animationDelay: '1.4s', animationDuration: '4.8s' }} viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.6-9.2C1 8.4 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.4 0 5 3.4 3.6 6.8C19.2 16.4 12 21 12 21z" /></svg>
            <svg className="special-day-heart" style={{ left: '66%', width: 13, height: 13, fill: '#c56cff', animationDelay: '0.7s', animationDuration: '4.5s' }} viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.6-9.2C1 8.4 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.4 0 5 3.4 3.6 6.8C19.2 16.4 12 21 12 21z" /></svg>
            <svg className="special-day-heart" style={{ left: '80%', width: 9, height: 9, fill: '#ff6b6b', animationDelay: '2.2s', animationDuration: '4.4s' }} viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.6-9.2C1 8.4 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.4 0 5 3.4 3.6 6.8C19.2 16.4 12 21 12 21z" /></svg>
            <svg className="special-day-heart" style={{ left: '32%', width: 11, height: 11, fill: '#ff4d8d', animationDelay: '3s', animationDuration: '4.6s' }} viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.6-9.2C1 8.4 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.4 0 5 3.4 3.6 6.8C19.2 16.4 12 21 12 21z" /></svg>
          </div>
        )}
        {specialDay?.animations.includes('balloons') && (
          <div className="special-day-particles">
            <div className="special-day-balloon" style={{ left: '16%', animationDelay: '0s', animationDuration: '5s', '--balloon': '#ff5a5a' } as React.CSSProperties} />
            <div className="special-day-balloon" style={{ left: '40%', animationDelay: '1.6s', animationDuration: '5.6s', '--balloon': '#4db1ff' } as React.CSSProperties} />
            <div className="special-day-balloon" style={{ left: '62%', animationDelay: '0.7s', animationDuration: '5.2s', '--balloon': '#ffd23f' } as React.CSSProperties} />
            <div className="special-day-balloon" style={{ left: '80%', animationDelay: '2.4s', animationDuration: '5.4s', '--balloon': '#7bd16b' } as React.CSSProperties} />
            <div className="special-day-balloon" style={{ left: '30%', animationDelay: '3.3s', animationDuration: '5.1s', '--balloon': '#c46bff' } as React.CSSProperties} />
          </div>
        )}
        {specialDay?.animations.includes('leaves') && (
          <div className="special-day-particles">
            <div className="special-day-leaf" style={{ left: '14%', background: '#e8853d', animationDelay: '0s', animationDuration: '5.2s' }} />
            <div className="special-day-leaf" style={{ left: '36%', background: '#c1440e', animationDelay: '1.4s', animationDuration: '5.8s' }} />
            <div className="special-day-leaf" style={{ left: '58%', background: '#e0a92e', animationDelay: '0.6s', animationDuration: '5.4s' }} />
            <div className="special-day-leaf" style={{ left: '78%', background: '#b7410e', animationDelay: '2.1s', animationDuration: '5.6s' }} />
            <div className="special-day-leaf" style={{ left: '48%', background: '#d2691e', animationDelay: '3.2s', animationDuration: '5s' }} />
          </div>
        )}
        {specialDay?.animations.includes('notes') && (
          <div className="special-day-particles">
            <svg className="special-day-note" style={{ left: '18%', width: 16, height: 16, fill: '#ff6b9d', animationDelay: '0s', animationDuration: '4.4s' }} viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
            <svg className="special-day-note" style={{ left: '44%', width: 14, height: 14, fill: '#4db1ff', animationDelay: '1.5s', animationDuration: '4.9s' }} viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
            <svg className="special-day-note" style={{ left: '66%', width: 17, height: 17, fill: '#ffd23f', animationDelay: '0.7s', animationDuration: '4.6s' }} viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
            <svg className="special-day-note" style={{ left: '82%', width: 13, height: 13, fill: '#7bffab', animationDelay: '2.3s', animationDuration: '4.5s' }} viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
            <svg className="special-day-note" style={{ left: '34%', width: 15, height: 15, fill: '#c46bff', animationDelay: '3.1s', animationDuration: '4.7s' }} viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
          </div>
        )}
        {specialDay?.animations.includes('bubbles') && (
          <div className="special-day-particles">
            <div className="special-day-bubble" style={{ left: '18%', width: 9, height: 9, animationDelay: '0s' }} />
            <div className="special-day-bubble" style={{ left: '46%', width: 13, height: 13, animationDelay: '1.1s' }} />
            <div className="special-day-bubble" style={{ left: '70%', width: 8, height: 8, animationDelay: '0.5s' }} />
            <div className="special-day-bubble" style={{ left: '32%', width: 11, height: 11, animationDelay: '2.2s' }} />
            <div className="special-day-bubble" style={{ left: '82%', width: 10, height: 10, animationDelay: '1.6s' }} />
          </div>
        )}
        {(() => {
          const info = weather && weather[cell.date];
          const showWeather =
            weatherAndLocationEnabled && showWeatherIconOnDays && !!info && cell.date >= today && isRainyOrSunny(info.code);
          const showClock = cell.isToday && showClockOnToday;
          if (!showWeather && !showClock) return null;
          const weatherIcon = showWeather && info ? (
            <span
              className="day-weather"
              title={
                `Weather: ${info.description}\n` +
                `Min: ${info.minTemp}°C, Max: ${info.maxTemp}°C` +
                (info.rainChance !== undefined ? `\nRain Probability: ${info.rainChance}%` : '') +
                (info.uvIndex !== undefined ? `\nMax UV Index: ${info.uvIndex}` : '') +
                (info.hourlyUv && info.hourlyUv.length > 0 ? `\nUV (8am-8pm): ` + info.hourlyUv.map(h => `${h.hour.slice(0, 2)}h:${h.value.toFixed(1)}`).join(' | ') : '')
              }
            >
              {info.emoji}
            </span>
          ) : null;
          if (!showClock) return weatherIcon;
          // Today: weather and clock share one corner row so they never overlap,
          // whatever width the clock format renders at.
          return (
            <span className="day-corner">
              {weatherIcon}
              <TodayClock />
            </span>
          );
        })()}
        {habitActive && activeTab && (
          <HabitDayContent tab={activeTab} entry={habitEntries[activeTab.id]?.[cell.date]} />
        )}
        {!habitActive && (expanded ? spans : spans.slice(0, MAX_CHIPS)).map(({ event }) => {
          const end = spanEndDate(event);
          const isStart = cell.date === event.date;
          const isEnd = cell.date === end;
          const dTime = dayTime(event, cell.date);
          const dTitle = dayTitle(event, cell.date);
          const hasOwn = !!dTime || dTitle !== event.title;
          const text = expanded || hasOwn
            ? `${dTime ? `${dTime} ` : ''}${dTitle}`
            : isStart || dayIdx === 0
              ? event.title
              : ' ';
          const look = eventLook(event);
          // The description belongs to the span, so every day of it says the
          // same thing; the per-day title is what changes.
          const hover = eventHoverProps({
            title: dTitle,
            when: dTime || 'All day',
            description: event.description ?? '',
            color: event.color,
          });
          return (
            <button
              key={event.id}
              className={
                'span-seg' +
                (isStart || dayIdx === 0 ? ' span-seg-start' : '') +
                (isEnd || dayIdx === 6 ? ' span-seg-end' : '') +
                (selectionActive && selectedIds.has(event.id) ? ' is-selected' : '') +
                look.suffix
              }
              style={
                event.color
                  ? ({ '--event-color': event.color, '--event-text-color': getContrastColor(event.color) } as React.CSSProperties)
                  : look.style
              }
              onPointerEnter={hover.onPointerEnter}
              onPointerLeave={hover.onPointerLeave}
              onMouseMove={look.isCosmetic ? trackCosmeticPointer : undefined}
              onClick={(e) => {
                e.stopPropagation();
                useUiStore.getState().setHighlightedEvent({ id: event.id, date: cell.date });
                if (selectionActive) {
                  toggleSelection(event.id);
                } else {
                  openSpanDayChooser(event.id, cell.date, e.currentTarget);
                }
              }}
              onContextMenu={(e) =>
                openEventMenu(e, event, cell.date, {
                  start: event.date,
                  end: spanEndDate(event),
                })
              }
              onFocus={(e) => {
                hover.onFocus(e);
                useUiStore.getState().setHighlightedEvent({ id: event.id, date: cell.date });
              }}
              onBlur={(e) => {
                hover.onBlur(e);
                const highlighted = useUiStore.getState().highlightedEvent;
                if (highlighted?.id === event.id && highlighted?.date === cell.date) {
                  useUiStore.getState().setHighlightedEvent(null);
                }
              }}
            >
              {text}
            </button>
          );
        })}
        {!habitActive && (expanded ? chips : chips.slice(0, Math.max(0, MAX_CHIPS - spans.length))).map(({ event, time }) => {
          const look = eventLook(event);
          const hover = eventHoverProps({
            title: event.title,
            when: time || 'All day',
            description: event.description ?? '',
            color: event.color,
          });
          return (
          <div
            key={event.id}
            draggable={!selectionActive}
            onDragStart={(e) => handleDragStart(e, event, cell.date)}
            onPointerEnter={hover.onPointerEnter}
            onPointerLeave={hover.onPointerLeave}
            className={
              'event-chip' +
              (time ? '' : ' event-chip-allday') +
              (selectionActive && selectedIds.has(event.id) ? ' is-selected' : '') +
              look.suffix
            }
            style={
              event.color
                ? ({ '--event-color': event.color, '--event-text-color': getContrastColor(event.color) } as React.CSSProperties)
                : look.style
            }
            onMouseMove={look.isCosmetic ? trackCosmeticPointer : undefined}
            onClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().setHighlightedEvent({ id: event.id, date: cell.date });
              if (selectionActive) {
                toggleSelection(event.id);
              } else {
                openEditor(event.id, e.currentTarget, cell.date);
              }
            }}
            onContextMenu={(e) => openEventMenu(e, event, cell.date)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                useUiStore.getState().setHighlightedEvent({ id: event.id, date: cell.date });
                if (selectionActive) {
                  toggleSelection(event.id);
                } else {
                  openEditor(event.id, e.currentTarget, cell.date);
                }
              }
            }}
            onFocus={(e) => {
              hover.onFocus(e);
              useUiStore.getState().setHighlightedEvent({ id: event.id, date: cell.date });
            }}
            onBlur={(e) => {
              hover.onBlur(e);
              const highlighted = useUiStore.getState().highlightedEvent;
              if (highlighted?.id === event.id && highlighted?.date === cell.date) {
                useUiStore.getState().setHighlightedEvent(null);
              }
            }}
          >
            {time ? <span className="event-time">{time}</span> : null}
            {event.title}
          </div>
          );
        })}
        {!habitActive && !expanded && dayEvents.length > MAX_CHIPS && (
          <button
            type="button"
            className="event-more"
            aria-haspopup="dialog"
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().closeOverlays();
              setSelectedDate(cell.date);
              const tile = e.currentTarget.parentElement!;
              setExpandedDay({ date: cell.date, tile, collapsedHeight: tile.offsetHeight });
            }}
          >+{dayEvents.length - MAX_CHIPS} more</button>
        )}
        {expanded && (
          <div className="expanded-day-actions">
            <button type="button" className="expanded-day-add" onClick={(e) => {
              e.stopPropagation();
              openQuickEntry(cell.date, e.currentTarget);
            }}>Add event</button>
            <button type="button" className="expanded-day-close" aria-label="Close expanded day" title="Collapse day" onClick={(e) => {
              e.stopPropagation();
              closeExpandedDay(true);
            }}>⌃</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`month-grid grid-style-${showGrid ? 'on' : 'off'}`}>
      <DayCustomStyleSheet specialDays={specialDays} />
      <header className="month-header" data-tauri-drag-region>
        <div className="month-header-left" data-tauri-drag-region>
          <SidebarToggle />
          <h1 className="month-title" data-tauri-drag-region>
            {MONTH_NAMES[header.month - 1]} <span className="month-year">{header.year}</span>
          </h1>
        </div>
        <nav className="month-nav">
          {weatherAndLocationEnabled && (
            <button className="month-weather-glance" onClick={handleLocationClick} title="Change location">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 6.5 19z" />
              </svg>
              <span>{locationName}</span>
            </button>
          )}
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
          <ToolbarButton onClick={scrollToToday} disabled={todayVisible}>
            {todayVisible ? 'Showing today' : 'Today'}
          </ToolbarButton>
          <ZoomStepper
            value={tileScale}
            onZoomOut={() => setTileScale(Math.max(0.5, Number((tileScale - 0.05).toFixed(2))))}
            onZoomIn={() => setTileScale(Math.min(1.5, Number((tileScale + 0.05).toFixed(2))))}
            onFit={() => setTileScaleAuto()}
            fitDisabled={tileScaleAuto}
            zoomOutDisabled={tileScale <= 0.5}
            zoomInDisabled={tileScale >= 1.5}
          />
          <div className="month-nav-sep" />
          <AccountMenu />
        </nav>
      </header>
      <HabitTabSwitcher />
      <div className="weekday-row">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div
        className="week-scroll"
        ref={scrollRef}
        onScroll={onScrollThrottled}
        onDragOver={handleDragOver}
        onPointerOver={onGridPointerOver}
        onPointerLeave={onGridPointerLeave}
      >
        {calendarViewMode === 'separate' ? (
          groupedMonths.map((month) => (
            <div key={month.key} className="month-block-container" data-month-block={month.key}>
              <h2 className="month-block-title">
                {MONTH_NAMES[month.month - 1]} <span className="month-block-year">{month.year}</span>
              </h2>
              <div className="month-block">
                <div className="month-block-grid">
                  {month.weeks.map((week) => (
                    <div className="week-row" key={`${month.key}-${week.monday}`} ref={registerWeekRow} style={{ height: WEEK_HEIGHT }}>
                      {week.days.map((cell, dayIdx) =>
                        renderDayCell(cell, dayIdx, cell.monthIndex === month.monthIndex)
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : (
          weeks.map((week) => (
            <div className="week-row" key={week.monday} ref={registerWeekRow} style={{ height: WEEK_HEIGHT }}>
              {week.days.map((cell, dayIdx) =>
                renderDayCell(cell, dayIdx, true)
              )}
            </div>
          ))
        )}
      </div>
      {habitEditor && activeTab && activeTab.kind !== 'check' && (
        <AnchoredPopover anchorEl={habitEditor.anchorEl} onClose={() => setHabitEditor(null)}>
          <HabitEntryEditor
            tab={activeTab}
            date={habitEditor.date}
            value={habitEntries[activeTab.id]?.[habitEditor.date]?.v ?? null}
            onSave={(v) => {
              useHabitEntriesStore.getState().setEntry(activeTab.id, habitEditor.date, v);
              setHabitEditor(null);
            }}
            onClear={() => {
              useHabitEntriesStore.getState().clearEntry(activeTab.id, habitEditor.date);
              setHabitEditor(null);
            }}
            onClose={() => setHabitEditor(null)}
          />
        </AnchoredPopover>
      )}
      {moveChoice && (
        <AnchoredPopover anchorEl={moveChoice.anchorEl} onClose={() => setMoveChoice(null)}>
          <div className="delete-choices-container">
            <div className="delete-choices-title">Move recurring event</div>
            <div className="delete-choices-desc">
              Would you like to move only this occurrence, or all events in the series?
            </div>
            <div className="delete-choices-actions">
              <button
                className="delete-choice-btn tb tb-text"
                onClick={() => {
                  void executeMove(moveChoice.event, moveChoice.originalDate, moveChoice.targetDate, true);
                  setMoveChoice(null);
                }}
              >
                Only this event
              </button>
              <button
                className="delete-choice-btn tb tb-text tb-primary"
                onClick={() => {
                  void executeMove(moveChoice.event, moveChoice.originalDate, moveChoice.targetDate, false);
                  setMoveChoice(null);
                }}
              >
                All events
              </button>
              <button className="delete-choice-cancel tb tb-text" onClick={() => setMoveChoice(null)}>
                Cancel
              </button>
            </div>
          </div>
        </AnchoredPopover>
      )}
      {menu && (
        <ContextMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />
      )}
      <LocationDialog
        isOpen={isLocationDialogOpen}
        onClose={() => setIsLocationDialogOpen(false)}
        currentLocation={locationName}
        onUpdateLocation={updateLocation}
        onDisableLocationAndWeather={() => {
          setWeatherAndLocationEnabled(false);
          setShowWeatherIconOnDays(false);
          setShowHourlyWeather(false);
          setShowUvIndex(false);
        }}
      />
    </div>
  );
}
