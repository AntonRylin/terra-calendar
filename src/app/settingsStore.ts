import { create } from 'zustand';
import type { EventReminder } from '../core/types';
import { DEFAULT_CLOCK_STYLE, normalizeClockStyle, type ClockStyle } from '../core/clockStyle';
import { systemTimeZone } from '../core/timezone';
import { visibleMonths, type MonthLabelMode } from '../features/settings/monthLabels';
import { readSettingsFile, writeSettingsFile, settingsFileAvailable } from '../data/settingsFile';
import { isCloudMode } from '../data/createRepository';
import { pushSettings, pullSettings } from '../data/cloudSettings';
import { collectSettingsExtras, applySettingsExtras } from './settingsExtras';
import { currentLocalProfile, applyImportedProfile } from './profileStore';

const STORAGE_KEY = 'open-calendar.settings';

/** Bump to re-show the first-run tour after a major overhaul (a persisted
 *  `onboardingCompletedVersion` below this is considered "not onboarded"). */
export const ONBOARDING_VERSION = 1;

/** JSON of the last syncable slice pushed to the cloud — skips redundant pushes
 *  (e.g. when only device-local sizing changed). */
let lastPushedSyncable = '';

export type MinimapFilter = 'all' | 'recurring' | 'onetime' | 'none';
export type MinimapMode = 'circle' | 'days';
export type ThemeMode = 'light' | 'dark' | 'system' | 'sand';
export type AccentColor = 'blue' | 'indigo' | 'purple' | 'pink' | 'orange' | 'green' | 'terracotta';

export interface CategoryConfig {
  type: 'color' | 'gradient';
  value: string;
  color1?: string;
  color2?: string;
  /** Animated style id for this category (see core/cosmetics). When set it IS
   *  the category's look: events and the preview render it regardless of
   *  `matchEvents`. Cleared when a plain solid/gradient is picked. */
  cosmetic?: string;
  /** When true, this category's events render with the category's exact
   *  solid/gradient look and follow later category edits (free feature).
   *  Only relevant while no `cosmetic` is set. */
  matchEvents?: boolean;
  /** When true, none of this category's events show on the minimap
   *  (dots and span bands), regardless of the per-event minimap toggle. */
  hideFromMinimap?: boolean;
  /** When true, none of this category's events show in the Upcoming panel
   *  (upcoming, ongoing, and tasks), regardless of the per-event toggle. */
  hideFromUpcoming?: boolean;
  /** Default reminders for this category: automatically added to an event's
   *  own reminders whenever it is assigned this category. Part of the synced
   *  settings blob; the applied reminders live on the events themselves and
   *  sync like any other event reminder (Supabase, CalDAV VALARMs). */
  reminders?: EventReminder[];
}

/** What a habit tab records per day: a checkmark, a free-text note, or a number.
 *  Fixed at creation so stored values never need type migrations. */
export type HabitTabKind = 'check' | 'text' | 'number';

/** A user-defined tracker tab shown in the switcher above the month grid. */
export interface HabitTab {
  id: string;
  name: string;
  /** Icon id into the curated set (see features/habit-tabs/habitIcons). */
  icon: string;
  kind: HabitTabKind;
}

/** Normalize a raw stored record into a current-shape HabitTab, or drop it. */
export function normalizeHabitTab(raw: unknown): HabitTab | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '' || typeof r.name !== 'string') return null;
  const kind: HabitTabKind =
    r.kind === 'text' || r.kind === 'number' ? r.kind : 'check';
  return { id: r.id, name: r.name, icon: typeof r.icon === 'string' ? r.icon : '', kind };
}

/** A user-saved gradient, reusable across categories from the swatch gallery. */
export interface CustomGradient {
  name: string;
  color1: string;
  color2: string;
}

export interface AccentColorPreset {
  id: AccentColor;
  name: string;
  primary: string;
  soft: string;
}

export const ACCENT_COLORS: AccentColorPreset[] = [
  { id: 'blue', name: 'Blue', primary: '#0a84ff', soft: '#eaf3ff' },
  { id: 'indigo', name: 'Indigo', primary: '#5e5ce6', soft: '#f0f0ff' },
  { id: 'purple', name: 'Purple', primary: '#af52de', soft: '#f9effc' },
  { id: 'pink', name: 'Pink', primary: '#ff2d55', soft: '#fff0f3' },
  { id: 'orange', name: 'Orange', primary: '#ff9500', soft: '#fff7ec' },
  { id: 'green', name: 'Green', primary: '#34c759', soft: '#f0fbf2' },
  { id: 'terracotta', name: 'Terracotta', primary: '#cc5a37', soft: '#fbf0ec' },
];

