import {
  useSettingsStore,
  getCategoryStyle,
  exportSettings,
  importSettings,
  syncableSettings,
  LAYOUT_DEFAULTS,
  ONBOARDING_VERSION,
} from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset Zustand store state to defaults
    useSettingsStore.setState({
      theme: 'light',
      monthLabelMode: 'quarters',
      customMonths: [1, 4, 7, 10],
      displayTimeZone: 'UTC',
      minimapFilter: 'all',
      minimapSize: 100,
      minimapRotation: 0,
      sidebarWidth: 30,
      sidebarSplit: 65,
      fontScale: 1.0,
      tileScale: 1.0,
      panel: null,
      categories: {},
      showUvIndex: true,
      showHourlyWeather: true,
      showQuickEntryDemo: true,
      showWeatherIconOnDays: true,
      showClockOnToday: true,
    });
  });

  it('has correct defaults', () => {
    const state = useSettingsStore.getState();
    expect(state.minimapSize).toBe(100);
    expect(state.minimapFilter).toBe('all');
    expect(state.categories).toEqual({});
    expect(state.showUvIndex).toBe(true);
    expect(state.showHourlyWeather).toBe(true);
    expect(state.showQuickEntryDemo).toBe(true);
    expect(state.showWeatherIconOnDays).toBe(true);
    expect(state.showClockOnToday).toBe(true);
    expect(state.showGrid).toBe(true);
  });

  it('defaults theme to light and updates/persists setTheme', () => {
    expect(useSettingsStore.getState().theme).toBe('light');

    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');

    let parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.theme).toBe('dark');

    useSettingsStore.getState().setTheme('system');
    parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.theme).toBe('system');
  });

  it('toggles default accent color when switching to/from Sand theme', () => {
    // Start on light theme with default blue accent
    useSettingsStore.setState({ theme: 'light', accentColor: '#0a84ff' });

    // Switch to sand theme
    useSettingsStore.getState().setTheme('sand');
    expect(useSettingsStore.getState().theme).toBe('sand');
    expect(useSettingsStore.getState().accentColor).toBe('#cc5a37'); // terracotta

    // Switch back to light theme
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(useSettingsStore.getState().accentColor).toBe('#0a84ff'); // blue

    // If user has a custom non-default accent (e.g. green) and switches to sand,
    // it should NOT change the accent color.
    useSettingsStore.setState({ theme: 'light', accentColor: '#34c759' });
    useSettingsStore.getState().setTheme('sand');
    expect(useSettingsStore.getState().theme).toBe('sand');
    expect(useSettingsStore.getState().accentColor).toBe('#34c759'); // unchanged
  });

  it('updates and persists showUvIndex and showHourlyWeather', () => {
    const state = useSettingsStore.getState();
    state.setShowUvIndex(false);
    state.setShowHourlyWeather(false);
    state.setShowWeatherIconOnDays(false);
    state.setShowClockOnToday(false);
    state.setShowGrid(false);
    state.setShowQuickEntryDemo(false);
    expect(useSettingsStore.getState().showUvIndex).toBe(false);
    expect(useSettingsStore.getState().showQuickEntryDemo).toBe(false);
    expect(useSettingsStore.getState().showHourlyWeather).toBe(false);
    expect(useSettingsStore.getState().showWeatherIconOnDays).toBe(false);
    expect(useSettingsStore.getState().showClockOnToday).toBe(false);
    expect(useSettingsStore.getState().showGrid).toBe(false);

    // Verify it was persisted to localStorage
    const raw = localStorage.getItem('open-calendar.settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.showUvIndex).toBe(false);
    expect(parsed.showHourlyWeather).toBe(false);
    expect(parsed.showWeatherIconOnDays).toBe(false);
    expect(parsed.showClockOnToday).toBe(false);
    expect(parsed.showGrid).toBe(false);
    expect(parsed.showQuickEntryDemo).toBe(false);
  });

  it('updates and persists minimapSize', () => {
    const state = useSettingsStore.getState();
    state.setMinimapSize(140);
    expect(useSettingsStore.getState().minimapSize).toBe(140);

    // Verify it was persisted to localStorage
    const raw = localStorage.getItem('open-calendar.settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.minimapSize).toBe(140);
  });

  it('updates, normalizes, and persists minimapRotation', () => {
    const state = useSettingsStore.getState();
    state.setMinimapRotation(90);
    expect(useSettingsStore.getState().minimapRotation).toBe(90);

    // Wraps values outside 0–359 back into range.
    state.setMinimapRotation(370);
    expect(useSettingsStore.getState().minimapRotation).toBe(10);
    state.setMinimapRotation(-30);
    expect(useSettingsStore.getState().minimapRotation).toBe(330);

    const parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.minimapRotation).toBe(330);
  });

  it('sets, persists, and deletes category configuration', () => {
    const state = useSettingsStore.getState();
    state.setCategoryConfig('Work', {
      type: 'color',
      value: '#ff0000',
      color1: '#ff0000',
    });

    expect(useSettingsStore.getState().categories['Work']).toEqual({
      type: 'color',
      value: '#ff0000',
      color1: '#ff0000',
    });

    // Verify persistence
    let raw = localStorage.getItem('open-calendar.settings');
    let parsed = JSON.parse(raw!);
    expect(parsed.categories['Work']).toEqual({
      type: 'color',
      value: '#ff0000',
      color1: '#ff0000',
    });

    // Delete configuration
    useSettingsStore.getState().deleteCategoryConfig('Work');
    expect(useSettingsStore.getState().categories['Work']).toBeUndefined();

    raw = localStorage.getItem('open-calendar.settings');
    parsed = JSON.parse(raw!);
    expect(parsed.categories['Work']).toBeUndefined();
  });

  it('computes correct category styles', () => {
    expect(getCategoryStyle(undefined)).toEqual({
      background: 'none',
      color: 'inherit',
      WebkitTextFillColor: 'initial',
      WebkitBackgroundClip: 'initial',
      backgroundClip: 'initial',
      animation: 'none',
    });

    // Solid Color style
    const colorStyle = getCategoryStyle({
      type: 'color',
      value: '#ff3b30',
      color1: '#ff3b30',
    });
    expect(colorStyle.color).toBe('#ff3b30');
    expect(colorStyle.background).toBe('none');
    expect(colorStyle.animation).toBe('none');

    // Gradient style
    const gradientStyle = getCategoryStyle({
      type: 'gradient',
      value: 'linear-gradient(90deg, #6366f1, #ec4899, #6366f1)',
      color1: '#6366f1',
      color2: '#ec4899',
    });
    expect(gradientStyle.backgroundImage).toBe('linear-gradient(90deg, #6366f1, #ec4899, #6366f1)');
    expect(gradientStyle.backgroundColor).toBe('transparent');
    expect(gradientStyle.color).toBe('transparent');
  });
});

