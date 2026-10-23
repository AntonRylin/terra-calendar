import { create } from 'zustand';
import { useSettingsStore, ONBOARDING_VERSION } from '../../app/settingsStore';

export type OnboardingStep = 'welcome' | 'look' | 'calendars' | 'signin';

export type SignInPhase = 'idle' | 'waiting' | 'error' | 'signedIn';

export interface ShouldShowOnboardingArgs {
  /** Persisted settingsStore.onboardingCompletedVersion. */
  completedVersion: number;
  eventsCount: number;
  categoriesCount: number;
  hasSession: boolean;
}

/**
 * Whether the first-run tour should show. Version-stale AND the device looks
 * fresh: anyone with events, category designs, or a signed-in account has
 * clearly used the app before this build introduced the tour — don't tour
 * them (the host still latches the version so we never re-evaluate).
 */
export function shouldShowOnboarding(a: ShouldShowOnboardingArgs): boolean {
  if (a.completedVersion >= ONBOARDING_VERSION) return false;
  return a.eventsCount === 0 && a.categoriesCount === 0 && !a.hasSession;
}

interface OnboardingState {
  open: boolean;
  steps: OnboardingStep[];
  index: number;
  signInPhase: SignInPhase;
  signInError: string;
  start(steps: OnboardingStep[]): void;
  /** Advance; finishing past the last step completes the tour. */
  next(): void;
  back(): void;
  /** Open the hosted sign-in page in the system browser (desktop). */
  beginBrowserSignIn(): Promise<void>;
  /** The session arrived (deep link → authStore) — show the finish state. */
  markSignedIn(): void;
  finish(outcome: 'completed' | 'skipped'): void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  open: false,
  steps: [],
  index: 0,
  signInPhase: 'idle',
  signInError: '',

  start: (steps) => {
    if (steps.length === 0) return;
    set({ open: true, steps, index: 0, signInPhase: 'idle', signInError: '' });
  },

  next: () => {
    const { index, steps } = get();
    if (index >= steps.length - 1) {
      get().finish('completed');
      return;
    }
    set({ index: index + 1 });
  },

  back: () => {
    const { index } = get();
    if (index > 0) set({ index: index - 1 });
  },

  async beginBrowserSignIn() {
    set({ signInPhase: 'waiting', signInError: '' });
    const { startBrowserSignIn } = await import('../../auth/desktopBrowserAuth');
    const result = await startBrowserSignIn();
    if (result.error) {
      // Only downgrade if a session didn't land in the meantime.
      if (get().signInPhase === 'waiting') {
        set({ signInPhase: 'error', signInError: result.error });
      }
    }
  },

  markSignedIn: () => set({ signInPhase: 'signedIn', signInError: '' }),

  finish: () => {
    useSettingsStore.getState().completeOnboarding();
    set({ open: false, index: 0, signInPhase: 'idle', signInError: '' });
  },
}));
