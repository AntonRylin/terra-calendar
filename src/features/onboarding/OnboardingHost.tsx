import { useEffect, useRef } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { useSettingsStore, ONBOARDING_VERSION } from '../../app/settingsStore';
import { useCalendarStore } from '../../app/store';
import { useAuthStore } from '../../auth/authStore';
import { isSupabaseConfigured } from '../../data/supabaseClient';
import { useOnboardingStore, shouldShowOnboarding, type OnboardingStep } from './onboardingStore';
import { WelcomeStep } from './steps/WelcomeStep';
import { LookStep } from './steps/LookStep';
import { CalendarsStep } from './steps/CalendarsStep';
import { SignInStep } from './steps/SignInStep';
import { useIsMobile } from '../../ui/useMediaQuery';
import { useAndroidBack } from '../../app/androidBack';
import './onboarding.css';

/** Phone welcome screens lead with one big picture per step. */
const PHONE_HERO: Record<OnboardingStep, string> = {
  welcome: '📅',
  look: '🎨',
  calendars: '🔄',
  signin: '☁️',
};

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function stepsForThisBuild(hasSession: boolean): OnboardingStep[] {
  // Web users just signed in through the AuthGate and can't connect
  // Apple/Google (desktop-only) — a short intro is all they need.
  if (!IS_TAURI) return ['welcome', 'look'];
  const steps: OnboardingStep[] = ['welcome', 'look', 'calendars'];
  if (isSupabaseConfigured() && !hasSession) steps.push('signin');
  return steps;
}

/** Android back goes to the previous page of the tour (on the first page it
 *  leaves the app). Keyed by page so each page registers afresh: a back press
 *  consumes the registration. */
function BackToPreviousStep() {
  useAndroidBack(true, () => useOnboardingStore.getState().back());
  return null;
}

/**
 * Self-gating first-run tour host. Mounted once in Shell(); decides exactly
 * once per launch — after the authoritative settings source has hydrated and
 * the calendar is ready — whether this device gets the tour. Existing devices
 * (events / categories / a session already present) are silently latched
 * instead of toured.
 */
export function OnboardingHost() {
  const open = useOnboardingStore((s) => s.open);
  const steps = useOnboardingStore((s) => s.steps);
  const index = useOnboardingStore((s) => s.index);
  const settingsHydrated = useSettingsStore((s) => s.settingsHydrated);
  const completedVersion = useSettingsStore((s) => s.onboardingCompletedVersion);
  const calendarReady = useCalendarStore((s) => s.ready);
  const authLoading = useAuthStore((s) => s.loading);
  const decided = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (decided.current) return;
    if (!settingsHydrated || !calendarReady) return;
    // Wait for the initial session check so a signed-in device isn't toured
    // (loading resolves immediately when Supabase isn't configured).
    if (isSupabaseConfigured() && authLoading) return;
    decided.current = true;

    if (completedVersion >= ONBOARDING_VERSION) return;
    const hasSession = Boolean(useAuthStore.getState().session);
    const show = shouldShowOnboarding({
      completedVersion,
      eventsCount: useCalendarStore.getState().events.length,
      categoriesCount: Object.keys(useSettingsStore.getState().categories).length,
      hasSession,
    });
    if (show) {
      useOnboardingStore.getState().start(stepsForThisBuild(hasSession));
    } else {
      // Existing user updating into this build — never show, never re-check.
      useSettingsStore.getState().completeOnboarding();
    }
  }, [settingsHydrated, calendarReady, authLoading, completedVersion]);

  // Escape skips the whole tour; focus the step's primary action on each step.
  useEffect(() => {
    if (!open) return;
    // Phones: no keyboard focus ring on the pill (touch users never see focus).
    const timer = setTimeout(() => {
      if (!isMobile) primaryRef.current?.focus();
    }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useOnboardingStore.getState().finish('skipped');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, index, isMobile]);

  if (!open) return null;

  const step = steps[index];

  return (
    <FloatingPortal>
      <div className={`onboarding-overlay${isMobile ? ' is-phone' : ''}`}>
        <div className="onboarding-card" role="dialog" aria-modal="true" aria-label="Welcome to Terra Calendar">
          {isMobile && (
            <div className="onboarding-hero" aria-hidden="true">
              <span className="onboarding-hero-emoji">{PHONE_HERO[step]}</span>
            </div>
          )}
          <div className="onboarding-brand" aria-hidden="true">
            <span className="onboarding-mark">OC</span>
            Terra Calendar
          </div>
          {index > 0 && <BackToPreviousStep key={index} />}
          {step === 'welcome' && <WelcomeStep primaryRef={primaryRef} />}
          {step === 'look' && <LookStep primaryRef={primaryRef} />}
          {step === 'calendars' && <CalendarsStep primaryRef={primaryRef} />}
          {step === 'signin' && <SignInStep primaryRef={primaryRef} />}
          {steps.length > 1 && (
            <div className="onboarding-dots" aria-label={`Step ${index + 1} of ${steps.length}`}>
              {steps.map((s, i) => (
                <span key={s} className={`onboarding-dot${i === index ? ' active' : ''}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
