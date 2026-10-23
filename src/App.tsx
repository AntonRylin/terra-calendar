import { useEffect, useMemo, useState } from 'react';
import { MainScreen } from './app/MainScreen';
import { useCalendarStore } from './app/store';
import { useSettingsStore, ACCENT_COLORS, hydrateSettingsFromDisk, hydrateSettingsFromCloud } from './app/settingsStore';
import { hydrateProfileFromDisk, currentLocalProfile } from './app/profileStore';
import type { ProfileMeta } from './auth/authStore';
import { hydrateDayBackgroundsFromCloud } from './app/specialDaysStore';
import { useHabitEntriesStore, hydrateHabitEntriesFromCloud } from './app/habitEntriesStore';
import { useEntitlementStore } from './app/entitlementStore';
import { checkForAppUpdate } from './app/updater';
import { createLocalRepository, createRepositoryAsync, isCloudMode } from './data/createRepository';
import { isSupabaseConfigured } from './data/supabaseClient';
import { useConnectionStore } from './app/connectionStore';
import { useAuthStore } from './auth/authStore';
import { AuthGate, isDesktopHandoff } from './auth/AuthGate';
import { useUiStore } from './app/uiStore';
import { useSharing } from './features/sharing/useSharing';
import { QuickEntryHost } from './features/quick-entry/QuickEntryHost';
import { EventEditorHost } from './features/event-editor/EventEditorHost';
import { EventCreateHost } from './features/event-editor/EventCreateHost';
import { TaskEditorHost } from './features/task-editor/TaskEditorHost';
import { SpanHost } from './features/span-editor/SpanHost';
import { SpanDayHost } from './features/span-editor/SpanDayHost';
import { SpecialDayHost } from './features/special-day/SpecialDayHost';
import { DayBackgroundHost } from './features/day-background/DayBackgroundHost';
import { CategoryEditorHost } from './features/category-editor/CategoryEditorHost';
import { Settings } from './features/settings/Settings';
import { Toast } from './ui/Toast';
import { ConfirmHost } from './ui/ConfirmHost';
import { EventHoverCard } from './ui/EventHoverCard';
import { OnboardingHost } from './features/onboarding/OnboardingHost';
import { UndoControls } from './ui/UndoControls';
import { WindowControls } from './ui/TitleBar';
import { CustomStylesSheet } from './ui/CustomStylesSheet';
import { installCosmeticParticles } from './ui/cosmeticParticles';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function getSoftAccent(hexColor: string): string {
  if (hexColor.startsWith('#')) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.12)`;
  }
  return 'rgba(10, 132, 255, 0.12)';
}

/** The calendar UI itself. */
function Shell() {
  return (
    <>
      <CustomStylesSheet />
      <WindowControls />
      <MainScreen />
      <QuickEntryHost />
      <EventEditorHost />
      <EventCreateHost />
      <TaskEditorHost />
      <SpanHost />
      <SpanDayHost />
      <SpecialDayHost />
      <DayBackgroundHost />
      <CategoryEditorHost />
      <Settings />
      <Toast />
      <EventHoverCard />
      <ConfirmHost />
      <OnboardingHost />
      <UndoControls />
    </>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const dimSkinsInDark = useSettingsStore((s) => s.dimSkinsInDark);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const tileScale = useSettingsStore((s) => s.tileScale);
  const ready = useCalendarStore((s) => s.ready);

  // Re-initialise the repository whenever a connected calendar account changes.
  // The calendar lists are compared by value, but only re-serialised when the
  // underlying array identity changes — otherwise every App render (theme,
  // accent, font scale, session…) paid to stringify both lists.
  const connUser = useConnectionStore((s) => s.caldav?.username);
  const syncRevision = useConnectionStore((s) => s.syncRevision);
  const connCalendars = useConnectionStore((s) => s.caldav?.calendars);
  const connGoogleUser = useConnectionStore((s) => s.google?.username);
  const connGoogleCalendars = useConnectionStore((s) => s.google?.calendars);
  const connCalendarsStr = useMemo(() => JSON.stringify(connCalendars), [connCalendars]);
  const connGoogleCalendarsStr = useMemo(() => JSON.stringify(connGoogleCalendars), [connGoogleCalendars]);

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark' | 'sand'>('light');

  // Recover settings (incl. category cosmetics) from the durable on-disk mirror
  // on desktop; no-op on web. See settingsStore.
  useEffect(() => {
    void hydrateSettingsFromDisk();
  }, []);

  // Interactive dust for the "stardust" cosmetic (document-level delegation,
  // so it covers month chips, week blocks, spans, and day tiles alike).
  useEffect(() => installCosmeticParticles(), []);

  // Recover the local profile (name + avatar) from its durable on-disk mirror on
  // desktop; no-op on web. See profileStore.
  useEffect(() => {
    void hydrateProfileFromDisk();
  }, []);

  // Load locally recorded habit-tab entries (checkmarks, notes, numbers).
  useEffect(() => {
    useHabitEntriesStore.getState().init();
  }, []);

  // Optional account: only initialise auth when a hosted backend is configured.
  // Signing in is additive — it never gates the app.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return useAuthStore.getState().init();
  }, []);

  // Desktop: adopt sessions arriving via opencalendar:// deep links (the
  // browser-based sign-in hands the session back through this channel).
  useEffect(() => {
    if (!IS_TAURI || !isSupabaseConfigured()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import('./auth/desktopBrowserAuth').then(({ initDesktopAuthDeepLink }) =>
      initDesktopAuthDeepLink().then((un) => {
        if (disposed) un();
        else unlisten = un;
      }),
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Re-fetch entitlements whenever the signed-in user changes (sign-in/out).
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.loading);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const sessionId = session?.user.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void useEntitlementStore.getState().refresh();
  }, [session]);

  // Low-friction upgrade: the first time a user has a session but no cloud
  // identity yet, seed their auth metadata (name/avatar) from the local profile.
  // Covers both the in-app email sign-up and the browser deep-link handoff, so a
  // free user's name and picture carry into their new cloud account with no re-entry.
  // The avatar is uploaded to Storage and only its short URL goes in the metadata.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    void (async () => {
      const current = useAuthStore.getState().session;
      if (!current) return;
      const meta = (current.user.user_metadata ?? {}) as Record<string, unknown>;
      const hasName = typeof meta.full_name === 'string' && meta.full_name.trim() !== '';
      const hasAvatar = typeof meta.avatar_url === 'string' && meta.avatar_url !== '';
      const local = currentLocalProfile();
      const seed: ProfileMeta = {};
      if (!hasName && local.name.trim() !== '') seed.full_name = local.name.trim();
      if (!hasAvatar && local.avatarDataUrl) {
        const { uploadAvatarFromDataUrl } = await import('./data/cloudAvatar');
        const url = await uploadAvatarFromDataUrl(local.avatarDataUrl);
        if (url) seed.avatar_url = url;
      }
      if (!cancelled && Object.keys(seed).length > 0) {
        await useAuthStore.getState().updateProfile(seed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // …and when the window regains focus or the network comes back: a purchase
  // made in the system browser (Stripe Checkout) activates on return, and an
  // offline start upgrades to Cloud mode as soon as connectivity allows.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const refreshEntitlements = () => void useEntitlementStore.getState().refresh();
    window.addEventListener('focus', refreshEntitlements);
    window.addEventListener('online', refreshEntitlements);
    return () => {
      window.removeEventListener('focus', refreshEntitlements);
      window.removeEventListener('online', refreshEntitlements);
    };
  }, []);

  // Calendars shared with this user (and their own shares). Receiving is free —
  // only creating a share needs the subscription.
  useSharing();

  // Desktop: check GitHub Releases for a newer build once per launch.
  useEffect(() => {
    void checkForAppUpdate();
  }, []);

  // First paint: show the calendar from the durable local store right away.
  // Assembling the full repository below waits on the OS keychain, CalDAV
  // discovery, and cloud fetches — seconds on a cold or offline start — and the
  // window renders nothing until `ready` flips. Reading local first paints in
  // milliseconds; the full pass then reconciles and replaces the events.
  useEffect(() => {
    void useCalendarStore.getState().init(createLocalRepository());
  }, []);

  // Re-initialise the repository when a connected account, the signed-in user, or
  // the Cloud subscription changes. Entering Cloud mode with an empty cloud seeds
  // it from the user's local events so their calendar is intact.
  useEffect(() => {
    let active = true;
    void (async () => {
      const enteringCloud = isCloudMode();
      const localBefore = useCalendarStore.getState().events;
      const repo = await createRepositoryAsync();
      if (!active) return;
      await useCalendarStore.getState().init(repo);
      if (!active) return;
      if (enteringCloud) {
        const cloudEmpty = useCalendarStore.getState().events.length === 0;
        if (cloudEmpty && localBefore.length > 0) {
          await useCalendarStore.getState().seedFrom(localBefore);
        }
        useCalendarStore.getState().notify('Cloud sync on');
      }
    })();
    return () => {
      active = false;
    };
  }, [connUser, connCalendarsStr, connGoogleUser, connGoogleCalendarsStr, sessionId, cloudActive, syncRevision]);

  // In Cloud mode, re-pull on window focus and on regaining connectivity, so
  // another device's changes appear and offline edits sync up the moment the
  // network is back — but never while an editor/overlay is open (don't disrupt
  // an in-progress edit).
  useEffect(() => {
    if (!isCloudMode()) return;
    const resync = () => {
      const ui = useUiStore.getState();
      const overlayOpen = Boolean(
        ui.quickEntry || ui.editor || ui.create || ui.taskEditor || ui.span ||
        ui.spanDay || ui.specialDayEditor || ui.categoryEditor || ui.dayBackground,
      );
      if (overlayOpen) return;
      void useCalendarStore.getState().refresh();
    };
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    return () => {
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [sessionId, cloudActive]);

  // On cloud activation, pull the subscriber's categories + settings from the
  // cloud (and seed an empty cloud from local). No-op in local mode.
  useEffect(() => {
    if (!isCloudMode()) return;
    void hydrateSettingsFromCloud();
  }, [sessionId, cloudActive]);

  // On cloud activation, pull the subscriber's day backgrounds (config + images)
  // and seed an empty cloud from local. No-op in local mode.
  useEffect(() => {
    if (!isCloudMode()) return;
    void hydrateDayBackgroundsFromCloud();
  }, [sessionId, cloudActive]);

  // On cloud activation, merge the subscriber's habit-tab entries with local
  // (and seed an empty cloud from local). No-op in local mode.
  useEffect(() => {
    if (!isCloudMode()) return;
    void hydrateHabitEntriesFromCloud();
  }, [sessionId, cloudActive]);

  // Resolve 'system' against the OS preference, keeping it live in system mode.
  useEffect(() => {
    if (theme !== 'system') {
      setResolvedTheme(theme);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setResolvedTheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // Decorative fills (day styles, event skins, day backgrounds) were drawn for
  // the light theme and glare against the dark one; ui/skinTone.css tones them
  // down behind this attribute. Set unconditionally — the CSS only acts in the
  // dark theme — so toggling themes needs no extra bookkeeping.
  useEffect(() => {
    document.documentElement.setAttribute('data-dim-skins', dimSkinsInDark ? 'on' : 'off');
  }, [dimSkinsInDark]);

  useEffect(() => {
    let soft: string;
    if (resolvedTheme === 'dark') {
      soft = getSoftAccent(accentColor).replace(/0\.12\)$/, '0.22)');
    } else {
      const preset = ACCENT_COLORS.find((c) => c.primary === accentColor);
      soft = preset ? preset.soft : getSoftAccent(accentColor);
    }
    document.documentElement.style.setProperty('--color-accent', accentColor);
    document.documentElement.style.setProperty('--color-accent-soft', soft);
  }, [accentColor, resolvedTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', fontScale.toString());
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--tile-scale', tileScale.toString());
  }, [tileScale]);

  // Browser build with a hosted backend: the web version keeps data in the
  // cloud, so it needs an account before showing the calendar. Desktop keeps
  // accounts optional (this gate never renders under Tauri). The gate also
  // handles the desktop app's browser-based sign-in handoff (?desktop=1).
  if (!IS_TAURI && isSupabaseConfigured()) {
    if (authLoading) return null;
    if (!session || isDesktopHandoff()) return <AuthGate />;
  }

  if (!ready) return null;
  return <Shell />;
}
