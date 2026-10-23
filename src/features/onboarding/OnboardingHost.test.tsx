import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';

// Unconfigured backend keeps the host's gating independent of auth loading,
// and jsdom (no __TAURI_INTERNALS__) exercises the web step list.
vi.mock('../../data/supabaseClient', () => ({
  isSupabaseConfigured: () => false,
  getSupabase: () => {
    throw new Error('unconfigured');
  },
}));
vi.mock('../../auth/desktopBrowserAuth', () => ({
  startBrowserSignIn: vi.fn().mockResolvedValue({}),
}));

import { OnboardingHost } from './OnboardingHost';
import { SignInStep } from './steps/SignInStep';
import { useOnboardingStore } from './onboardingStore';
import { useSettingsStore, ONBOARDING_VERSION } from '../../app/settingsStore';
import { useCalendarStore } from '../../app/store';
import { useAuthStore } from '../../auth/authStore';

function resetStores(opts: { completedVersion?: number; events?: number; categories?: number } = {}) {
  localStorage.clear();
  useSettingsStore.setState({
    settingsHydrated: true,
    onboardingCompletedVersion: opts.completedVersion ?? 0,
    categories:
      opts.categories && opts.categories > 0
        ? { Work: { type: 'color', value: '#ff0000' } }
        : {},
  });
  useCalendarStore.setState({
    ready: true,
    events: Array.from({ length: opts.events ?? 0 }, (_, i) => ({ id: String(i) })) as never,
  });
  useAuthStore.setState({ session: null, loading: false });
  useOnboardingStore.setState({ open: false, steps: [], index: 0, signInPhase: 'idle', signInError: '' });
}

describe('OnboardingHost', () => {
  beforeEach(() => resetStores());

  it('shows the web tour on a fresh device and walks to the end', async () => {
    render(<OnboardingHost />);
    expect(await screen.findByText('Make it yours')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByText('Pick your look')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // Web tour has two steps — finishing latches and closes.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('renders nothing once the version is latched', () => {
    resetStores({ completedVersion: ONBOARDING_VERSION });
    render(<OnboardingHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useOnboardingStore.getState().open).toBe(false);
  });

  it('suppresses AND latches for an existing device (has events)', () => {
    resetStores({ events: 4 });
    render(<OnboardingHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('waits for settings hydration before deciding', () => {
    useSettingsStore.setState({ settingsHydrated: false });
    render(<OnboardingHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The persisted flag must not be latched by a premature decision.
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(0);
  });

  it('Escape skips the tour and latches', async () => {
    render(<OnboardingHost />);
    expect(await screen.findByText('Make it yours')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('shows step dots for multi-step tours', async () => {
    render(<OnboardingHost />);
    expect(await screen.findByLabelText('Step 1 of 2')).toBeInTheDocument();
  });
});

describe('SignInStep', () => {
  beforeEach(() => {
    resetStores();
    useOnboardingStore.setState({ open: true, steps: ['signin'], index: 0 });
  });

  it('idle: primary browser sign-in with skip and email fallback visible', () => {
    render(<SignInStep primaryRef={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sign in with browser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in later' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email in Settings/ })).toBeInTheDocument();
  });

  it('waiting: keeps retry, email fallback, and skip visible (no dead end)', () => {
    useOnboardingStore.setState({ signInPhase: 'waiting' });
    render(<SignInStep primaryRef={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open browser again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email in Settings/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in later' })).toBeInTheDocument();
  });

  it('error: shows the message and every exit', () => {
    useOnboardingStore.setState({ signInPhase: 'error', signInError: 'no browser found' });
    render(<SignInStep primaryRef={() => {}} />);
    expect(screen.getByText('no browser found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with browser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in later' })).toBeInTheDocument();
  });

  it('auto-advances to the signed-in state when the session arrives', async () => {
    useOnboardingStore.setState({ signInPhase: 'waiting' });
    render(<SignInStep primaryRef={() => {}} />);
    act(() => {
      useAuthStore.setState({
        session: { user: { email: 'anton@example.com' } } as unknown as Session,
        loading: false,
      });
    });
    expect(await screen.findByText('You’re in')).toBeInTheDocument();
    expect(screen.getByText('anton@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(useOnboardingStore.getState().open).toBe(false);
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('"Sign in later" finishes the tour', async () => {
    render(<SignInStep primaryRef={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in later' }));
    expect(useOnboardingStore.getState().open).toBe(false);
    expect(useSettingsStore.getState().onboardingCompletedVersion).toBe(ONBOARDING_VERSION);
  });

  it('email fallback finishes the tour and opens Settings → Account', async () => {
    render(<SignInStep primaryRef={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /email in Settings/ }));
    expect(useOnboardingStore.getState().open).toBe(false);
    expect(useSettingsStore.getState().panel).toBe('account');
  });
});
