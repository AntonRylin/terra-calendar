import { useEffect } from 'react';
import { useAuthStore } from '../../../auth/authStore';
import { useSettingsStore } from '../../../app/settingsStore';
import { useOnboardingStore } from '../onboardingStore';

/**
 * Optional last step (desktop): browser-based sign-in. The session returns via
 * the opencalendar:// deep link (App.tsx listener → authStore), so this step
 * just watches the auth store and celebrates when the session lands. Every
 * phase keeps "Sign in later" and the email fallback visible — no dead ends.
 */
export function SignInStep({ primaryRef }: { primaryRef: React.Ref<HTMLButtonElement> }) {
  const session = useAuthStore((s) => s.session);
  const phase = useOnboardingStore((s) => s.signInPhase);
  const error = useOnboardingStore((s) => s.signInError);
  const beginBrowserSignIn = useOnboardingStore((s) => s.beginBrowserSignIn);
  const markSignedIn = useOnboardingStore((s) => s.markSignedIn);
  const finish = useOnboardingStore((s) => s.finish);
  const back = useOnboardingStore((s) => s.back);

  useEffect(() => {
    if (session && phase !== 'signedIn') markSignedIn();
  }, [session, phase, markSignedIn]);

  const emailFallback = (
    <button
      className="onboarding-quiet"
      onClick={() => {
        finish('completed');
        useSettingsStore.getState().openSettings('account');
      }}
    >
      Or sign in with email in Settings → Account
    </button>
  );

  if (phase === 'signedIn' && session) {
    return (
      <>
        <h1 className="onboarding-title">You’re in</h1>
        <p className="onboarding-sub">
          Signed in as <b>{session.user.email}</b>. Purchases and cloud sync now follow your
          account.
        </p>
        <div className="onboarding-actions">
          <button ref={primaryRef} className="onboarding-btn primary" onClick={() => finish('completed')}>
            Finish
          </button>
        </div>
      </>
    );
  }

  if (phase === 'waiting') {
    return (
      <>
        <h1 className="onboarding-title">Check your browser</h1>
        <p className="onboarding-sub">
          <span className="onboarding-spinner" aria-hidden="true" /> Finish signing in in your
          browser — this window continues automatically.
        </p>
        <div className="onboarding-actions">
          <button ref={primaryRef} className="onboarding-btn" onClick={() => void beginBrowserSignIn()}>
            Open browser again
          </button>
          {emailFallback}
          <button className="onboarding-quiet strong" onClick={() => finish('completed')}>
            Sign in later
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="onboarding-title">One account, everywhere</h1>
      <p className="onboarding-sub">
        Optional — everything here works without one. An account carries purchases and cloud sync
        across your devices, and lets you use Terra Calendar in the browser.
      </p>
      {phase === 'error' && <p className="onboarding-error">{error}</p>}
      <div className="onboarding-actions">
        <button ref={primaryRef} className="onboarding-btn primary" onClick={() => void beginBrowserSignIn()}>
          Sign in with browser
        </button>
        {emailFallback}
        <button className="onboarding-quiet strong" onClick={() => finish('completed')}>
          Sign in later
        </button>
        <button className="onboarding-quiet" onClick={back}>
          Back
        </button>
      </div>
    </>
  );
}