describe('custom gradients', () => {
  it('adds custom gradients with auto names and deletes by name', () => {
    const before = useSettingsStore.getState().customGradients.length;
    useSettingsStore.getState().addCustomGradient({ color1: '#22d3ee', color2: '#818cf8' });
    const list = useSettingsStore.getState().customGradients;
    expect(list).toHaveLength(before + 1);
    expect(list[list.length - 1]).toMatchObject({ color1: '#22d3ee', color2: '#818cf8' });
    expect(list[list.length - 1].name).toMatch(/^Custom \d+$/);
    const name = list[list.length - 1].name;
    useSettingsStore.getState().deleteCustomGradient(name);
    expect(useSettingsStore.getState().customGradients.find((g) => g.name === name)).toBeUndefined();
  });

  it('auto-names past deleted gradients without duplicating', () => {
    useSettingsStore.setState({ customGradients: [{ name: 'Custom 2', color1: '#000000', color2: '#ffffff' }] });
    useSettingsStore.getState().addCustomGradient({ color1: '#111111', color2: '#222222' });
    const names = useSettingsStore.getState().customGradients.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('settingsStore panel routing', () => {
  it('opens and closes settings sections', () => {
    useSettingsStore.getState().openSettings('account');
    expect(useSettingsStore.getState().panel).toBe('account');
    useSettingsStore.getState().openSettings('minimap');
    expect(useSettingsStore.getState().panel).toBe('minimap');
    useSettingsStore.getState().closeSettings();
    expect(useSettingsStore.getState().panel).toBeNull();
  });
});

describe('settingsStore onboarding flag', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ onboardingCompletedVersion: 0 });
  });

  it('defaults to 0 (never onboarded)', () => {
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(0);
  });

  it('completeOnboarding latches the current version and persists it', () => {
    useSettingsStore.getState().completeOnboarding();
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
    const parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
    // Idempotent
    useSettingsStore.getState().completeOnboarding();
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('round-trips through export/import and rejects junk values', () => {
    useSettingsStore.getState().completeOnboarding();
    const exported = exportSettings();
    useSettingsStore.setState({ onboardingCompletedVersion: 0 });
    expect(importSettings(exported)).toEqual({ ok: true });
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);

    // A non-numeric persisted value falls back to 0 through the migrator.
    expect(importSettings(JSON.stringify({ theme: 'dark', onboardingCompletedVersion: 'yes' }))).toEqual({ ok: true });
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(0);
  });

  it('is excluded from the cloud-synced slice (device-local)', () => {
    const slice = syncableSettings(useSettingsStore.getState());
    expect('onboardingCompletedVersion' in slice).toBe(false);
  });
});