interface PersistedSettings {
  /** Light, dark, or follow the OS setting. */
  theme: ThemeMode;
  /** In the dark theme, tone decorative fills (day-tile styles, event skins,
   *  category gradients, day backgrounds) down so they sit in the dark UI's
   *  luminance range instead of glaring out of it. See ui/skinTone.css.
   *  No effect in the light or sand themes. */
  dimSkinsInDark: boolean;
  monthLabelMode: MonthLabelMode;
  customMonths: number[];
  /** IANA timezone events are displayed in. */
  displayTimeZone: string;
  minimapFilter: MinimapFilter;
  /** Circle (year wheel) or days (a month of numbered days) layout. */
  minimapMode: MinimapMode;
  minimapSize: number;
  /** Clockwise rotation of the whole minimap, in degrees. 0 = January at the top. */
  minimapRotation: number;
  accentColor: string;
  sidebarWidth: number;
  sidebarSplit: number;
  /** When true the whole side panel (upcoming + minimap) is hidden and the
   *  calendar fills the window. Device-local, like the other sizing numbers. */
  sidebarCollapsed: boolean;
  fontScale: number;
  tileScale: number;
  /** When true, the month grid auto-fits tileScale so day tiles stay square for
   *  the current window width. A manual zoom (+/−, reset, Ctrl+wheel) turns this
   *  off; the "reset" control turns it back on. Device-local, like tileScale. */
  tileScaleAuto: boolean;
  categories: Record<string, CategoryConfig>;
  /** User-saved custom gradients shown in the category swatch gallery. */
  customGradients: CustomGradient[];
  showUvIndex: boolean;
  showHourlyWeather: boolean;
  /** Shows the looping "1020 1230 class" demo under the quick-entry box, so a
   *  first-time user discovers the time syntax without being told about it.
   *  Dismissed from the demo itself; re-enabled in Settings → Appearance. */
  showQuickEntryDemo: boolean;
  showWeatherIconOnDays: boolean;
  showClockOnToday: boolean;
  /** The way back to today floating over the week grid. Dismissed from the
   *  button itself; brought back in Settings → Appearance. */
  showWeekTodayButton: boolean;
  /** The week grid points out breathing room between events no longer than
   *  this many minutes; longer openings are just empty grid. Adjusted by
   *  right-clicking a gap marker. */
  weekGapThresholdMin: number;
  /** Look of the live clock on today's tile (format, font, color/gradient). */
  clockStyle: ClockStyle;
  weatherAndLocationEnabled: boolean;
  calendarViewMode: 'continuous' | 'separate' | 'week';
  showGrid: boolean;
  /** Master switch for the habit-tab switcher above the month grid (off by default). */
  habitTabsEnabled: boolean;
  /** User-defined tracker tabs, in switcher order. */
  habitTabs: HabitTab[];
  /** Highest ONBOARDING_VERSION whose first-run tour finished on this device
   *  (0 = never). Device-local: excluded from the cloud slice so every device
   *  gets its own tour. */
  onboardingCompletedVersion: number;
}

/** The out-of-the-box window layout, restored by "Restore default layout"
 *  (Settings → Appearance). Kept in one place so the defaults, the reset
 *  action, and the button's "already default" check can never drift apart. */
export const LAYOUT_DEFAULTS = {
  sidebarWidth: 30,
  sidebarSplit: 65,
  sidebarCollapsed: false,
} as const;

/** Clamp a rotation to the 0–359° range, snapped to whole degrees. */
function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((Math.round(deg) % 360) + 360) % 360;
}

