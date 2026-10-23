import { useEffect, useState, useMemo, useRef } from 'react';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore, ACCENT_COLORS, LAYOUT_DEFAULTS, getCategoryStyle, exportSettings, importSettings, type MinimapMode, type SettingsPanel } from '../../app/settingsStore';
import { SIDEBAR_SHORTCUT_LABEL, setSidebarVisible } from '../../app/sidebarVisibility';
import { useConnectionStore } from '../../app/connectionStore';
import type { CalDavConfig } from '../../data/caldav/types';
import { MONTH_LABEL_OPTIONS, MONTH_SHORT, visibleMonths, type MonthLabelMode } from './monthLabels';
import { PaletteSelector } from '../../ui/PaletteSelector';
import { CategoryEditor } from '../category-editor/CategoryEditor';
import { HabitTabsSection } from './HabitTabsSection';
import { ClockSection } from './ClockSection';
import { DeleteAllDataSection } from './DeleteAllData';
import { confirmDialog } from '../../ui/confirmStore';
import { isSupabaseConfigured } from '../../data/supabaseClient';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../../app/profileStore';
import { effectiveIdentity, initials } from '../../app/identity';
import { avatarFromFile } from '../account/avatarImage';
import { uploadAvatar, deleteAvatar } from '../../data/cloudAvatar';
import { useEntitlementStore } from '../../app/entitlementStore';
import { startCheckout, type CheckoutKind } from '../../data/checkout';
import { todayISO } from '../../core/dates';
import { saveTextFile } from '../../data/saveTextFile';
import { exportHabits, importHabits } from '../../app/habitBackup';
import { SharingSection } from '../sharing/SharingSection';
import { useShareStore } from '../../app/shareStore';
import { useIsMobile } from '../../ui/useMediaQuery';
import { useAndroidBack } from '../../app/androidBack';
import {
  PhoneAppBar,
  PhoneActionRow,
  PhoneBlock,
  PhoneGroup,
  PhoneNavRow,
  PhoneSelectRow,
  PhoneSwitchRow,
} from './PhoneSettings';
import { version as APP_VERSION } from '../../../package.json';
import './settings.css';

export const ICLOUD_SERVER = 'https://caldav.icloud.com';
const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function preserveCalendarChoices(config: CalDavConfig, previous?: CalDavConfig): CalDavConfig {
  if (config.username !== previous?.username) return config;
  const calendars = config.calendars?.map((calendar) => {
    const old = previous.calendars?.find((c) => c.url === calendar.url);
    return old ? { ...calendar, enabled: old.enabled, writeDefault: old.writeDefault } : calendar;
  });
  return { ...config, calendars,
    calendarUrl: calendars?.some((c) => c.url === previous.calendarUrl) ? previous.calendarUrl : config.calendarUrl };
}

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The month sitting nearest the top of the minimap for a clockwise rotation (deg). */
function monthAtTopLabel(rotation: number): string {
  // Months run clockwise 30° apart from January at the top; the wheel rotates
  // clockwise, so the month at the top is the one rotated up to that position.
  const topAngle = ((360 - rotation) % 360 + 360) % 360;
  const index = Math.round(topAngle / 30) % 12;
  return MONTH_FULL[index];
}

const TIME_ZONES: string[] = (() => {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return typeof supported === 'function' ? supported('timeZone') : ['UTC'];
})();

/** Feather-style 24px outline icons for the nav, stroked with currentColor so
 *  they follow the item's text color (secondary → accent when active). */
function navIcon(paths: JSX.Element): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

const THEME_LABELS = { light: 'Light', dark: 'Dark', sand: 'Sand', system: 'System' } as const;
const FONT_SCALES = [0.8, 0.9, 1, 1.2, 1.4];

/** 24px outline icon for phone rows (sized by CSS). */
function phoneIcon(paths: JSX.Element): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