describe('settingsStore dark-mode skin dimming', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ dimSkinsInDark: true });
  });

  it('tones decorative fills down by default', () => {
    expect(useSettingsStore.getState().dimSkinsInDark).toBe(true);
  });

  it('persists the opt-out', () => {
    useSettingsStore.getState().setDimSkinsInDark(false);
    expect(useSettingsStore.getState().dimSkinsInDark).toBe(false);

    const stored = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(stored.dimSkinsInDark).toBe(false);
  });

  it('syncs to the cloud with the other look preferences', () => {
    useSettingsStore.getState().setDimSkinsInDark(false);
    const slice = syncableSettings(useSettingsStore.getState());
    expect(slice.dimSkinsInDark).toBe(false);
  });

  it('turns on for settings saved before the toning existed', () => {
    // Existing users get the fix by default; the opt-out is theirs to make.
    expect(importSettings(JSON.stringify({ theme: 'dark' }))).toEqual({ ok: true });
    expect(useSettingsStore.getState().dimSkinsInDark).toBe(true);
  });

  it('keeps an explicit opt-out through export/import', () => {
    useSettingsStore.getState().setDimSkinsInDark(false);
    const exported = exportSettings();
    useSettingsStore.setState({ dimSkinsInDark: true });

    expect(importSettings(exported)).toEqual({ ok: true });
    expect(useSettingsStore.getState().dimSkinsInDark).toBe(false);
  });
});

describe('settingsStore window layout', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ ...LAYOUT_DEFAULTS });
  });

  it('starts with the side panel showing at the default splits', () => {
    const state = useSettingsStore.getState();
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.sidebarWidth).toBe(30);
    expect(state.sidebarSplit).toBe(65);
  });

  it('persists a collapsed side panel across reloads', () => {
    useSettingsStore.getState().setSidebarCollapsed(true);
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);

    const stored = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(stored.sidebarCollapsed).toBe(true);
  });

  it('restores the default layout, splits and visibility alike', () => {
    useSettingsStore.getState().setSidebarWidth(48);
    useSettingsStore.getState().setSidebarSplit(22);
    useSettingsStore.getState().setSidebarCollapsed(true);

    useSettingsStore.getState().resetLayout();

    const state = useSettingsStore.getState();
    expect(state.sidebarWidth).toBe(LAYOUT_DEFAULTS.sidebarWidth);
    expect(state.sidebarSplit).toBe(LAYOUT_DEFAULTS.sidebarSplit);
    expect(state.sidebarCollapsed).toBe(false);

    const stored = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(stored.sidebarCollapsed).toBe(false);
    expect(stored.sidebarWidth).toBe(LAYOUT_DEFAULTS.sidebarWidth);
  });

  it('keeps the panel hidden on this device only (not cloud-synced)', () => {
    useSettingsStore.getState().setSidebarCollapsed(true);
    const slice = syncableSettings(useSettingsStore.getState());
    expect('sidebarCollapsed' in slice).toBe(false);
  });

  it('defaults sidebarCollapsed to false for settings saved before the toggle', () => {
    expect(importSettings(JSON.stringify({ theme: 'dark', sidebarWidth: 40 }))).toEqual({ ok: true });
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
    expect(useSettingsStore.getState().sidebarWidth).toBe(40);
  });
});