function defaults(): PersistedSettings {
  return {
    theme: 'light',
    dimSkinsInDark: true,
    monthLabelMode: 'all',
    customMonths: [1, 4, 7, 10],
    displayTimeZone: systemTimeZone(),
    minimapFilter: 'all',
    minimapMode: 'circle',
    minimapSize: 100,
    minimapRotation: 0,
    accentColor: '#0a84ff',
    ...LAYOUT_DEFAULTS,
    fontScale: 1.0,
    tileScale: 1.0,
    tileScaleAuto: true,
    categories: {},
    customGradients: [],
    showUvIndex: true,
    showHourlyWeather: true,
    showQuickEntryDemo: true,
    showWeatherIconOnDays: true,
    showClockOnToday: true,
    showWeekTodayButton: true,
    weekGapThresholdMin: 60,
    clockStyle: { ...DEFAULT_CLOCK_STYLE },
    weatherAndLocationEnabled: true,
    calendarViewMode: 'continuous',
    showGrid: true,
    habitTabsEnabled: false,
    habitTabs: [],
    onboardingCompletedVersion: 0,
  };
}

/** Merge a (possibly partial / legacy) persisted blob over the defaults,
 *  applying all migrations. Shared by the synchronous localStorage load and the
 *  async on-disk hydration so both sources normalise identically. */
function mergeSettings(parsed: Partial<PersistedSettings>): PersistedSettings {
  const base = defaults();

  // Migrate 'yearly' filter to 'onetime' if found in older settings
  let filter = parsed.minimapFilter;
  if ((filter as string) === 'yearly') {
    filter = 'onetime';
  }

  // Migrate old enum accent color to hex values
  let accent = parsed.accentColor;
  if (accent) {
    const foundPreset = ACCENT_COLORS.find((c) => c.id === accent);
    if (foundPreset) {
      accent = foundPreset.primary;
    }
  }

  // Migrate old cached defaults to 125
  let size = parsed.minimapSize;
  if (size === undefined || size === 100 || size === 120) {
    size = 125;
  }

  // The warm palette shipped as 'claude' before it was renamed to 'sand'.
  const storedTheme = (parsed.theme as string) === 'claude' ? 'sand' : parsed.theme;

  return {
    theme:
      storedTheme === 'dark' || storedTheme === 'system' || storedTheme === 'sand'
        ? storedTheme
        : base.theme,
    dimSkinsInDark: parsed.dimSkinsInDark ?? base.dimSkinsInDark,
    monthLabelMode: parsed.monthLabelMode ?? base.monthLabelMode,
    customMonths: Array.isArray(parsed.customMonths) ? parsed.customMonths : base.customMonths,
    displayTimeZone: parsed.displayTimeZone ?? base.displayTimeZone,
    minimapFilter: filter ?? base.minimapFilter,
    // The old 'horizontal' timeline is gone; anything unknown falls back to the wheel.
    minimapMode: parsed.minimapMode === 'days' ? 'days' : base.minimapMode,
    minimapSize: size,
    minimapRotation: normalizeRotation(parsed.minimapRotation ?? base.minimapRotation),
    accentColor: accent ?? base.accentColor,
    sidebarWidth: parsed.sidebarWidth ?? base.sidebarWidth,
    sidebarSplit: parsed.sidebarSplit ?? base.sidebarSplit,
    sidebarCollapsed: parsed.sidebarCollapsed ?? base.sidebarCollapsed,
    fontScale: parsed.fontScale ?? base.fontScale,
    tileScale: parsed.tileScale ?? base.tileScale,
    tileScaleAuto: parsed.tileScaleAuto ?? base.tileScaleAuto,
    categories: parsed.categories ?? {},
    customGradients: Array.isArray(parsed.customGradients) ? parsed.customGradients : base.customGradients,
    showUvIndex: parsed.showUvIndex ?? base.showUvIndex,
    showHourlyWeather: parsed.showHourlyWeather ?? base.showHourlyWeather,
    showQuickEntryDemo: parsed.showQuickEntryDemo ?? base.showQuickEntryDemo,
    showWeatherIconOnDays: parsed.showWeatherIconOnDays ?? base.showWeatherIconOnDays,
    showClockOnToday: parsed.showClockOnToday ?? base.showClockOnToday,
    showWeekTodayButton: parsed.showWeekTodayButton ?? base.showWeekTodayButton,
    weekGapThresholdMin:
      typeof parsed.weekGapThresholdMin === 'number' && Number.isFinite(parsed.weekGapThresholdMin)
        ? Math.max(0, Math.min(24 * 60, Math.round(parsed.weekGapThresholdMin)))
        : base.weekGapThresholdMin,
    clockStyle: normalizeClockStyle(parsed.clockStyle),
    weatherAndLocationEnabled: parsed.weatherAndLocationEnabled ?? base.weatherAndLocationEnabled,
    calendarViewMode: parsed.calendarViewMode ?? base.calendarViewMode,
    // Migrate the old 'tiled' | 'clean' grid-style enum: either value showed a
    // visible grid, so existing users keep the grid on; "off" is now opt-in.
    showGrid:
      parsed.showGrid ??
      ((parsed as { calendarGridStyle?: string }).calendarGridStyle != null
        ? true
        : base.showGrid),
    habitTabsEnabled: parsed.habitTabsEnabled ?? base.habitTabsEnabled,
    habitTabs: Array.isArray(parsed.habitTabs)
      ? parsed.habitTabs.map(normalizeHabitTab).filter((t): t is HabitTab => t !== null)
      : base.habitTabs,
    onboardingCompletedVersion:
      typeof parsed.onboardingCompletedVersion === 'number' &&
      Number.isFinite(parsed.onboardingCompletedVersion)
        ? parsed.onboardingCompletedVersion
        : base.onboardingCompletedVersion,
  };
}

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return mergeSettings(JSON.parse(raw) as Partial<PersistedSettings>);
  } catch {
    return defaults();
  }
}