const SECTIONS: { id: SettingsPanel; label: string; icon: JSX.Element }[] = [
  {
    id: 'account',
    label: 'Account',
    icon: navIcon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  },
  {
    id: 'calendars',
    label: 'Calendars',
    icon: navIcon(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></>),
  },
  {
    id: 'sharing',
    label: 'Sharing',
    icon: navIcon(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: navIcon(<><path d="M12 21a9 9 0 1 1 0-18 9 8 0 0 1 9 8 4.5 4 0 0 1-4.5 4H14a2 2 0 0 0-1 3.75A1.3 1.3 0 0 1 12 21" /><circle cx="7.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="12" cy="7.5" r=".5" fill="currentColor" /><circle cx="16.5" cy="10.5" r=".5" fill="currentColor" /></>),
  },
  {
    id: 'categories',
    label: 'Categories',
    icon: navIcon(<><path d="M20.59 13.41 12 22l-8.58-8.59A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.41.59l7.18 7.18a2 2 0 0 1 0 2.83z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></>),
  },
  {
    id: 'weather',
    label: 'Weather & grid',
    icon: navIcon(<path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 6.5 19z" />),
  },
  {
    id: 'habits',
    label: 'Habit tabs',
    icon: navIcon(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>),
  },
  {
    id: 'ai_mcp',
    label: 'AI / MCP Server',
    icon: navIcon(<><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="15" x2="23" y2="15" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="15" x2="4" y2="15" /></>),
  },
  {
    id: 'data',
    label: 'Data',
    icon: navIcon(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>),
  },
];

export function Settings() {
  const panel = useSettingsStore((s) => s.panel);
  const close = useSettingsStore((s) => s.closeSettings);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const monthLabelMode = useSettingsStore((s) => s.monthLabelMode);
  const customMonths = useSettingsStore((s) => s.customMonths);
  const setMonthLabelMode = useSettingsStore((s) => s.setMonthLabelMode);
  const toggleCustomMonth = useSettingsStore((s) => s.toggleCustomMonth);
  const displayTimeZone = useSettingsStore((s) => s.displayTimeZone);
  const setDisplayTimeZone = useSettingsStore((s) => s.setDisplayTimeZone);
  const minimapFilter = useSettingsStore((s) => s.minimapFilter);
  const setMinimapFilter = useSettingsStore((s) => s.setMinimapFilter);
  const minimapMode = useSettingsStore((s) => s.minimapMode);
  const setMinimapMode = useSettingsStore((s) => s.setMinimapMode);
  const minimapSize = useSettingsStore((s) => s.minimapSize);
  const setMinimapSize = useSettingsStore((s) => s.setMinimapSize);
  const minimapRotation = useSettingsStore((s) => s.minimapRotation);
  const setMinimapRotation = useSettingsStore((s) => s.setMinimapRotation);
  const maxMinimapSize = useSettingsStore((s) => s.maxMinimapSize);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const dimSkinsInDark = useSettingsStore((s) => s.dimSkinsInDark);
  const setDimSkinsInDark = useSettingsStore((s) => s.setDimSkinsInDark);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const resetMinimapSettings = useSettingsStore((s) => s.resetMinimapSettings);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const sidebarSplit = useSettingsStore((s) => s.sidebarSplit);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const resetLayout = useSettingsStore((s) => s.resetLayout);
  const isDefaultLayout =
    sidebarWidth === LAYOUT_DEFAULTS.sidebarWidth &&
    sidebarSplit === LAYOUT_DEFAULTS.sidebarSplit &&
    sidebarCollapsed === LAYOUT_DEFAULTS.sidebarCollapsed;
  const fontScale = useSettingsStore((s) => s.fontScale);
  const setFontScale = useSettingsStore((s) => s.setFontScale);
  const showUvIndex = useSettingsStore((s) => s.showUvIndex);
  const showHourlyWeather = useSettingsStore((s) => s.showHourlyWeather);
  const setShowUvIndex = useSettingsStore((s) => s.setShowUvIndex);
  const setShowHourlyWeather = useSettingsStore((s) => s.setShowHourlyWeather);
  const showQuickEntryDemo = useSettingsStore((s) => s.showQuickEntryDemo);
  const setShowQuickEntryDemo = useSettingsStore((s) => s.setShowQuickEntryDemo);
  const showWeatherIconOnDays = useSettingsStore((s) => s.showWeatherIconOnDays);
  const showClockOnToday = useSettingsStore((s) => s.showClockOnToday);
  const setShowWeatherIconOnDays = useSettingsStore((s) => s.setShowWeatherIconOnDays);
  const setShowClockOnToday = useSettingsStore((s) => s.setShowClockOnToday);
  const showWeekTodayButton = useSettingsStore((s) => s.showWeekTodayButton);
  const setShowWeekTodayButton = useSettingsStore((s) => s.setShowWeekTodayButton);
  const weatherAndLocationEnabled = useSettingsStore((s) => s.weatherAndLocationEnabled);
  const setWeatherAndLocationEnabled = useSettingsStore((s) => s.setWeatherAndLocationEnabled);
  const showGrid = useSettingsStore((s) => s.showGrid);
  const setShowGrid = useSettingsStore((s) => s.setShowGrid);
  const notify = useCalendarStore((s) => s.notify);
  const events = useCalendarStore((s) => s.events);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const accountAvailable = isSupabaseConfigured();
  const [account, setAccount] = useState({
    mode: 'signin' as 'signin' | 'signup',
    email: '',
    password: '',
    busy: false,
    error: '',
    info: '',
  });
  const cosmeticsUnlocked = useEntitlementStore((s) => s.cosmeticsUnlocked);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);

  // Local/cloud identity (name + avatar). Edits route to the auth user's metadata
  // when signed in (so they sync across devices) and always mirror to the local
  // profile so identity survives a sign-out.
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const profileName = useProfileStore((s) => s.name);
  const profileAvatar = useProfileStore((s) => s.avatarDataUrl);
  const setProfileName = useProfileStore((s) => s.setName);
  const setProfileAvatar = useProfileStore((s) => s.setAvatar);
  const clearProfileAvatar = useProfileStore((s) => s.clearAvatar);
  const identity = effectiveIdentity(session, { name: profileName, avatarDataUrl: profileAvatar });
  const [nameInput, setNameInput] = useState(identity.name ?? '');
  const nameFocused = useRef(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Keep the editable name in step with the resolved identity (e.g. cloud
  // metadata arriving after sign-in) unless the user is actively typing.
  useEffect(() => {
    if (!nameFocused.current) setNameInput(identity.name ?? '');
  }, [identity.name]);

  async function commitName() {
    const name = nameInput.trim();
    if (name === (identity.name ?? '')) return;
    setProfileName(name);
    if (session) {
      const res = await updateProfile({ full_name: name });
      if (res.error) notify(`Couldn't update your name: ${res.error}`);
    }
  }

  async function pickAvatar(file: File) {
    setAvatarBusy(true);
    try {
      const { blob, dataUrl } = await avatarFromFile(file);
      // The local data URL is the offline mirror; when signed in the image goes
      // to cloud Storage and only its short URL is stored in the auth metadata
      // (a base64 data URL there would bloat every JWT).
      setProfileAvatar(dataUrl);
      if (session) {
        const url = await uploadAvatar(blob);
        if (!url) {
          notify("Couldn't upload your picture to the cloud — it's saved on this device.");
        } else {
          const res = await updateProfile({ avatar_url: url });
          if (res.error) notify(`Couldn't update your picture: ${res.error}`);
        }
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    clearProfileAvatar();
    if (session) {
      await deleteAvatar();
      const res = await updateProfile({ avatar_url: '' });
      if (res.error) notify(`Couldn't remove your picture: ${res.error}`);
    }
  }

  async function buy(kind: CheckoutKind) {
    const result = await startCheckout(kind);
    if (result.error) {
      notify(`Couldn't start checkout: ${result.error}. Is billing set up? See docs/BILLING_SETUP.md.`);
    }
  }

  const caldavConfig = useConnectionStore((s) => s.caldav);
  const googleConfig = useConnectionStore((s) => s.google);
  const syncHealth = useConnectionStore((s) => s.syncHealth);
  const isAppleConnected = Boolean(caldavConfig);
  const isGoogleConnected = Boolean(googleConfig);
  const isConnected = isAppleConnected || isGoogleConnected;
  const setCalendarEnabled = useConnectionStore((s) => s.setCalendarEnabled);
  const setCalendarWriteDefault = useConnectionStore((s) => s.setCalendarWriteDefault);

  const [apple, setApple] = useState({ open: false, email: '', password: '', busy: false, error: '' });
  const [google, setGoogle] = useState({ busy: false });

  const storeCategories = useSettingsStore((s) => s.categories);
  const setCategoryConfig = useSettingsStore((s) => s.setCategoryConfig);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const importSettingsInputRef = useRef<HTMLInputElement>(null);
  const importHabitsInputRef = useRef<HTMLInputElement>(null);
  const habitTabs = useSettingsStore((s) => s.habitTabs);

  const [mcpClient, setMcpClient] = useState<'claude' | 'cursor'>('claude');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    events.forEach((e) => {
      if (e.type) {
        categories.add(e.type);
      }
    });
    Object.keys(storeCategories).forEach((cat) => categories.add(cat));
    return Array.from(categories).sort();
  }, [events, storeCategories]);

  useEffect(() => {
    if (!panel) {
      setSelectedCategory(null);
    }
  }, [panel]);

  function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    if (existingCategories.includes(name)) {
      notify('Category already exists.');
      setSelectedCategory(name);
      setNewCategoryName('');
      return;
    }
    // New categories start with the default gradient and events matched to it.
    setCategoryConfig(name, {
      type: 'gradient',
      value: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #f59e0b, #6366f1)',
      color1: '#6366f1',
      color2: '#ec4899',
      matchEvents: true,
    });
    setSelectedCategory(name);
    setNewCategoryName('');
  }

  async function connectApple() {
    const email = apple.email.trim();
    const password = apple.password.trim();
    if (!email || !password) {
      setApple((a) => ({ ...a, error: 'Enter your Apple ID email and app-specific password.' }));
      return;
    }
    setApple((a) => ({ ...a, busy: true, error: '' }));
    try {
      const { credentials } = await import('../../data/caldav/credentials');
      // Discovery doubles as an auth check (throws on a non-207 response).
      const { buildAppleAccount } = await import('../../data/caldav/connect');
      const { config } = await buildAppleAccount(email, password);
      if (useConnectionStore.getState().caldav?.username !== caldavConfig?.username) {
        throw new Error('The Apple account changed while connecting. Please try again.');
      }
      await credentials.save(email, password);
      const current = useConnectionStore.getState().caldav;
      if (current?.username !== caldavConfig?.username) {
        throw new Error('The Apple account changed while connecting. Please try again.');
      }
      useConnectionStore.getState().setCalDav(preserveCalendarChoices(config, current));
      setApple({ open: false, email: '', password: '', busy: false, error: '' });
      notify('Apple Calendar sign-in verified. Checking sync…');
    } catch (e) {
      setApple((a) => ({ ...a, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function disconnectApple() {
    const user = useConnectionStore.getState().caldav?.username;
    if (user) {
      const { credentials } = await import('../../data/caldav/credentials');
      await credentials.remove(user).catch(() => {});
    }
    useConnectionStore.getState().disconnectCalDav();
    notify('Apple Calendar disconnected.');
  }

  async function connectGoogle() {
    if (!isDesktop) {
      notify('Google Calendar sync is available in the desktop app.');
      return;
    }
    const { isGoogleConfigured } = await import('../../data/google/googleConfig');
    if (!isGoogleConfigured()) {
      notify('Google sync is not configured. Set VITE_GOOGLE_CLIENT_ID and rebuild the app.');
      return;
    }
    setGoogle({ busy: true });
    try {
      const { connectGoogle: runConnect } = await import('../../data/google/connect');
      const config = await runConnect();
      const current = useConnectionStore.getState().google;
      if (current?.username !== googleConfig?.username) {
        throw new Error('The Google account changed while connecting. Please try again.');
      }
      useConnectionStore.getState().setGoogle(preserveCalendarChoices(config, current));
      notify('Google Calendar connected.');
    } catch (e) {
      notify(`Couldn't connect Google Calendar: ${(e as Error).message}`);
    } finally {
      setGoogle({ busy: false });
    }
  }

  async function disconnectGoogle() {
    const user = useConnectionStore.getState().google?.username;
    if (user) {
      const { disconnectGoogle: forget } = await import('../../data/google/connect');
      await forget(user).catch(() => {});
    }
    useConnectionStore.getState().disconnectGoogle();
    notify('Google Calendar disconnected.');
  }

  async function deletePastEvents() {
    const today = todayISO();
    const pastOneTimeEvents = events.filter((e) => !e.recurrence && e.date < today);
    if (pastOneTimeEvents.length === 0) {
      notify('No past one-time events found.');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Delete past events',
      message: `Are you sure you want to delete all ${pastOneTimeEvents.length} past one-time events? This cannot be undone.`,
      confirmLabel: 'Delete all',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const ids = pastOneTimeEvents.map((e) => e.id);
      await useCalendarStore.getState().deleteEvents(ids);
      notify(`Successfully deleted ${ids.length} past events.`);
    } catch (e) {
      notify(`Failed to delete past events: ${(e as Error).message}`);
    }
  }

  async function handleExportSettings() {
    try {
      const result = await saveTextFile({
        defaultName: `open-calendar-settings-${todayISO()}.json`,
        contents: exportSettings(),
        typeLabel: 'Terra Calendar settings',
      });
      if (result.status === 'cancelled') return;
      if (result.status === 'downloaded') {
        notify(`Settings saved to your downloads as ${result.name}.`);
      } else {
        notify(result.path ? `Settings saved to ${result.path}` : 'Settings saved.');
      }
    } catch (e) {
      notify(`Couldn't export settings: ${(e as Error).message}`);
    }
  }

  async function handleImportSettingsFile(file: File) {
    try {
      const result = importSettings(await file.text());
      if (!result.ok) {
        notify(`Couldn't import settings — ${result.error}.`);
      } else if (result.restartNeeded) {
        notify('Settings imported. Restart the app to finish applying panel preferences.');
      } else {
        notify('Settings imported.');
      }
    } catch (e) {
      notify(`Couldn't read the file: ${(e as Error).message}`);
    }
  }

  async function handleExportHabits() {
    try {
      const result = await saveTextFile({
        defaultName: `open-calendar-habits-${todayISO()}.json`,
        contents: exportHabits(),
        typeLabel: 'Terra Calendar habits',
      });
      if (result.status === 'cancelled') return;
      if (result.status === 'downloaded') {
        notify(`Habits saved to your downloads as ${result.name}.`);
      } else {
        notify(result.path ? `Habits saved to ${result.path}` : 'Habits saved.');
      }
    } catch (e) {
      notify(`Couldn't export habits: ${(e as Error).message}`);
    }
  }

  async function handleImportHabitsFile(file: File) {
    try {
      const result = importHabits(await file.text());
      if (!result.ok) {
        notify(`Couldn't import habits — ${result.error}.`);
      } else {
        notify(
          result.tabsCount
            ? `Imported ${result.tabsCount} habit ${result.tabsCount === 1 ? 'tab' : 'tabs'}.`
            : 'Habits data imported.'
        );
      }
    } catch (e) {
      notify(`Couldn't read the file: ${(e as Error).message}`);
    }
  }

  async function submitAccount() {
    const email = account.email.trim();
    const password = account.password;
    if (!email || !password) {
      setAccount((a) => ({ ...a, error: 'Enter your email and password.' }));
      return;
    }
    setAccount((a) => ({ ...a, busy: true, error: '', info: '' }));
    // On sign-up, carry the local name into the new account's metadata. The
    // avatar is NOT put here (a base64 data URL would bloat the JWT, and there's
    // no session yet to upload with): the App-level seeding effect uploads it to
    // Storage and sets the short URL once a session exists — this also covers the
    // browser handoff and email-confirmation paths.
    const signupMeta = profileName.trim() ? { full_name: profileName.trim() } : undefined;
    const result =
      account.mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, signupMeta);
    if (result.error) {
      setAccount((a) => ({ ...a, busy: false, error: result.error! }));
      return;
    }
    if (result.needsConfirmation) {
      setAccount((a) => ({
        ...a,
        busy: false,
        mode: 'signin',
        password: '',
        info: 'Check your inbox to confirm your email, then sign in.',
      }));
      return;
    }
    // Signed in — the auth listener updates `session`; clear the form.
    setAccount({ mode: 'signin', email: '', password: '', busy: false, error: '', info: '' });
    notify('Signed in.');
  }

  // The Minimap panel dims everything but the minimap so its live preview is the
  // focus — which only works if the side panel it lives in is on screen. Bring
  // the panel back rather than let the user tune something they can't see.
  useEffect(() => {
    if (panel === 'minimap' && useSettingsStore.getState().sidebarCollapsed) {
      setSidebarVisible(true);
    }
  }, [panel]);

  useEffect(() => {
    if (panel === 'minimap') {
      document.body.classList.add('minimap-settings-active');
    } else {
      document.body.classList.remove('minimap-settings-active');
    }
    return () => {
      document.body.classList.remove('minimap-settings-active');
    };
  }, [panel]);

  function renderAccount(provider: 'apple' | 'google', config: typeof caldavConfig) {
    if (!config) return null;
    const label = provider === 'google' ? 'Google Calendar' : 'Apple Calendar';
    const health = syncHealth[provider];
    const checking = !health || health.status === 'checking';
    const failed = health?.status === 'error';
    return (
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div className={`settings-sync-health${failed ? ' is-error' : ''}`} role="status" aria-live="polite">
          <strong>{label}: {failed ? 'Sync paused' : checking ? 'Checking sync…' : 'Connected · Sync up to date'}</strong>
          {failed && <>
            <p>{health.error}</p>
            <p>Changes may not be syncing. Retry sync after checking your connection. If it keeps failing, reconnect {provider === 'apple' ? 'with an Apple app-specific password' : 'your Google account'}.</p>
          </>}
        </div>
        <div className="settings-actions">
          <button className="settings-connect" disabled={checking || apple.busy || google.busy}
            aria-label={`Retry ${label} sync`}
            onClick={() => useConnectionStore.getState().retrySync(provider)}>Retry sync</button>
          <button className="settings-connect" disabled={apple.busy || google.busy}
            onClick={() => provider === 'apple'
              ? setApple({ open: true, email: config.username, password: '', busy: false, error: '' })
              : void connectGoogle()}>Reconnect {label}</button>
        </div>
        {config.calendars && (
          <div className="settings-calendar-list">
            <div className="settings-calendar-header">
              {provider === 'apple' ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.63.73-1.18 1.87-1.03 2.97 1.1.09 2.23-.55 2.98-1.41z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              <span className="settings-calendar-header-title">{label}</span>
              <span className="settings-calendar-header-email">{config.username}</span>
            </div>
            {config.calendars.map((cal, index, arr) => (
              <div
                key={cal.url}
                className="settings-calendar-item"
                style={{
                  borderBottom: index < arr.length - 1 ? '1px solid var(--color-border)' : 'none',
                  gap: 'var(--space-2)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cal.enabled}
                    disabled={apple.busy || google.busy}
                    style={{ accentColor }}
                    onChange={(e) => setCalendarEnabled(cal.url, e.target.checked)}
                  />
                  <span className="settings-calendar-label">
                    <span className="settings-calendar-name">{cal.displayName}</span>
                    {(cal.shared || cal.readOnly) && (
                      <span
                        className="settings-calendar-shared"
                        title={
                          cal.readOnly
                            ? 'Shared with you. You can see these events but not change them.'
                            : 'Shared with you. Your edits are sent back to the owner.'
                        }
                      >
                        {cal.readOnly ? 'Shared · view only' : 'Shared'}
                      </span>
                    )}
                    {cal.enabled && (() => {
                      const count = events.filter((e) => e.calendarUrls?.includes(cal.url)).length;
                      return (
                        <span className="settings-calendar-count">
                          {count} event{count === 1 ? '' : 's'}
                        </span>
                      );
                    })()}
                  </span>
                </label>
                {/* A calendar shared with the user is never a write target —
                    their own new events must not be created on someone else's
                    calendar. */}
                {(() => {
                  const canDefault = cal.enabled && !cal.shared && !cal.readOnly;
                  return (
                    <label
                      title={
                        cal.shared || cal.readOnly
                          ? 'Shared calendars can’t hold your own new events'
                          : 'Write new events here by default — one calendar per account (click again to clear)'
                      }
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        cursor: canDefault ? 'pointer' : 'not-allowed', opacity: canDefault ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="radio"
                        name={`write-default-${provider}-${config.username}`}
                        checked={cal.writeDefault ?? false}
                        disabled={!canDefault || apple.busy || google.busy}
                        style={{ accentColor }}
                        // Single write target per account, so radios — but re-clicking
                        // the selected one clears it (an account may have no default).
                        onChange={() => {}}
                        onClick={() => {
                          if (!canDefault) return;
                          setCalendarWriteDefault(cal.url, !(cal.writeDefault ?? false));
                        }}
                      />
                      Default
                    </label>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
        <button
          className="settings-reset-btn"
          disabled={apple.busy || google.busy}
          onClick={() => void (provider === 'google' ? disconnectGoogle() : disconnectApple())}
        >
          Disconnect {label}
        </button>
      </div>
    );
  }

  // ── Phones: a two-level Android settings screen (section list → one page per
  // section) instead of the desktop dialog. ──────────────────────────────────
  const isMobile = useIsMobile();
  const [phoneList, setPhoneList] = useState(true);
  // Direction of the last page change, for the slide animation.
  const [phoneBack, setPhoneBack] = useState(false);
  const [phoneRaised, setPhoneRaised] = useState(false);
  const [prevPanel, setPrevPanel] = useState(panel);
  if (panel !== prevPanel) {
    setPrevPanel(panel);
    // Opening Settings: 'account' is what the generic "Settings" entry opens,
    // so on a phone that lands on the section list; deep links (Calendars from
    // the tour or the account menu) open their own page.
    if (!prevPanel && panel) {
      setPhoneList(panel === 'account');
      setPhoneBack(false);
      setPhoneRaised(false);
    }
  }

  function phoneOpen(id: SettingsPanel) {
    openSettings(id);
    setSelectedCategory(null);
    setPhoneList(false);
    setPhoneBack(false);
    setPhoneRaised(false);
  }

  /** App-bar back arrow: category editor → section → list → close. */
  function goBack() {
    if (panel === 'categories' && selectedCategory) {
      setSelectedCategory(null);
      setPhoneBack(true);
      return;
    }
    if (isMobile && !phoneList) {
      setPhoneList(true);
      setPhoneBack(true);
      setPhoneRaised(false);
      return;
    }
    close();
  }
  // Android back, one registration per level (each press pops the topmost):
  // Settings itself, then the section page, then the category being edited.
  useAndroidBack(Boolean(panel), close);
  useAndroidBack(Boolean(panel) && isMobile && !phoneList, () => {
    setPhoneList(true);
    setPhoneBack(true);
    setPhoneRaised(false);
  });
  useAndroidBack(panel === 'categories' && Boolean(selectedCategory), () => {
    setSelectedCategory(null);
    setPhoneBack(true);
  });

  const shares = useShareStore((s) => s.shares);
  const habitTabsEnabled = useSettingsStore((s) => s.habitTabsEnabled);

  if (!panel) return null;

  const closeButton = (
    <button className="settings-close" onClick={close} aria-label="Close settings">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  );

  // ── Phone versions of the sections whose desktop layout (checkbox lists,
  // fixed-width selects, window-layout controls) doesn't translate. ─────────
  const phoneAppearance = isMobile ? (
    <section className="settings-section ps-section">
      <h3 className="ps-subhead">Theme</h3>
      <div className="ps-seg" role="group" aria-label="Theme">
        {(['light', 'dark', 'sand', 'system'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`ps-seg-btn${theme === mode ? ' is-active' : ''}`}
            aria-pressed={theme === mode}
            onClick={() => setTheme(mode)}
          >
            {theme === mode && (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {THEME_LABELS[mode]}
          </button>
        ))}
      </div>
      <PhoneGroup>
        <PhoneSwitchRow
          title="Softer styles in dark mode"
          summary="Dims day styles, event skins and day backgrounds so they sit in the dark theme"
          checked={dimSkinsInDark}
          onChange={setDimSkinsInDark}
        />
      </PhoneGroup>

      <PhoneBlock title="Accent color">
        <PaletteSelector
          value={accentColor}
          onChange={setAccentColor}
          presets={ACCENT_COLORS.map((c) => ({ value: c.primary, bg: c.primary }))}
          allowCustom={true}
        />
      </PhoneBlock>

      <PhoneGroup title="Text">
        <PhoneSelectRow
          title="Text size"
          value={String(fontScale)}
          options={FONT_SCALES.map((v) => ({ value: String(v), label: `${Math.round(v * 100)}%` }))}
          onChange={(v) => setFontScale(Number(v))}
        />
      </PhoneGroup>

      <div className="ps-clock">
        <ClockSection />
      </div>

      <PhoneGroup title="New events">
        <PhoneSwitchRow
          title="Time-syntax tip"
          summary={<>Shows how &ldquo;1230 1410 gym&rdquo; becomes a 12:30&ndash;14:10 event</>}
          checked={showQuickEntryDemo}
          onChange={setShowQuickEntryDemo}
        />
      </PhoneGroup>

      <PhoneGroup title="Week view">
        <PhoneSwitchRow
          title="Way back to today"
          summary="Show a Today button when you scroll away"
          checked={showWeekTodayButton}
          onChange={setShowWeekTodayButton}
        />
      </PhoneGroup>
    </section>
  ) : null;

  const phoneWeather = isMobile ? (
    <section className="settings-section ps-section">
      <PhoneGroup
        title="Time zone"
        footer="Events keep the time zone they were created in; times are shown converted to this one."
      >
        <PhoneSelectRow
          title="Show times in"
          sheetTitle="Time zone"
          value={displayTimeZone}
          options={TIME_ZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))}
          onChange={setDisplayTimeZone}
        />
      </PhoneGroup>

      <PhoneGroup title="Weather">
        {!weatherAndLocationEnabled && (
          <PhoneActionRow
            icon={phoneIcon(<path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 6.5 19z" />)}
            title="Turn on location and weather"
            summary="Forecasts on your days and in the weather details"
            onClick={() => {
              setWeatherAndLocationEnabled(true);
              setShowWeatherIconOnDays(true);
              setShowHourlyWeather(true);
              setShowUvIndex(true);
              notify('Location and weather features enabled.');
            }}
          />
        )}
        <PhoneSwitchRow
          title="Weather icon on days"
          checked={showWeatherIconOnDays}
          disabled={!weatherAndLocationEnabled}
          onChange={setShowWeatherIconOnDays}
        />
        <PhoneSwitchRow
          title="Hourly forecast"
          summary="Temperature through the day in the weather details"
          checked={showHourlyWeather}
          disabled={!weatherAndLocationEnabled}
          onChange={setShowHourlyWeather}
        />
        <PhoneSwitchRow
          title="UV index chart"
          checked={showUvIndex}
          disabled={!weatherAndLocationEnabled}
          onChange={setShowUvIndex}
        />
      </PhoneGroup>

      <PhoneGroup title="Calendar">
        <PhoneSwitchRow
          title="Clock on today"
          summary="Current time on today's day cell"
          checked={showClockOnToday}
          onChange={setShowClockOnToday}
        />
        <PhoneSwitchRow
          title="Grid lines"
          summary="Shared borders between days"
          checked={showGrid}
          onChange={setShowGrid}
        />
      </PhoneGroup>
    </section>
  ) : null;

  const phoneData = isMobile ? (
    <section className="settings-section ps-section">
      <PhoneGroup
        title="Backup & restore"
        footer="Categories, colors, saved styles and your profile. Events aren't included — they sync through your calendar account."
      >
        <PhoneActionRow
          icon={phoneIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
          title="Export settings"
          onClick={() => void handleExportSettings()}
        />
        <PhoneActionRow
          icon={phoneIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>)}
          title="Import settings"
          onClick={() => importSettingsInputRef.current?.click()}
        />
      </PhoneGroup>
      <input
        ref={importSettingsInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportSettingsFile(f);
          e.target.value = '';
        }}
      />

      <PhoneGroup
        title="Habits"
        footer="Habits and daily logs live on this device, not in Apple or Google Calendar."
      >
        {habitTabs.length > 0 && (
          <PhoneActionRow
            icon={phoneIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
            title="Export habits"
            onClick={() => void handleExportHabits()}
          />
        )}
        <PhoneActionRow
          icon={phoneIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>)}
          title="Import habits"
          onClick={() => importHabitsInputRef.current?.click()}
        />
      </PhoneGroup>
      <input
        ref={importHabitsInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportHabitsFile(f);
          e.target.value = '';
        }}
      />

      <PhoneGroup title="Cleanup">
        <PhoneActionRow
          icon={phoneIcon(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>)}
          title="Delete past events"
          summary="One-time events before today. Recurring events stay."
          onClick={() => void deletePastEvents()}
        />
      </PhoneGroup>

      <div className="ps-danger">
        <DeleteAllDataSection />
      </div>
    </section>
  ) : null;

  const planLabel = cloudActive ? 'Cloud plan' : 'Free plan';
  const phoneAvatar = (size: 'lg' | 'md') => (
    <span className={`ps-avatar ps-avatar-${size}`} aria-hidden="true">
      {identity.avatarDataUrl ? (
        <img src={identity.avatarDataUrl} alt="" />
      ) : (
        <span>{initials(identity.name ?? identity.email ?? '') || '?'}</span>
      )}
    </span>
  );

  const phoneAccount = isMobile ? (
    <section className="settings-section ps-section">
      <div className="ps-profile">
        <button
          type="button"
          className="ps-profile-avatar"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarBusy}
          aria-label={identity.avatarDataUrl ? 'Change profile picture' : 'Add a profile picture'}
        >
          {phoneAvatar('lg')}
          <span className="ps-profile-badge" aria-hidden="true">
            {phoneIcon(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>)}
          </span>
        </button>
        <label className="ps-field">
          <span className="ps-field-label">Name</span>
          <input
            className="ps-field-input"
            type="text"
            placeholder="Your name"
            maxLength={60}
            value={nameInput}
            onFocus={() => {
              nameFocused.current = true;
            }}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => {
              nameFocused.current = false;
              void commitName();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <div className="ps-profile-sub">
          {identity.email ? `${identity.email} · ${planLabel}` : `Saved on this device · ${planLabel}`}
        </div>
        {identity.avatarDataUrl && (
          <button type="button" className="ps-text-btn" onClick={() => void removeAvatar()}>
            Remove picture
          </button>
        )}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickAvatar(f);
            e.target.value = '';
          }}
        />
      </div>

      {accountAvailable ? (
        <>
          <PhoneGroup title="Plan">
            <PhoneActionRow
              icon={phoneIcon(<path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 6.5 19z" />)}
              title="Cloud sync"
              summary={cloudActive
                ? 'On — events, settings and day styles sync across your devices'
                : 'Sync across your devices. Free works on this device with iCloud and Google.'}
              onClick={cloudActive ? undefined : () => void buy('cloud')}
              disabled={cloudActive}
              trailing={!cloudActive && <span className="ps-chip">$2/mo</span>}
            />
            <PhoneActionRow
              icon={phoneIcon(<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></>)}
              title="Premium cosmetics"
              summary={cosmeticsUnlocked ? 'Unlocked' : 'Extra themes, fonts and day styles'}
              onClick={cosmeticsUnlocked ? undefined : () => void buy('cosmetics')}
              disabled={cosmeticsUnlocked}
              trailing={!cosmeticsUnlocked && <span className="ps-chip">$3.99</span>}
            />
          </PhoneGroup>

          {session ? (
            <PhoneGroup title="Account" footer="Your name and picture sync with this account.">
              <PhoneActionRow
                icon={phoneIcon(<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>)}
                title="Signed in"
                summary={session.user.email}
                disabled
              />
              <PhoneActionRow
                icon={phoneIcon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>)}
                title="Sign out"
                onClick={() => void signOut()}
              />
            </PhoneGroup>
          ) : (
            <div className="ps-group">
              <h3 className="ps-subhead">{account.mode === 'signin' ? 'Sign in' : 'Create account'}</h3>
              <div className="ps-form">
                <p className="ps-form-hint">
                  Only needed for Cloud sync. Carries your name, picture and purchases across devices.
                </p>
                {isDesktop && (
                  <>
                    <button
                      type="button"
                      className="ps-btn ps-btn-tonal"
                      onClick={() => {
                        void (async () => {
                          const { startBrowserSignIn } = await import('../../auth/desktopBrowserAuth');
                          const result = await startBrowserSignIn();
                          setAccount((a) => ({
                            ...a,
                            error: result.error ?? '',
                            info: result.error ? '' : 'Continue in your browser — you are signed in here when you finish.',
                          }));
                        })();
                      }}
                    >
                      Sign in with browser
                    </button>
                    <div className="ps-or"><span>or with email</span></div>
                  </>
                )}
                <label className="ps-field">
                  <span className="ps-field-label">Email</span>
                  <input
                    className="ps-field-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={account.email}
                    onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                  />
                </label>
                <label className="ps-field">
                  <span className="ps-field-label">Password</span>
                  <input
                    className="ps-field-input"
                    type="password"
                    autoComplete={account.mode === 'signin' ? 'current-password' : 'new-password'}
                    value={account.password}
                    onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitAccount();
                      }
                    }}
                  />
                </label>
                {account.error && <p className="ps-form-error">{account.error}</p>}
                {account.info && <p className="ps-form-hint">{account.info}</p>}
                <button
                  type="button"
                  className="ps-btn ps-btn-filled"
                  disabled={account.busy}
                  onClick={() => void submitAccount()}
                >
                  {account.busy ? 'Please wait…' : account.mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
                <button
                  type="button"
                  className="ps-text-btn"
                  onClick={() =>
                    setAccount((a) => ({
                      ...a,
                      mode: a.mode === 'signin' ? 'signup' : 'signin',
                      error: '',
                      info: '',
                    }))
                  }
                >
                  {account.mode === 'signin' ? 'No account? Create one' : 'Have an account? Sign in'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="ps-footnote ps-footnote-center">
          Your profile is saved on this device. Cloud accounts aren&apos;t available in this build.
        </p>
      )}
    </section>
  ) : null;

  // Section bodies, shared by the desktop pane and the phone section page.
  const sectionContent = (
    <>
        {panel === 'sharing' && <SharingSection />}

        {panel === 'calendars' && (
          <section className="settings-section">
            {isConnected && (
              <>
                <h3>Calendar accounts</h3>
                <p className="settings-empty" style={{ marginTop: 0 }}>
                  Events are read from every enabled calendar. New events are written to the
                  one marked <strong>Default</strong> in each account (a new event can mirror
                  across accounts, but only one calendar per account).
                </p>
                {renderAccount('apple', caldavConfig)}
                {renderAccount('google', googleConfig)}
              </>
            )}

            {isMobile && (!isAppleConnected || !isGoogleConnected) && (
              <h3 className="ps-subhead ps-calendars-add">Add an account</h3>
            )}
            {(!isAppleConnected || !isGoogleConnected) && (
              <div className="settings-actions">
                {!isAppleConnected && (
                  <button
                    className="settings-connect"
                    onClick={() =>
                      isDesktop
                        ? setApple((a) => ({ ...a, open: !a.open, error: '' }))
                        : notify('Apple Calendar sync is available in the desktop app.')
                    }
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="settings-btn-icon">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.63.73-1.18 1.87-1.03 2.97 1.1.09 2.23-.55 2.98-1.41z" />
                    </svg>
                    Connect Apple Calendar
                  </button>
                )}
                {!isGoogleConnected && (
                  <button className="settings-connect" disabled={google.busy} onClick={() => void connectGoogle()}>
                    <svg viewBox="0 0 24 24" width="14" height="14" className="settings-btn-icon">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {google.busy ? 'Connecting…' : 'Connect Google Calendar'}
                  </button>
                )}
              </div>
            )}
            {isMobile && !isConnected && (
              <p className="ps-footnote">
                Both can be connected at once. Events show merged and sync both ways.
              </p>
            )}

            {apple.open && (
              <div className="settings-field-group" style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <p className="settings-empty" style={{ margin: 0 }}>
                  Use your Apple ID and an{' '}
                  <a href="https://account.apple.com/account/manage" target="_blank" rel="noreferrer">app-specific password</a>.
                  The password is stored in your OS keychain, never on disk.
                </p>
                <input
                  className="settings-mode"
                  type="email"
                  placeholder="Apple ID email"
                  autoComplete="off"
                  value={apple.email}
                  readOnly={isAppleConnected}
                  disabled={apple.busy}
                  onChange={(e) => setApple((a) => ({ ...a, email: e.target.value }))}
                />
                <input
                  className="settings-mode"
                  type="password"
                  placeholder="App-specific password"
                  autoComplete="off"
                  value={apple.password}
                  disabled={apple.busy}
                  onChange={(e) => setApple((a) => ({ ...a, password: e.target.value }))}
                />
                {apple.error && (
                  <p className="settings-empty" style={{ margin: 0, color: 'var(--color-danger, #ff453a)' }}>{apple.error}</p>
                )}
                <button className="settings-connect" disabled={apple.busy} onClick={() => void connectApple()}>
                  {apple.busy ? 'Connecting…' : isAppleConnected ? 'Reconnect' : 'Connect'}
                </button>
                <button className="settings-reset-btn" disabled={apple.busy}
                  onClick={() => setApple({ open: false, email: '', password: '', busy: false, error: '' })}>Cancel</button>
              </div>
            )}
          </section>
        )}

        {panel === 'appearance' && isMobile && phoneAppearance}
        {panel === 'appearance' && !isMobile && (
          <section className="settings-section">
            <p className="settings-empty">
              Choose a light or dark look, or follow your system setting.
            </p>
            <div className="settings-theme-seg" role="group" aria-label="Theme">
              {(['light', 'dark', 'sand', 'system'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`settings-theme-seg-btn${theme === mode ? ' is-active' : ''}`}
                  aria-pressed={theme === mode}
                  onClick={() => setTheme(mode)}
                >
                  {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : mode === 'sand' ? 'Sand' : 'System'}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={dimSkinsInDark}
                  style={{ accentColor }}
                  onChange={(e) => setDimSkinsInDark(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Tone down day styles in dark mode</span>
                </span>
              </label>
              <p className="settings-empty" style={{ marginTop: 'var(--space-1)' }}>
                Day styles, event skins, and day backgrounds are drawn for the light
                theme. This dims them so they sit in the dark theme instead of glaring
                out of it. Turn it off for full-strength colour.
              </p>
            </div>

            <h3 className="settings-subhead">Accent color</h3>
            <p className="settings-empty">
              Choose the accent color for buttons, selections, and interactive elements.
            </p>
            <div style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <PaletteSelector
                value={accentColor}
                onChange={setAccentColor}
                presets={ACCENT_COLORS.map((c) => ({ value: c.primary, bg: c.primary }))}
                allowCustom={true}
              />
            </div>

            <ClockSection />

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Quick entry</h3>
            <p className="settings-empty">
              The new-event box reads times typed in front of the title, so
              &ldquo;1230 1410 gym&rdquo; becomes a 12:30&ndash;14:10 event. The demo below the
              box shows it in action until you dismiss it.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={showQuickEntryDemo}
                  style={{ accentColor }}
                  onChange={(e) => setShowQuickEntryDemo(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show the time-syntax tip under the new-event box</span>
                </span>
              </label>
            </div>

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Interface text size</h3>
            <p className="settings-empty">
              Scale all text and controls in the app up or down.
            </p>
            <select
              className="settings-mode"
              value={fontScale === 1 ? '1' : fontScale.toString()}
              onChange={(e) => setFontScale(Number(e.target.value))}
              style={{ marginBottom: 'var(--space-4)' }}
            >
              <option value="0.8">80%</option>
              <option value="0.9">90%</option>
              <option value="1">100%</option>
              <option value="1.2">120%</option>
              <option value="1.4">140%</option>
            </select>

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Window layout</h3>
            <p className="settings-empty">
              Hide the side panel to give the calendar the whole window. You can also
              toggle it from the calendar toolbar or with {SIDEBAR_SHORTCUT_LABEL}.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={!sidebarCollapsed}
                  style={{ accentColor }}
                  onChange={(e) => setSidebarVisible(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show side panel (upcoming and minimap)</span>
                </span>
              </label>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={showWeekTodayButton}
                  style={{ accentColor }}
                  onChange={(e) => setShowWeekTodayButton(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">
                    Show the way back to today in the week view
                  </span>
                </span>
              </label>
            </div>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <button
                className="settings-reset-btn"
                onClick={resetLayout}
                disabled={isDefaultLayout}
                style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}
              >
                {isDefaultLayout ? 'Layout is at defaults' : 'Restore default layout'}
              </button>
            </div>
          </section>
        )}

        {panel === 'categories' && (
          <section className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!selectedCategory ? (
              <>
                <div className="category-add-row settings-btn-row">
                  <input
                    type="text"
                    className="settings-mode"
                    placeholder="New category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                    style={{ marginBottom: 0, flex: 1 }}
                  />
                  <button className="tb tb-text" onClick={handleAddCategory}>Add</button>
                </div>
                <div className="category-list">
                  {existingCategories.length === 0 ? (
                    <p className="settings-empty" style={{ margin: 0, textAlign: 'center' }}>No categories created yet.</p>
                  ) : (
                    existingCategories.map((cat) => (
                      <button key={cat} className="category-item-row" onClick={() => setSelectedCategory(cat)}>
                        <span className="upcoming-type" style={{ fontSize: '14px', fontWeight: 500, ...getCategoryStyle(storeCategories[cat]) }}>
                          {cat}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <CategoryEditor category={selectedCategory} />
            )}
          </section>
        )}

        {panel === 'weather' && isMobile && phoneWeather}
        {panel === 'weather' && !isMobile && (
          <section className="settings-section">
            <h3 className="settings-subhead">Time zone</h3>
            <p className="settings-empty">
              Events keep the time zone they were created in; times are shown converted to this one.
            </p>
            <select
              className="settings-mode"
              aria-label="Display time zone"
              value={displayTimeZone}
              onChange={(e) => setDisplayTimeZone(e.target.value)}
              style={{ marginBottom: 'var(--space-4)' }}
            >
              {TIME_ZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Weather info</h3>
            <p className="settings-empty">
              Control which panels are displayed in the weather details popover.
            </p>
            {!weatherAndLocationEnabled && (
              <button
                className="confirm-btn primary settings-action-btn"
                style={{ padding: '10px 14px', fontSize: '13px', marginBottom: 'var(--space-3)', fontFamily: 'inherit', borderRadius: 'var(--radius-md)' }}
                onClick={() => {
                  setWeatherAndLocationEnabled(true);
                  setShowWeatherIconOnDays(true);
                  setShowHourlyWeather(true);
                  setShowUvIndex(true);
                  notify('Location and weather features enabled.');
                }}
              >
                Enable Location and Weather
              </button>
            )}
            <div className="settings-weather-toggles" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0, opacity: weatherAndLocationEnabled ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={showUvIndex}
                  disabled={!weatherAndLocationEnabled}
                  style={{ accentColor }}
                  onChange={(e) => setShowUvIndex(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show UV Index Chart</span>
                </span>
              </label>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0, opacity: weatherAndLocationEnabled ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={showHourlyWeather}
                  disabled={!weatherAndLocationEnabled}
                  style={{ accentColor }}
                  onChange={(e) => setShowHourlyWeather(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show Temperature / Hourly Forecast</span>
                </span>
              </label>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0, opacity: weatherAndLocationEnabled ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  checked={showWeatherIconOnDays}
                  disabled={!weatherAndLocationEnabled}
                  style={{ accentColor }}
                  onChange={(e) => setShowWeatherIconOnDays(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show weather icon on calendar days</span>
                </span>
              </label>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={showClockOnToday}
                  style={{ accentColor }}
                  onChange={(e) => setShowClockOnToday(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show current time clock on today's day cell</span>
                </span>
              </label>
            </div>

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Calendar grid</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <label className="settings-calendar-item" style={{ border: 'none', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={showGrid}
                  style={{ accentColor }}
                  onChange={(e) => setShowGrid(e.target.checked)}
                />
                <span className="settings-calendar-label">
                  <span className="settings-calendar-name">Show grid (shared borders between days)</span>
                </span>
              </label>
            </div>

          </section>
        )}

        {panel === 'habits' && <HabitTabsSection />}

        {panel === 'data' && isMobile && phoneData}
        {panel === 'data' && !isMobile && (
          <section className="settings-section">
            <h3 className="settings-subhead">Calendar cleanup</h3>
            <p className="settings-empty">
              Delete all past one-time events to free up space. Recurring events will be preserved.
            </p>
            <button
              className="settings-cleanup-btn"
              onClick={() => void deletePastEvents()}
            >
              Delete all past events
            </button>

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Backup &amp; restore</h3>
            <p className="settings-empty">
              Save your categories, colors, saved styles, panel preferences and profile to a file —
              you choose where it goes — then load it on another device or after a reinstall.
              Events aren't included; they already sync through your calendar account.
            </p>
            <div className="settings-btn-row">
              <button
                className="settings-reset-btn"
                style={{ marginTop: 0, marginBottom: 0, flex: 1 }}
                onClick={() => void handleExportSettings()}
              >
                Export settings…
              </button>
              <button
                className="settings-reset-btn"
                style={{ marginTop: 0, marginBottom: 0, flex: 1 }}
                onClick={() => importSettingsInputRef.current?.click()}
              >
                Import settings…
              </button>
            </div>
            <input
              ref={importSettingsInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportSettingsFile(f);
                e.target.value = '';
              }}
            />

            <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Habit tracker data</h3>
            <p className="settings-empty">
              Habits and daily logs are stored on this device (not synced to Apple or Google Calendar).
              Export your habit tabs and recorded days to transfer them to another device or create a backup.
            </p>
            <div className="settings-btn-row">
              {habitTabs.length > 0 && (
                <button
                  className="settings-reset-btn"
                  style={{ marginTop: 0, marginBottom: 0, flex: 1 }}
                  onClick={() => void handleExportHabits()}
                >
                  Export habits…
                </button>
              )}
              <button
                className="settings-reset-btn"
                style={{ marginTop: 0, marginBottom: 0, flex: 1 }}
                onClick={() => importHabitsInputRef.current?.click()}
              >
                Import habits…
              </button>
            </div>
            <input
              ref={importHabitsInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportHabitsFile(f);
                e.target.value = '';
              }}
            />

            <DeleteAllDataSection />
          </section>
        )}

        {panel === 'account' && isMobile && phoneAccount}
        {panel === 'account' && !isMobile && (
          <section className="settings-section">
            {/* Profile — name + avatar. Works fully offline; no account needed. */}
            <div className="profile-card">
              <button
                type="button"
                className="profile-avatar"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
                aria-label={identity.avatarDataUrl ? 'Change profile picture' : 'Add a profile picture'}
              >
                {identity.avatarDataUrl ? (
                  <img className="profile-avatar-img" src={identity.avatarDataUrl} alt="" />
                ) : (
                  <span className="profile-avatar-initials">
                    {initials(identity.name ?? identity.email ?? '')}
                  </span>
                )}
                <span className="profile-avatar-edit" aria-hidden="true">
                  {avatarBusy ? '…' : identity.avatarDataUrl ? 'Change' : 'Add'}
                </span>
              </button>
              <div className="profile-fields">
                <input
                  className="profile-name-input"
                  type="text"
                  placeholder="Your name"
                  maxLength={60}
                  value={nameInput}
                  onFocus={() => {
                    nameFocused.current = true;
                  }}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={() => {
                    nameFocused.current = false;
                    void commitName();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
                <div className="profile-sub">
                  {identity.email
                    ? `${identity.email} · ${cloudActive ? 'Cloud plan' : 'Free plan'}`
                    : 'Saved on this device · Free plan'}
                </div>
                {identity.avatarDataUrl && (
                  <button type="button" className="profile-remove" onClick={() => void removeAvatar()}>
                    Remove picture
                  </button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pickAvatar(f);
                  e.target.value = '';
                }}
              />
            </div>

            {accountAvailable ? (
              <>
                <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Sync &amp; plan</h3>
                <div className="settings-checkout-group">
                  <div className="settings-plan-row">
                    <span className="settings-plan-info">
                      <span className="settings-plan-name">Cloud sync</span>
                      <span className="settings-plan-desc">
                        {cloudActive
                          ? 'On — events, settings & day styles sync across your devices'
                          : 'Free: works on this device and syncs to iCloud & Google. Cloud adds cross-device sync.'}
                      </span>
                    </span>
                    {!cloudActive && (
                      <button className="settings-connect settings-plan-btn" onClick={() => void buy('cloud')}>
                        Subscribe — $2/mo
                      </button>
                    )}
                  </div>
                  <div className="settings-plan-row">
                    <span className="settings-plan-info">
                      <span className="settings-plan-name">Premium cosmetics</span>
                      <span className="settings-plan-desc">
                        {cosmeticsUnlocked ? 'Unlocked ✓' : 'Extra themes, fonts & day styles'}
                      </span>
                    </span>
                    {!cosmeticsUnlocked && (
                      <button className="settings-connect settings-plan-btn" onClick={() => void buy('cosmetics')}>
                        Unlock — $3.99
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Account</h3>
                {session ? (
                  <>
                    <p className="settings-empty" style={{ marginTop: 0 }}>
                      Signed in as {session.user.email}. Your name and picture sync with this account.
                    </p>
                    <button className="settings-reset-btn" onClick={() => void signOut()}>
                      Sign out
                    </button>
                  </>
                ) : (
                  <div
                    className="settings-field-group"
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                  >
                    <p className="settings-empty" style={{ margin: 0 }}>
                      An account is only needed for Cloud sync. Sign in to carry your name, picture,
                      and purchases across devices.
                    </p>
                    {isDesktop && (
                      <>
                        <button
                          className="settings-connect"
                          style={{ marginTop: 0 }}
                          onClick={() => {
                            void (async () => {
                              const { startBrowserSignIn } = await import('../../auth/desktopBrowserAuth');
                              const result = await startBrowserSignIn();
                              setAccount((a) => ({
                                ...a,
                                error: result.error ?? '',
                                info: result.error
                                  ? ''
                                  : 'Continue in your browser — this window signs in automatically when you finish.',
                              }));
                            })();
                          }}
                        >
                          Sign in with browser
                        </button>
                        <div className="settings-or"><span>or with email</span></div>
                      </>
                    )}
                    <input
                      className="settings-mode"
                      type="email"
                      placeholder="Email"
                      autoComplete="email"
                      value={account.email}
                      onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                    />
                    <input
                      className="settings-mode"
                      type="password"
                      placeholder="Password"
                      autoComplete={account.mode === 'signin' ? 'current-password' : 'new-password'}
                      value={account.password}
                      onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void submitAccount();
                        }
                      }}
                    />
                    {account.error && (
                      <p className="settings-empty" style={{ margin: 0, color: 'var(--color-danger, #ff453a)' }}>
                        {account.error}
                      </p>
                    )}
                    {account.info && (
                      <p className="settings-empty" style={{ margin: 0 }}>{account.info}</p>
                    )}
                    <button className="settings-connect" disabled={account.busy} onClick={() => void submitAccount()}>
                      {account.busy
                        ? 'Please wait…'
                        : account.mode === 'signin'
                          ? 'Sign in'
                          : 'Create account'}
                    </button>
                    <button
                      className="settings-reset-btn"
                      style={{ marginTop: 0 }}
                      onClick={() =>
                        setAccount((a) => ({
                          ...a,
                          mode: a.mode === 'signin' ? 'signup' : 'signin',
                          error: '',
                          info: '',
                        }))
                      }
                    >
                      {account.mode === 'signin' ? 'No account? Create one' : 'Have an account? Sign in'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="settings-empty" style={{ marginTop: 'var(--space-4)' }}>
                Your profile is saved on this device. Cloud accounts aren't available in this build.
              </p>
            )}
          </section>
        )}

        {panel === 'ai_mcp' && (
          <section className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p className="settings-empty" style={{ marginTop: 0 }}>
              The Model Context Protocol (MCP) server enables AI assistants (like Claude Desktop or Cursor) to read, search, create, update, and delete events in your calendar.
            </p>

            <div className="settings-theme-seg" role="group" aria-label="MCP Client" style={{ marginBottom: 'var(--space-2)' }}>
              {(['claude', 'cursor'] as const).map((client) => (
                <button
                  key={client}
                  type="button"
                  className={`settings-theme-seg-btn${mcpClient === client ? ' is-active' : ''}`}
                  onClick={() => setMcpClient(client)}
                  style={{ textTransform: 'none' }}
                >
                  {client === 'claude' ? 'Claude Desktop' : 'Cursor'}
                </button>
              ))}
            </div>

            {mcpClient === 'claude' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <h3 style={{ margin: 'var(--space-2) 0 0 0', fontSize: '13px', color: 'var(--color-text)' }}>1. Build the MCP Server</h3>
                <p className="settings-empty">
                  Ensure you have Node.js installed, then open your terminal in the <code>mcp-server</code> directory and compile the server:
                </p>
                <div style={{ position: 'relative', background: '#18181b', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', border: '1px solid var(--color-border)' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {`cd mcp-server\nnpm install\nnpm run build`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard('cd mcp-server\nnpm install\nnpm run build', 'build-cmd')}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text)', transition: 'all 0.15s ease' }}
                  >
                    {copiedId === 'build-cmd' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>

                <h3 style={{ margin: 'var(--space-2) 0 0 0', fontSize: '13px', color: 'var(--color-text)' }}>2. Configure Claude Desktop</h3>
                <p className="settings-empty">
                  Open your Claude Desktop config file at:
                  <br />
                  <code style={{ fontSize: '11px', background: 'var(--color-muted-bg)', padding: '2px 6px', borderRadius: '3px', wordBreak: 'break-all', display: 'inline-block', marginTop: '4px' }}>%APPDATA%\Claude\claude_desktop_config.json</code>
                </p>
                
                <h4 style={{ margin: 'var(--space-1) 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Local Edition (default)</h4>
                <p className="settings-empty">
                  Add the block below inside the <code>mcpServers</code> object to read/write local calendar files:
                </p>
                <div style={{ position: 'relative', background: '#18181b', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', border: '1px solid var(--color-border)' }}>
                  <pre style={{ margin: 0, overflowX: 'auto', lineHeight: '1.6' }}>
{`{
  "mcpServers": {
    "open-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/path/to/terra-calendar/mcp-server/src/index.ts"
      ]
    }
  }
}`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(`{\n  "mcpServers": {\n    "open-calendar": {\n      "command": "npx",\n      "args": [\n        "-y",\n        "tsx",\n        "C:/path/to/terra-calendar/mcp-server/src/index.ts"\n      ]\n    }\n  }\n}`, 'claude-local')}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text)', transition: 'all 0.15s ease' }}
                  >
                    {copiedId === 'claude-local' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>

                <h4 style={{ margin: 'var(--space-2) 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Cloud Edition (Supabase Sync)</h4>
                <p className="settings-empty">
                  To interact with your hosted account instead, add your Supabase credentials to the environment block:
                </p>
                <div style={{ position: 'relative', background: '#18181b', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', border: '1px solid var(--color-border)' }}>
                  <pre style={{ margin: 0, overflowX: 'auto', lineHeight: '1.6' }}>
{`{
  "mcpServers": {
    "open-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/path/to/terra-calendar/mcp-server/src/index.ts"
      ],
      "env": {
        "OPEN_CALENDAR_SUPABASE_URL": "https://YOUR-PROJECT-REF.supabase.co",
        "OPEN_CALENDAR_SUPABASE_ANON_KEY": "sb_publishable_xxxxxx",
        "OPEN_CALENDAR_EMAIL": "your-email@example.com",
        "OPEN_CALENDAR_PASSWORD": "your-account-password"
      }
    }
  }
}`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(`{\n  "mcpServers": {\n    "open-calendar": {\n      "command": "npx",\n      "args": [\n        "-y",\n        "tsx",\n        "C:/path/to/terra-calendar/mcp-server/src/index.ts"\n      ],\n      "env": {\n        "OPEN_CALENDAR_SUPABASE_URL": "https://YOUR-PROJECT-REF.supabase.co",\n        "OPEN_CALENDAR_SUPABASE_ANON_KEY": "sb_publishable_xxxxxx",\n        "OPEN_CALENDAR_EMAIL": "your-email@example.com",\n        "OPEN_CALENDAR_PASSWORD": "your-account-password"\n      }\n    }\n  }\n}`, 'claude-cloud')}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text)', transition: 'all 0.15s ease' }}
                  >
                    {copiedId === 'claude-cloud' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <p className="settings-empty">
                  Restart Claude Desktop. You should see a green plug icon when it is ready.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <h3 style={{ margin: 'var(--space-2) 0 0 0', fontSize: '13px', color: 'var(--color-text)' }}>Configure Cursor</h3>
                <p className="settings-empty">
                  To connect Terra Calendar in Cursor:
                </p>
                <ol className="settings-empty" style={{ paddingLeft: 'var(--space-4)', margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: '13px' }}>
                  <li>Navigate to Cursor <strong>Settings</strong> → <strong>Features</strong> → <strong>MCP</strong>.</li>
                  <li>Click on <strong>+ Add New MCP Server</strong>.</li>
                  <li>Set Name to <code>open-calendar</code> and Type to <code>command</code>.</li>
                  <li>Copy and paste one of the commands below into the <strong>Command</strong> field.</li>
                </ol>

                <h4 style={{ margin: 'var(--space-2) 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Local Edition (default)</h4>
                <div style={{ position: 'relative', background: '#18181b', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', border: '1px solid var(--color-border)' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {`npx -y tsx "C:/path/to/terra-calendar/mcp-server/src/index.ts"`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard('npx -y tsx "C:/path/to/terra-calendar/mcp-server/src/index.ts"', 'cursor-local')}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text)', transition: 'all 0.15s ease' }}
                  >
                    {copiedId === 'cursor-local' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>

                <h4 style={{ margin: 'var(--space-2) 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Cloud Edition (Supabase Sync)</h4>
                <div style={{ position: 'relative', background: '#18181b', padding: '12px 16px', borderRadius: 'var(--radius-md)', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', border: '1px solid var(--color-border)' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                    {`cmd /C "set OPEN_CALENDAR_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co && set OPEN_CALENDAR_SUPABASE_ANON_KEY=sb_publishable_xxxxxx && set OPEN_CALENDAR_EMAIL=your-email@example.com && set OPEN_CALENDAR_PASSWORD=your-password && npx -y tsx C:/path/to/terra-calendar/mcp-server/src/index.ts"`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard('cmd /C "set OPEN_CALENDAR_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co && set OPEN_CALENDAR_SUPABASE_ANON_KEY=sb_publishable_xxxxxx && set OPEN_CALENDAR_EMAIL=your-email@example.com && set OPEN_CALENDAR_PASSWORD=your-password && npx -y tsx C:/path/to/terra-calendar/mcp-server/src/index.ts"', 'cursor-cloud')}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text)', transition: 'all 0.15s ease' }}
                  >
                    {copiedId === 'cursor-cloud' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
    </>
  );

  if (isMobile) {
    const sectionSummary = (id: SettingsPanel): string => {
      switch (id) {
        case 'calendars': {
          if (Object.values(syncHealth).some((h) => h?.status === 'error')) return 'Sync paused — tap to check';
          if (isAppleConnected && isGoogleConnected) return 'iCloud and Google connected';
          if (isAppleConnected) return 'iCloud connected';
          if (isGoogleConnected) return 'Google connected';
          return 'Connect iCloud or Google Calendar';
        }
        case 'sharing':
          if (!session) return 'Sign in to share with family';
          if (!cloudActive) return 'Share a link with family · Cloud';
          return shares.length === 0
            ? 'Send a link to family'
            : `${shares.length} shared ${shares.length === 1 ? 'link' : 'links'}`;
        case 'appearance':
          return `${THEME_LABELS[theme]} theme · ${Math.round(fontScale * 100)}% text`;
        case 'categories':
          return existingCategories.length === 0
            ? 'Colors and styles for kinds of events'
            : `${existingCategories.length} ${existingCategories.length === 1 ? 'category' : 'categories'}`;
        case 'weather':
          return `${weatherAndLocationEnabled ? 'Weather on' : 'Weather off'} · ${displayTimeZone.replace(/_/g, ' ')}`;
        case 'habits':
          return habitTabsEnabled
            ? `On · ${habitTabs.length} ${habitTabs.length === 1 ? 'habit' : 'habits'}`
            : 'Off';
        case 'data':
          return 'Backup, restore and cleanup';
        default:
          return '';
      }
    };
    const row = (id: SettingsPanel) => {
      const s = SECTIONS.find((x) => x.id === id)!;
      return <PhoneNavRow key={id} icon={s.icon} title={s.label} summary={sectionSummary(id)} onClick={() => phoneOpen(id)} />;
    };

    const onList = phoneList;
    const title = onList
      ? 'Settings'
      : panel === 'categories' && selectedCategory
        ? selectedCategory
        : SECTIONS.find((s) => s.id === panel)?.label ?? 'Settings';

    return (
      <div className="settings-phone" role="dialog" aria-modal="true" aria-label={title}>
        <PhoneAppBar
          title={title}
          onBack={goBack}
          backLabel={onList ? 'Close settings' : 'Back'}
          raised={phoneRaised}
        />
        <div
          key={onList ? 'list' : `${panel}:${selectedCategory ?? ''}`}
          className={`settings-phone-body${phoneBack ? ' is-back' : ''}`}
          onScroll={(e) => setPhoneRaised(e.currentTarget.scrollTop > 0)}
        >
          {onList ? (
            <>
              <button type="button" className="ps-account" onClick={() => phoneOpen('account')}>
                {phoneAvatar('md')}
                <span className="ps-row-text">
                  <span className="ps-account-name">{identity.name ?? 'Set up your profile'}</span>
                  <span className="ps-row-summary">
                    {identity.email ? `${identity.email} · ${planLabel}` : `Saved on this device · ${planLabel}`}
                  </span>
                </span>
                <svg className="ps-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
              <PhoneGroup>
                {row('calendars')}
                {row('sharing')}
              </PhoneGroup>
              <PhoneGroup>
                {row('appearance')}
                {row('categories')}
                {row('weather')}
                {row('habits')}
              </PhoneGroup>
              <PhoneGroup>{row('data')}</PhoneGroup>
              <PhoneGroup>
                <PhoneActionRow
                  href="https://discord.com/invite/kfTbsN7eF7"
                  icon={
                    <svg viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
                      <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,52.8,6.83,77.19,77.19,0,0,0,49.5,0,105.15,105.15,0,0,0,19.06,8.07C-3.41,41.92-1.74,75.16,8.32,96A105.73,105.73,0,0,0,39.46,84.14a79.25,79.25,0,0,0,6.6-11A67.46,67.46,0,0,1,34,68.32c1-.7,1.94-1.44,2.83-2.22a74.37,74.37,0,0,0,53.46,0c.89.78,1.86,1.52,2.83,2.22a67.46,67.46,0,0,1-12.06,4.82,79.25,79.25,0,0,0,6.6,11A105.73,105.73,0,0,0,118.4,96C128.46,75.16,129.8,41.92,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.9,46,53.9,53,48.72,65.69,42.45,65.69Zm42,0C78.18,65.69,73,60,73,53S78.18,40.36,84.45,40.36,95.9,46,95.9,53,90.72,65.69,84.45,65.69Z" />
                    </svg>
                  }
                  title="Discord"
                  summary="Get help and share ideas"
                />
              </PhoneGroup>
              <p className="ps-version">Terra Calendar {APP_VERSION}</p>
            </>
          ) : (
            sectionContent
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`settings-backdrop${panel === 'minimap' ? ' minimap-mode' : ''}`} onClick={close}>
      <div className={`settings-card${panel !== 'minimap' ? ' settings-card-split' : ''}`} onClick={(e) => e.stopPropagation()}>
        {panel !== 'minimap' && (
          <nav className="settings-nav">
            <div className="settings-nav-account">
              <div className="settings-nav-avatar" aria-hidden="true">
                {session?.user.email ? session.user.email.slice(0, 2).toUpperCase() : '?'}
              </div>
              <div className="settings-nav-id">
                <div className="settings-nav-email">{session?.user.email ?? 'Not signed in'}</div>
                <div className="settings-nav-plan">{cloudActive ? 'Cloud plan' : 'Free plan'}</div>
              </div>
            </div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`settings-nav-item${panel === s.id ? ' is-active' : ''}`}
                onClick={() => openSettings(s.id)}
              >
                {s.icon}
                <span>{s.label}</span>
              </button>
            ))}
            <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
              <a
                href="https://discord.com/invite/kfTbsN7eF7"
                target="_blank"
                rel="noreferrer"
                className="settings-nav-item"
                style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '9px' }}
              >
                <svg viewBox="0 0 127.14 96.36" width="14" height="14" fill="currentColor" aria-hidden="true" style={{ flex: 'none' }}>
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,52.8,6.83,77.19,77.19,0,0,0,49.5,0,105.15,105.15,0,0,0,19.06,8.07C-3.41,41.92-1.74,75.16,8.32,96A105.73,105.73,0,0,0,39.46,84.14a79.25,79.25,0,0,0,6.6-11A67.46,67.46,0,0,1,34,68.32c1-.7,1.94-1.44,2.83-2.22a74.37,74.37,0,0,0,53.46,0c.89.78,1.86,1.52,2.83,2.22a67.46,67.46,0,0,1-12.06,4.82,79.25,79.25,0,0,0,6.6,11A105.73,105.73,0,0,0,118.4,96C128.46,75.16,129.8,41.92,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.9,46,53.9,53,48.72,65.69,42.45,65.69Zm42,0C78.18,65.69,73,60,73,53S78.18,40.36,84.45,40.36,95.9,46,95.9,53,90.72,65.69,84.45,65.69Z" />
                </svg>
                <span>Discord</span>
              </a>
            </div>
          </nav>
        )}
        {panel !== 'minimap' && (
          <div className="settings-pane">
            <header className="settings-header">
              {panel === 'categories' && selectedCategory ? (
                <button
                  className="settings-back"
                  onClick={() => setSelectedCategory(null)}
                  aria-label="All categories"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  <span>All categories</span>
                </button>
              ) : (
                <h2>{SECTIONS.find((s) => s.id === panel)?.label ?? 'Settings'}</h2>
              )}
              {closeButton}
            </header>

        {sectionContent}
          </div>
        )}

        {panel === 'minimap' && (
          <>
          <header className="settings-header">
            <h2>Minimap</h2>
            {closeButton}
          </header>
          <section className="settings-section">
            <h3 style={{ margin: '0 0 var(--space-2) 0', fontSize: '13px', color: 'var(--color-text)' }}>Layout</h3>
            <select
              className="settings-mode"
              value={minimapMode}
              onChange={(e) => setMinimapMode(e.target.value as MinimapMode)}
              style={{ marginBottom: 'var(--space-4)' }}
            >
              <option value="circle">Circle (year wheel)</option>
              <option value="days">Month days (1 · 2 · 3 …)</option>
            </select>

            {/* Only the year wheel draws events; the month of days shows the
                days themselves. Offering the filter there would be a control
                that does nothing. */}
            {minimapMode === 'circle' && (
              <>
                <h3 style={{ margin: '0 0 var(--space-2) 0', fontSize: '13px', color: 'var(--color-text)' }}>Show events</h3>
                <select
                  className="settings-mode"
                  value={minimapFilter}
                  onChange={(e) => setMinimapFilter(e.target.value as any)}
                  style={{ marginBottom: 'var(--space-4)' }}
                >
                  <option value="onetime">Only one-time events</option>
                  <option value="recurring">Only recurring events</option>
                  <option value="all">All events</option>
                  <option value="none">No events</option>
                </select>
              </>
            )}

            {minimapMode === 'circle' && (
            <>
            <div className="settings-field-group" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="settings-field-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <h3 style={{ margin: 0, fontSize: '13px', color: 'var(--color-text)' }}>Minimap size</h3>
                <span className="settings-size-value" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                  {Math.min(minimapSize, maxMinimapSize)}%
                </span>
              </div>
              <div className="settings-size-control" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <input
                  type="range"
                  min="50"
                  max={maxMinimapSize}
                  step="5"
                  value={Math.min(minimapSize, maxMinimapSize)}
                  onChange={(e) => setMinimapSize(Number(e.target.value))}
                  className="settings-slider"
                  style={{ flex: 1, accentColor: 'var(--color-accent)' }}
                />
                <button
                  onClick={() => setMinimapSize(100)}
                  disabled={minimapSize === 100}
                  className="settings-size-reset-btn"
                  aria-label="Reset minimap size"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <polyline points="3 3 3 8 8 8" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="settings-field-group" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="settings-field-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <h3 style={{ margin: 0, fontSize: '13px', color: 'var(--color-text)' }}>Rotation</h3>
                <span className="settings-size-value" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                  {minimapRotation}°
                </span>
              </div>
              <p className="settings-empty" style={{ margin: '0 0 var(--space-2) 0' }}>
                Spin the wheel so any month sits at the top — {monthAtTopLabel(minimapRotation)} is up now.
              </p>
              <div className="settings-size-control" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <input
                  type="range"
                  min="0"
                  max="359"
                  step="1"
                  value={minimapRotation}
                  onChange={(e) => setMinimapRotation(Number(e.target.value))}
                  className="settings-slider"
                  style={{ flex: 1, accentColor: 'var(--color-accent)' }}
                  aria-label="Minimap rotation"
                />
                <button
                  onClick={() => setMinimapRotation(0)}
                  disabled={minimapRotation === 0}
                  className="settings-size-reset-btn"
                  aria-label="Reset minimap rotation (January on top)"
                  title="Reset to January on top"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <polyline points="3 3 3 8 8 8" />
                  </svg>
                </button>
              </div>
            </div>

            <h3 style={{ margin: '0 0 var(--space-2) 0', fontSize: '13px', color: 'var(--color-text)' }}>Visible months</h3>
            <select
              className="settings-mode"
              value={monthLabelMode}
              onChange={(e) => setMonthLabelMode(e.target.value as MonthLabelMode)}
            >
              {MONTH_LABEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="settings-month-grid">
              {MONTH_SHORT.map((name, i) => {
                const month = i + 1;
                const checked = visibleMonths(monthLabelMode, customMonths).includes(month);
                const editable = monthLabelMode === 'custom';
                const cls =
                  'settings-month' +
                  (editable ? (checked ? ' is-checked' : '') : ' is-disabled');
                return (
                  <label key={month} className={cls}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!editable}
                      onChange={() => toggleCustomMonth(month)}
                    />
                    {name}
                  </label>
                );
              })}
            </div>
            </>
            )}

            <button className="settings-reset-btn" onClick={resetMinimapSettings}>
              Reset to defaults
            </button>
          </section>
          </>
        )}
      </div>

    </div>
  );
}