describe('settingsStore habit tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ habitTabsEnabled: false, habitTabs: [] });
  });

  it('is disabled with no tabs by default', () => {
    expect(useSettingsStore.getState().habitTabsEnabled).toBe(false);
    expect(useSettingsStore.getState().habitTabs).toEqual([]);
  });

  it('toggles and persists habitTabsEnabled', () => {
    useSettingsStore.getState().setHabitTabsEnabled(true);
    expect(useSettingsStore.getState().habitTabsEnabled).toBe(true);
    const parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.habitTabsEnabled).toBe(true);
  });

  it('adds, renames, re-icons, and deletes tabs, persisting each change', () => {
    const id = useSettingsStore.getState().addHabitTab({ name: 'Gym', icon: 'dumbbell', kind: 'check' });
    expect(useSettingsStore.getState().habitTabs).toEqual([{ id, name: 'Gym', icon: 'dumbbell', kind: 'check' }]);

    useSettingsStore.getState().renameHabitTab(id, 'Workout');
    useSettingsStore.getState().setHabitTabIcon(id, 'flame');
    expect(useSettingsStore.getState().habitTabs[0]).toEqual({ id, name: 'Workout', icon: 'flame', kind: 'check' });

    const parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.habitTabs[0]).toEqual({ id, name: 'Workout', icon: 'flame', kind: 'check' });

    useSettingsStore.getState().deleteHabitTab(id);
    expect(useSettingsStore.getState().habitTabs).toEqual([]);
  });

  it('keeps switcher order when adding multiple tabs', () => {
    const a = useSettingsStore.getState().addHabitTab({ name: 'Money', icon: 'dollar', kind: 'number' });
    const b = useSettingsStore.getState().addHabitTab({ name: 'Diary', icon: 'pen', kind: 'text' });
    expect(useSettingsStore.getState().habitTabs.map((t) => t.id)).toEqual([a, b]);
  });

  it('sets and persists habitTabs directly', () => {
    const customTabs = [{ id: 'tab-10', name: 'Reading', icon: 'book', kind: 'check' as const }];
    useSettingsStore.getState().setHabitTabs(customTabs);
    expect(useSettingsStore.getState().habitTabs).toEqual(customTabs);
    const parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.habitTabs).toEqual(customTabs);
  });

  it('round-trips through export/import and drops malformed tabs', () => {
    const id = useSettingsStore.getState().addHabitTab({ name: 'Gym', icon: 'dumbbell', kind: 'check' });
    useSettingsStore.getState().setHabitTabsEnabled(true);
    const exported = exportSettings();
    useSettingsStore.setState({ habitTabsEnabled: false, habitTabs: [] });
    expect(importSettings(exported)).toEqual({ ok: true });
    expect(useSettingsStore.getState().habitTabsEnabled).toBe(true);
    expect(useSettingsStore.getState().habitTabs).toEqual([{ id, name: 'Gym', icon: 'dumbbell', kind: 'check' }]);

    // Malformed entries (no id/name, bad kind) are dropped or coerced.
    expect(
      importSettings(
        JSON.stringify({
          theme: 'dark',
          habitTabs: [{ id: 't1', name: 'Ok', icon: 3, kind: 'weird' }, { name: 'NoId' }, 'junk', null],
        }),
      ),
    ).toEqual({ ok: true });
    expect(useSettingsStore.getState().habitTabs).toEqual([{ id: 't1', name: 'Ok', icon: '', kind: 'check' }]);
  });

  it('is included in the cloud-synced slice', () => {
    const slice = syncableSettings(useSettingsStore.getState());
    expect('habitTabsEnabled' in slice).toBe(true);
    expect('habitTabs' in slice).toBe(true);
  });
});

describe('settingsStore today-clock style', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ clockStyle: { format: '24h', showSeconds: true, font: 'mono', color: '' } });
  });

  it('merges partial patches and persists the whole style', () => {
    useSettingsStore.getState().setClockStyle({ format: '12h-ampm', color: '#ff2d55' });
    expect(useSettingsStore.getState().clockStyle).toEqual({
      format: '12h-ampm',
      showSeconds: true,
      font: 'mono',
      color: '#ff2d55',
    });
    const parsed = JSON.parse(localStorage.getItem('open-calendar.settings')!);
    expect(parsed.clockStyle).toEqual({ format: '12h-ampm', showSeconds: true, font: 'mono', color: '#ff2d55' });
  });

  it('round-trips through export/import and normalizes junk fields', () => {
    useSettingsStore.getState().setClockStyle({
      font: 'serif',
      color: 'linear-gradient(90deg, #ff9500, #ff2d55)',
    });
    const exported = exportSettings();
    useSettingsStore.setState({ clockStyle: { format: '24h', showSeconds: true, font: 'mono', color: '' } });
    expect(importSettings(exported)).toEqual({ ok: true });
    expect(useSettingsStore.getState().clockStyle).toEqual({
      format: '24h',
      showSeconds: true,
      font: 'serif',
      color: 'linear-gradient(90deg, #ff9500, #ff2d55)',
    });

    expect(
      importSettings(JSON.stringify({ theme: 'dark', clockStyle: { format: 'metric', font: 'papyrus', color: 'red' } })),
    ).toEqual({ ok: true });
    expect(useSettingsStore.getState().clockStyle).toEqual({
      format: '24h',
      showSeconds: true,
      font: 'mono',
      color: '',
    });
  });

  it('is included in the cloud-synced slice', () => {
    const slice = syncableSettings(useSettingsStore.getState());
    expect('clockStyle' in slice).toBe(true);
  });
});

describe('settingsStore theme persistence', () => {
  it('keeps the sand theme through a persisted round-trip (regression)', () => {
    expect(importSettings(JSON.stringify({ theme: 'sand' }))).toEqual({ ok: true });
    expect(useSettingsStore.getState().theme).toBe('sand');
  });

  it('migrates the legacy claude theme id to sand', () => {
    expect(importSettings(JSON.stringify({ theme: 'claude' }))).toEqual({ ok: true });
    expect(useSettingsStore.getState().theme).toBe('sand');
  });

  it('falls back to light for unknown theme values', () => {
    expect(importSettings(JSON.stringify({ theme: 'neon' }))).toEqual({ ok: true });
    expect(useSettingsStore.getState().theme).toBe('light');
  });
});
