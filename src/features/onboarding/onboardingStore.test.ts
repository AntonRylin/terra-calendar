import { describe, it, expect, vi, beforeEach } from 'vitest';

// Keep browser sign-in inert and controllable.
const startBrowserSignIn = vi.fn<() => Promise<{ error?: string }>>();
vi.mock('../../auth/desktopBrowserAuth', () => ({
  startBrowserSignIn: () => startBrowserSignIn(),
}));

import { useOnboardingStore, shouldShowOnboarding } from './onboardingStore';
import { useSettingsStore, ONBOARDING_VERSION } from '../../app/settingsStore';

describe('shouldShowOnboarding', () => {
  const fresh = { completedVersion: 0, eventsCount: 0, categoriesCount: 0, hasSession: false };

  it('shows for a fresh device', () => {
    expect(shouldShowOnboarding(fresh)).toBe(true);
  });

  it('never shows once the current version completed', () => {
    expect(shouldShowOnboarding({ ...fresh, completedVersion: ONBOARDING_VERSION })).toBe(false);
    expect(shouldShowOnboarding({ ...fresh, completedVersion: ONBOARDING_VERSION + 5 })).toBe(false);
  });

  it('suppresses for existing users (events, categories, or a session)', () => {
    expect(shouldShowOnboarding({ ...fresh, eventsCount: 3 })).toBe(false);
    expect(shouldShowOnboarding({ ...fresh, categoriesCount: 1 })).toBe(false);
    expect(shouldShowOnboarding({ ...fresh, hasSession: true })).toBe(false);
  });
});

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    startBrowserSignIn.mockReset();
    useSettingsStore.setState({ onboardingCompletedVersion: 0 });
    useOnboardingStore.setState({
      open: false,
      steps: [],
      index: 0,
      signInPhase: 'idle',
      signInError: '',
    });
  });

  it('start() opens at the first step; empty step lists are ignored', () => {
    useOnboardingStore.getState().start([]);
    expect(useOnboardingStore.getState().open).toBe(false);
    useOnboardingStore.getState().start(['welcome', 'look']);
    expect(useOnboardingStore.getState()).toMatchObject({ open: true, index: 0 });
  });

  it('next()/back() stay in bounds; next past the end finishes and latches', () => {
    useOnboardingStore.getState().start(['welcome', 'look']);
    useOnboardingStore.getState().back();
    expect(useOnboardingStore.getState().index).toBe(0);
    useOnboardingStore.getState().next();
    expect(useOnboardingStore.getState().index).toBe(1);
    useOnboardingStore.getState().next(); // past the last step
    expect(useOnboardingStore.getState().open).toBe(false);
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('finish() latches for both outcomes and resets transient state', () => {
    useOnboardingStore.getState().start(['welcome']);
    useOnboardingStore.getState().finish('skipped');
    expect(useOnboardingStore.getState().open).toBe(false);
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('beginBrowserSignIn() enters waiting and stays there on success', async () => {
    startBrowserSignIn.mockResolvedValue({});
    await useOnboardingStore.getState().beginBrowserSignIn();
    expect(useOnboardingStore.getState().signInPhase).toBe('waiting');
  });

  it('beginBrowserSignIn() surfaces errors', async () => {
    startBrowserSignIn.mockResolvedValue({ error: 'browser exploded' });
    await useOnboardingStore.getState().beginBrowserSignIn();
    expect(useOnboardingStore.getState()).toMatchObject({
      signInPhase: 'error',
      signInError: 'browser exploded',
    });
  });

  it('a session landing mid-flight wins over a late error', async () => {
    let resolveOpen: (v: { error?: string }) => void;
    startBrowserSignIn.mockReturnValue(new Promise((r) => (resolveOpen = r)));
    const pending = useOnboardingStore.getState().beginBrowserSignIn();
    useOnboardingStore.getState().markSignedIn();
    resolveOpen!({ error: 'too late' });
    await pending;
    expect(useOnboardingStore.getState().signInPhase).toBe('signedIn');
  });
});