/** The persisted-only slice of the store (drops UI/transient fields + methods),
 *  used for both the localStorage and on-disk mirrors. */
function serialize(s: PersistedSettings): PersistedSettings {
  return {
    theme: s.theme,
    dimSkinsInDark: s.dimSkinsInDark,
    monthLabelMode: s.monthLabelMode,
    customMonths: s.customMonths,
    displayTimeZone: s.displayTimeZone,
    minimapFilter: s.minimapFilter,
    minimapMode: s.minimapMode,
    minimapSize: s.minimapSize,
    minimapRotation: s.minimapRotation,
    accentColor: s.accentColor,
    sidebarWidth: s.sidebarWidth,
    sidebarSplit: s.sidebarSplit,
    sidebarCollapsed: s.sidebarCollapsed,
    fontScale: s.fontScale,
    tileScale: s.tileScale,
    tileScaleAuto: s.tileScaleAuto,
    categories: s.categories,
    customGradients: s.customGradients,
    showUvIndex: s.showUvIndex,
    showHourlyWeather: s.showHourlyWeather,
    showQuickEntryDemo: s.showQuickEntryDemo,
    showWeatherIconOnDays: s.showWeatherIconOnDays,
    showClockOnToday: s.showClockOnToday,
    showWeekTodayButton: s.showWeekTodayButton,
    weekGapThresholdMin: s.weekGapThresholdMin,
    clockStyle: s.clockStyle,
    weatherAndLocationEnabled: s.weatherAndLocationEnabled,
    calendarViewMode: s.calendarViewMode,
    showGrid: s.showGrid,
    habitTabsEnabled: s.habitTabsEnabled,
    habitTabs: s.habitTabs,
    onboardingCompletedVersion: s.onboardingCompletedVersion,
  };
}

/** The settings that sync to the cloud for subscribers — preferences and
 *  categories. The sizing/layout fields (minimapSize, sidebarWidth, sidebarSplit,
 *  sidebarCollapsed, fontScale, tileScale) stay device-local and are deliberately
 *  excluded — a laptop's hidden side panel shouldn't hide it on a big monitor. */
export function syncableSettings(s: PersistedSettings): Partial<PersistedSettings> {
  return {
    theme: s.theme,
    dimSkinsInDark: s.dimSkinsInDark,
    monthLabelMode: s.monthLabelMode,
    customMonths: s.customMonths,
    displayTimeZone: s.displayTimeZone,
    minimapFilter: s.minimapFilter,
    minimapMode: s.minimapMode,
    minimapRotation: s.minimapRotation,
    accentColor: s.accentColor,
    categories: s.categories,
    customGradients: s.customGradients,
    showUvIndex: s.showUvIndex,
    showHourlyWeather: s.showHourlyWeather,
    showQuickEntryDemo: s.showQuickEntryDemo,
    showWeatherIconOnDays: s.showWeatherIconOnDays,
    showClockOnToday: s.showClockOnToday,
    showWeekTodayButton: s.showWeekTodayButton,
    weekGapThresholdMin: s.weekGapThresholdMin,
    clockStyle: s.clockStyle,
    weatherAndLocationEnabled: s.weatherAndLocationEnabled,
    calendarViewMode: s.calendarViewMode,
    showGrid: s.showGrid,
    habitTabsEnabled: s.habitTabsEnabled,
    habitTabs: s.habitTabs,
  };
}

