import { useSettingsStore } from '../../../app/settingsStore';
import { useOnboardingStore } from '../onboardingStore';

export function CalendarsStep({ primaryRef }: { primaryRef: React.Ref<HTMLButtonElement> }) {
  const next = useOnboardingStore((s) => s.next);
  const back = useOnboardingStore((s) => s.back);
  const finish = useOnboardingStore((s) => s.finish);

  return (
    <>
      <h1 className="onboarding-title">Bring your calendars</h1>
      <p className="onboarding-sub">
        Connect Apple iCloud and Google Calendar — at the same time, if you like. Everything shows
        merged, syncs two-way, and you choose which calendars new events are written to.
      </p>
      <div className="onboarding-actions">
        <button
          ref={primaryRef}
          className="onboarding-btn primary"
          onClick={() => {
            // Close the tour first so Settings opens on a clean screen.
            finish('completed');
            useSettingsStore.getState().openSettings('calendars');
          }}
        >
          Open calendar settings
        </button>
        <button className="onboarding-quiet" onClick={next}>
          Not now
        </button>
        <button className="onboarding-quiet" onClick={back}>
          Back
        </button>
      </div>
    </>
  );
}
