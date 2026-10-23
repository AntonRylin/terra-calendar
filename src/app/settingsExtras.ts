/**
 * The user's settings that live *outside* {@link ./settingsStore} — small
 * preferences written straight to localStorage by the components that own them
 * (the Upcoming panel's display toggles, the weather location, saved custom
 * style templates).
 *
 * They belong in a settings backup just as much as the main store does, so
 * export/import collects them here rather than teaching every component about
 * the backup format.
 *
 * Deliberately NOT included:
 *   - `open-calendar.connection` — CalDAV/Google account config; the secrets sit
 *     in the OS keychain and a settings file is the wrong place for either.
 *   - `open-calendar.store` / `.tasks` / `.habit-entries` / `.special-days` —
 *     that's your data, not your settings (and day backgrounds live in IndexedDB).
 *   - `open-calendar.sync.baseline`, `.fired-reminders`, `.entitlements.*` —
 *     device-local bookkeeping that would be actively wrong to copy to another
 *     machine.
 */

import { CUSTOM_STYLES_KEY, reloadCustomStyles } from './customStylesStore';

/** Key prefixes whose every key is a user preference (the Upcoming panel's). */
const EXTRA_PREFIXES = ['upcoming_'];

/** Individually named preference keys outside the main settings blob. */
const EXTRA_KEYS = [
  // Weather location picked in the month grid's weather bar.
  'open-calendar.weather-city',
  'open-calendar.weather-coords',
  // "Save as style" templates from the day-background builder / CSS editor.
  CUSTOM_STYLES_KEY,
];

/** Keys that are re-read live on import; everything else only takes effect on
 *  the next launch, because its component reads localStorage once at mount. */
const LIVE_KEYS = new Set<string>([CUSTOM_STYLES_KEY]);

function isExtraKey(key: string): boolean {
  return EXTRA_KEYS.includes(key) || EXTRA_PREFIXES.some((p) => key.startsWith(p));
}

/** A snapshot of every out-of-store preference, as raw JSON/string values. */
export function collectSettingsExtras(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isExtraKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value != null) out[key] = value;
    }
  } catch {
    // Storage unavailable (private mode) — the main settings blob still exports.
  }
  return out;
}

/**
 * Apply an `extras` section from a settings file. Unknown keys are ignored —
 * the whitelist is enforced on the way in too, so a hand-edited file can't write
 * arbitrary localStorage entries.
 *
 * Returns true when a preference that its owner only reads at mount changed, so
 * the caller can tell the user a restart is needed to see it.
 */
export function applySettingsExtras(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  let restartNeeded = false;
  let customStylesChanged = false;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string' || !isExtraKey(key)) continue;
    try {
      if (localStorage.getItem(key) === value) continue;
      localStorage.setItem(key, value);
    } catch {
      continue;
    }
    if (key === CUSTOM_STYLES_KEY) customStylesChanged = true;
    if (!LIVE_KEYS.has(key)) restartNeeded = true;
  }
  // Custom styles re-register their cosmetics immediately, so imported category
  // and day styles resolve without a relaunch.
  if (customStylesChanged) reloadCustomStyles();
  return restartNeeded;
}
