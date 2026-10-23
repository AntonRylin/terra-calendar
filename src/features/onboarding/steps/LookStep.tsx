import { useSettingsStore, ACCENT_COLORS, type ThemeMode } from '../../../app/settingsStore';
import { PaletteSelector } from '../../../ui/PaletteSelector';
import { useOnboardingStore } from '../onboardingStore';

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
  { id: 'sand', label: 'Sand' },
];

/** Theme + accent picked live — the calendar behind the overlay updates
 *  immediately, which is the whole point: instant "it's mine" gratification. */
export function LookStep({ primaryRef }: { primaryRef: React.Ref<HTMLButtonElement> }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const next = useOnboardingStore((s) => s.next);
  const back = useOnboardingStore((s) => s.back);

  return (
    <>
      <h1 className="onboarding-title">Pick your look</h1>
      <p className="onboarding-sub">Changes apply instantly — watch the calendar behind this card.</p>
      <div className="onboarding-field">
        <span className="onboarding-label">Theme</span>
        <div className="onboarding-theme-seg" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={theme === t.id}
              className={`onboarding-seg-btn${theme === t.id ? ' selected' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="onboarding-field">
        <span className="onboarding-label">Accent</span>
        <PaletteSelector
          value={accentColor}
          onChange={setAccentColor}
          presets={ACCENT_COLORS.map((c) => ({ value: c.primary, bg: c.primary }))}
          allowCustom
        />
      </div>
      <p className="onboarding-hint">
        This is just the start — days, events and categories each have their own styles in the
        category editor.
      </p>
      <div className="onboarding-actions">
        <button ref={primaryRef} className="onboarding-btn primary" onClick={next}>
          Continue
        </button>
        <button className="onboarding-quiet" onClick={back}>
          Back
        </button>
      </div>
    </>
  );
}