/** Write the persisted slice to both mirrors: localStorage (synchronous working
 *  copy) and the durable on-disk file (desktop only). */
function writeMirrors(s: PersistedSettings): void {
  const json = JSON.stringify(serialize(s));
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // ignore — settings are a convenience, not critical state
  }
  void writeSettingsFile(json);
}

export type SettingsPanel =
  | 'account'
  | 'calendars'
  | 'sharing'
  | 'appearance'
  | 'categories'
  | 'weather'
  | 'habits'
  | 'minimap'
  | 'ai_mcp'
  | 'data';

interface SettingsState extends PersistedSettings {
  /** The open panel, or null when closed (not persisted). */
  panel: SettingsPanel | null;
  /** True once the authoritative settings source has loaded (immediately on
   *  web; after hydrateSettingsFromDisk on desktop). Gates first-run detection
   *  so the tour never flashes before the on-disk flag arrives (not persisted). */
  settingsHydrated: boolean;
  /** Latch the first-run tour as done on this device (idempotent). */
  completeOnboarding(): void;
  /** The dynamically computed maximum fit size for the minimap based on container bounds (not persisted). */
  maxMinimapSize: number;
  setMaxMinimapSize(size: number): void;
  openSettings(panel: SettingsPanel): void;
  closeSettings(): void;
  setTheme(theme: ThemeMode): void;
  setDimSkinsInDark(dim: boolean): void;
  setMonthLabelMode(mode: MonthLabelMode): void;
  toggleCustomMonth(month: number): void;
  setDisplayTimeZone(tz: string): void;
  setMinimapFilter(filter: MinimapFilter): void;
  setMinimapMode(mode: MinimapMode): void;
  setMinimapSize(size: number): void;
  setMinimapRotation(deg: number): void;
  setAccentColor(color: string): void;
  setSidebarWidth(width: number): void;
  setSidebarSplit(split: number): void;
  /** Hide (true) or show (false) the whole side panel. Prefer the
   *  `setSidebarVisible` / `toggleSidebar` helpers in `sidebarVisibility.ts`:
   *  they also tidy up popovers anchored inside the panel. */
  setSidebarCollapsed(collapsed: boolean): void;
  /** Restore the shipped window layout: default splits and a visible side panel. */
  resetLayout(): void;
  setFontScale(scale: number): void;
  /** Manual zoom: sets tileScale and turns off auto-fit. */
  setTileScale(scale: number): void;
  /** Re-enable auto-fit. With a value, also applies it (used by the fit loop);
   *  without one, just flips the flag back on so the grid re-fits to square. */
  setTileScaleAuto(scale?: number): void;
  resetMinimapSettings(): void;
  setCategoryConfig(name: string, config: CategoryConfig): void;
  deleteCategoryConfig(name: string): void;
  renameCategoryConfig(oldName: string, newName: string): void;
  addCustomGradient(g: { color1: string; color2: string }): void;
  deleteCustomGradient(name: string): void;
  setShowUvIndex(show: boolean): void;
  setShowHourlyWeather(show: boolean): void;
  setShowQuickEntryDemo(show: boolean): void;
  setShowWeatherIconOnDays(show: boolean): void;
  setShowClockOnToday(show: boolean): void;
  setShowWeekTodayButton(show: boolean): void;
  setWeekGapThresholdMin(min: number): void;
  /** Merge a partial look change into the today-clock style. */
  setClockStyle(patch: Partial<ClockStyle>): void;
  setWeatherAndLocationEnabled(enabled: boolean): void;
  setCalendarViewMode(mode: 'continuous' | 'separate' | 'week'): void;
  setShowGrid(show: boolean): void;
  setHabitTabsEnabled(enabled: boolean): void;
  setHabitTabs(tabs: HabitTab[]): void;
  /** Create a tab and return its id (kind is fixed for the tab's lifetime). */
  addHabitTab(tab: { name: string; icon: string; kind: HabitTabKind }): string;
  renameHabitTab(id: string, name: string): void;
  setHabitTabIcon(id: string, icon: string): void;
  /** Removes the tab definition only — the caller is responsible for clearing
   *  its recorded entries (habitEntriesStore.deleteTabEntries). */
  deleteHabitTab(id: string): void;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Mirror to localStorage (synchronous working copy) AND a durable on-disk file
  // (desktop only) so category cosmetics survive a WebView reset / reinstall.
  function persist() {
    writeMirrors(get());
    // Subscribers also mirror the syncable slice to the cloud. Skip when only a
    // device-local field changed (the slice is identical to the last push).
    if (isCloudMode()) {
      const slice = syncableSettings(get());
      const json = JSON.stringify(slice);
      if (json !== lastPushedSyncable) {
        lastPushedSyncable = json;
        void pushSettings(slice as Record<string, unknown>);
      }
    }
  }

