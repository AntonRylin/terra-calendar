import { useOnboardingStore } from '../onboardingStore';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function WelcomeStep({ primaryRef }: { primaryRef: React.Ref<HTMLButtonElement> }) {
  const next = useOnboardingStore((s) => s.next);
  const finish = useOnboardingStore((s) => s.finish);
  return (
    <>
      <h1 className="onboarding-title">Make it yours</h1>
      <p className="onboarding-sub">
        The calendar that looks the way you want — style your days, events and
        categories with your own colors, gradients and images.
      </p>
      <div className="onboarding-features">
        <div className="onboarding-feature">
          <span className="onboarding-feature-icon">🎨</span>
          <b>Customization</b>
          <span>Gradients, glow effects and images on any day</span>
        </div>
        <div className="onboarding-feature">
          <span className="onboarding-feature-icon">🔄</span>
          <b>Apple + Google</b>
          <span>Both calendars, synced two-way, side by side</span>
        </div>
        <div className="onboarding-feature">
          <span className="onboarding-feature-icon">🔒</span>
          <b>Private</b>
          <span>{IS_TAURI ? 'Local-first — no account needed' : 'Your data, your account, no trackers'}</span>
        </div>
      </div>
      <div className="onboarding-actions">
        <button ref={primaryRef} className="onboarding-btn primary" onClick={next}>
          Get started
        </button>
        <button className="onboarding-quiet" onClick={() => finish('skipped')}>
          Skip tour
        </button>
      </div>
    </>
  );
}