  return {
    ...load(),
    panel: null,
    settingsHydrated: !settingsFileAvailable(),
    completeOnboarding: () => {
      if (get().onboardingCompletedVersion >= ONBOARDING_VERSION) return;
      set({ onboardingCompletedVersion: ONBOARDING_VERSION });
      persist();
    },
    maxMinimapSize: 150,
    setMaxMinimapSize: (maxMinimapSize) => set({ maxMinimapSize }),
    openSettings: (panel) => set({ panel }),
    closeSettings: () => set({ panel: null }),
    setTheme: (theme) => {
      const updates: Partial<PersistedSettings> = { theme };
      if (theme === 'sand' && get().accentColor === '#0a84ff') {
        updates.accentColor = '#cc5a37';
      } else if (theme !== 'sand' && get().accentColor === '#cc5a37') {
        updates.accentColor = '#0a84ff';
      }
      set(updates);
      persist();
    },
    setDimSkinsInDark: (dimSkinsInDark) => {
      set({ dimSkinsInDark });
      persist();
    },
    setMonthLabelMode: (mode) => {
      if (mode === 'custom') {
        // Seed custom with whatever is currently shown so switching keeps the
        // same months checked (then they become editable).
        set({ monthLabelMode: 'custom', customMonths: visibleMonths(get().monthLabelMode, get().customMonths) });
      } else {
        set({ monthLabelMode: mode });
      }
      persist();
    },
    toggleCustomMonth: (month) => {
      const current = get().customMonths;
      const next = current.includes(month)
        ? current.filter((m) => m !== month)
        : [...current, month].sort((a, b) => a - b);
      set({ customMonths: next });
      persist();
    },
    setDisplayTimeZone: (tz) => {
      set({ displayTimeZone: tz });
      persist();
    },
    setMinimapFilter: (filter) => {
      set({ minimapFilter: filter });
      persist();
    },
    setMinimapMode: (minimapMode) => {
      set({ minimapMode });
      persist();
    },
    setMinimapSize: (size) => {
      set({ minimapSize: size });
      persist();
    },
    setMinimapRotation: (deg) => {
      set({ minimapRotation: normalizeRotation(deg) });
      persist();
    },
    setAccentColor: (accentColor) => {
      set({ accentColor });
      persist();
    },
    setSidebarWidth: (sidebarWidth) => {
      set({ sidebarWidth });
      persist();
    },
    setSidebarSplit: (sidebarSplit) => {
      set({ sidebarSplit });
      persist();
    },
    setSidebarCollapsed: (sidebarCollapsed) => {
      set({ sidebarCollapsed });
      persist();
    },
    resetLayout: () => {
      set({ ...LAYOUT_DEFAULTS });
      persist();
    },
    setFontScale: (fontScale) => {
      set({ fontScale });
      persist();
    },
    setTileScale: (tileScale) => {
      set({ tileScale, tileScaleAuto: false });
      persist();
    },
    setTileScaleAuto: (tileScale) => {
      set(tileScale === undefined ? { tileScaleAuto: true } : { tileScale, tileScaleAuto: true });
      persist();
    },
    resetMinimapSettings: () => {
      set({
        monthLabelMode: 'all',
        customMonths: [1, 4, 7, 10],
        minimapFilter: 'all',
        minimapMode: 'circle',
        minimapSize: 100,
        minimapRotation: 0,
      });
      persist();
    },
    setCategoryConfig: (name, config) => {
      const categories = { ...get().categories, [name]: config };
      set({ categories });
      persist();
    },
    deleteCategoryConfig: (name) => {
      const categories = { ...get().categories };
      delete categories[name];
      set({ categories });
      persist();
    },
    addCustomGradient: ({ color1, color2 }) => {
      const existing = get().customGradients;
      const used = new Set(existing.map((g) => g.name));
      let n = existing.length + 1;
      while (used.has(`Custom ${n}`)) n++;
      set({ customGradients: [...existing, { name: `Custom ${n}`, color1, color2 }] });
      persist();
    },
    deleteCustomGradient: (name) => {
      set({ customGradients: get().customGradients.filter((g) => g.name !== name) });
      persist();
    },
    renameCategoryConfig: (oldName, newName) => {
      const categories = { ...get().categories };
      if (categories[oldName]) {
        categories[newName] = categories[oldName];
        delete categories[oldName];
        set({ categories });
        persist();
      }
    },
    setShowUvIndex: (showUvIndex) => {
      set({ showUvIndex });
      persist();
    },
    setShowHourlyWeather: (showHourlyWeather) => {
      set({ showHourlyWeather });
      persist();
    },
    setShowQuickEntryDemo: (showQuickEntryDemo) => {
      set({ showQuickEntryDemo });
      persist();
    },
    setShowWeatherIconOnDays: (showWeatherIconOnDays) => {
      set({ showWeatherIconOnDays });
      persist();
    },
    setShowClockOnToday: (showClockOnToday) => {
      set({ showClockOnToday });
      persist();
    },
    setShowWeekTodayButton: (showWeekTodayButton) => {
      set({ showWeekTodayButton });
      persist();
    },
    setWeekGapThresholdMin: (min) => {
      set({ weekGapThresholdMin: Math.max(0, Math.min(24 * 60, Math.round(min))) });
      persist();
    },
    setClockStyle: (patch) => {
      set({ clockStyle: { ...get().clockStyle, ...patch } });
      persist();
    },
    setWeatherAndLocationEnabled: (weatherAndLocationEnabled) => {
      set({ weatherAndLocationEnabled });
      persist();
    },
    setCalendarViewMode: (calendarViewMode) => {
      set({ calendarViewMode });
      persist();
    },
    setShowGrid: (showGrid) => {
      set({ showGrid });
      persist();
    },
    setHabitTabsEnabled: (habitTabsEnabled) => {
      set({ habitTabsEnabled });
      persist();
    },
    setHabitTabs: (habitTabs) => {
      set({ habitTabs });
      persist();
    },
    addHabitTab: ({ name, icon, kind }) => {
      const id = crypto.randomUUID();
      set({ habitTabs: [...get().habitTabs, { id, name, icon, kind }] });
      persist();
      return id;
    },
    renameHabitTab: (id, name) => {
      set({ habitTabs: get().habitTabs.map((t) => (t.id === id ? { ...t, name } : t)) });
      persist();
    },
    setHabitTabIcon: (id, icon) => {
      set({ habitTabs: get().habitTabs.map((t) => (t.id === id ? { ...t, icon } : t)) });
      persist();
    },
    deleteHabitTab: (id) => {
      set({ habitTabs: get().habitTabs.filter((t) => t.id !== id) });
      persist();
    },
  };
});

/**
 * Hydrate the store from the durable on-disk settings file (desktop only),
 * making disk the source of truth so a fresh WebView profile (empty
 * localStorage) recovers the user's category cosmetics after a reinstall.
 * If no file exists yet — first launch on this version — seed it from whatever
 * is currently in the store, migrating existing localStorage settings to disk.
 * Safe no-op on the web build. Call once at app startup.
 */
export async function hydrateSettingsFromDisk(): Promise<void> {
  if (!settingsFileAvailable()) return;
  try {
    const text = await readSettingsFile();
    if (text) {
      try {
        const merged = mergeSettings(JSON.parse(text) as Partial<PersistedSettings>);
        useSettingsStore.setState(merged);
        // Keep the localStorage mirror in step so the next synchronous load matches.
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(merged)));
        } catch {
          // ignore — disk is now authoritative regardless
        }
      } catch {
        // Malformed disk file → keep the localStorage-derived state as-is.
      }
    } else {
      // No file yet: migrate current settings (likely from localStorage) onto disk.
      await writeSettingsFile(JSON.stringify(serialize(useSettingsStore.getState())));
    }
  } finally {
    // Whatever happened, the authoritative source has now been consulted —
    // first-run detection (onboarding) may proceed.
    useSettingsStore.setState({ settingsHydrated: true });
  }
}

/**
 * Pull the subscriber's cloud settings and apply the synced fields over the
 * current state (device-local sizing is kept). An empty cloud row is seeded from
 * the current local settings. No-op outside cloud mode. Call on cloud activation.
 */
export async function hydrateSettingsFromCloud(): Promise<void> {
  if (!isCloudMode()) return;
  const data = await pullSettings();
  if (data) {
    const current = serialize(useSettingsStore.getState());
    // Normalise the cloud blob through the migrator, then take only its synced
    // fields and lay them over the current settings (keeps device-local values).
    const incoming = syncableSettings(mergeSettings(data as Partial<PersistedSettings>));
    const merged = { ...current, ...incoming };
    useSettingsStore.setState(merged);
    writeMirrors(merged);
    lastPushedSyncable = JSON.stringify(syncableSettings(merged));
  } else {
    const slice = syncableSettings(useSettingsStore.getState());
    lastPushedSyncable = JSON.stringify(slice);
    await pushSettings(slice as Record<string, unknown>);
  }
}

/** Marker + version wrapping an exported settings file, so import can recognise
 *  and (in future) migrate the format.
 *
 *  v1 — `{ kind, version, settings }` only.
 *  v2 — adds `profile` (local name + avatar) and `extras` (the preferences that
 *       live outside this store; see ./settingsExtras). v1 files still import:
 *       the new sections are simply absent. */
const EXPORT_KIND = 'open-calendar-settings';
const EXPORT_VERSION = 2;

/**
 * A portable JSON snapshot of everything the user has configured — the settings
 * store (categories, cosmetics, layout, clock, habit tabs…), the local profile,
 * and the out-of-store preferences (Upcoming panel display, weather location,
 * saved style templates). Pretty-printed so it's human-readable / hand-editable.
 *
 * Events, tasks, habit entries and calendar-account credentials are not part of
 * a settings backup — see ./settingsExtras for the full rationale.
 */
export function exportSettings(): string {
  return JSON.stringify(
    {
      kind: EXPORT_KIND,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: serialize(useSettingsStore.getState()),
      profile: currentLocalProfile(),
      extras: collectSettingsExtras(),
    },
    null,
    2,
  );
}

export type ImportResult =
  /** `restartNeeded` marks preferences that their owner only reads at mount
   *  (Upcoming panel, weather location) — everything else applied live. */
  | { ok: true; restartNeeded?: true }
  | { ok: false; error: string };

/** Apply a settings snapshot produced by {@link exportSettings}. Accepts the
 *  wrapped form (v1 or v2) or a bare settings object (e.g. a raw localStorage
 *  value), runs it through the same migrations as a normal load, and persists to
 *  both mirrors. Returns a result rather than throwing so the UI can toast
 *  cleanly. */
export function importSettings(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'the file is not valid JSON' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'the file is not an Terra Calendar settings file' };
  }
  const d = data as Record<string, unknown>;
  let raw: Partial<PersistedSettings> | undefined;
  const wrapped = d.kind === EXPORT_KIND && d.settings && typeof d.settings === 'object';
  if (wrapped) {
    raw = d.settings as Partial<PersistedSettings>;
  } else if ('categories' in d || 'theme' in d || 'accentColor' in d) {
    // Lenient: accept a bare settings blob too.
    raw = d as Partial<PersistedSettings>;
  }
  if (!raw) {
    return { ok: false, error: 'the file is not an Terra Calendar settings file' };
  }
  const merged = mergeSettings(raw);
  useSettingsStore.setState(merged);
  writeMirrors(merged);
  // v2 sections. Applied only from a wrapped file — a bare settings blob has no
  // business carrying them.
  let restartNeeded = false;
  if (wrapped) {
    if (d.profile) applyImportedProfile(d.profile);
    restartNeeded = applySettingsExtras(d.extras);
  }
  return restartNeeded ? { ok: true, restartNeeded: true } : { ok: true };
}

export function getCategoryStyle(config?: CategoryConfig): Record<string, string> {
  if (!config) {
    return {
      background: 'none',
      color: 'inherit',
      WebkitTextFillColor: 'initial',
      WebkitBackgroundClip: 'initial',
      backgroundClip: 'initial',
      animation: 'none',
    };
  }
  if (config.type === 'color') {
    return {
      background: 'none',
      color: config.value,
      WebkitTextFillColor: 'initial',
      WebkitBackgroundClip: 'initial',
      backgroundClip: 'initial',
      animation: 'none',
    };
  } else {
    return {
      backgroundImage: config.value,
      backgroundColor: 'transparent',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    };
  }
}
