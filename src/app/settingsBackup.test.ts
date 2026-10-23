/** Export/import of the *whole* settings backup: the main store plus the local
 *  profile and the preferences that live outside it (see settingsExtras). */
import { exportSettings, importSettings, useSettingsStore } from './settingsStore';
import { useProfileStore } from './profileStore';
import { useCustomStylesStore, CUSTOM_STYLES_KEY } from './customStylesStore';

describe('settings backup', () => {
  beforeEach(() => {
    localStorage.clear();
    useProfileStore.setState({ name: '', avatarDataUrl: null });
  });

  it('includes the out-of-store preferences and the local profile', () => {
    localStorage.setItem('upcoming_density', '1.4');
    localStorage.setItem('upcoming_compact_mode', 'true');
    localStorage.setItem('open-calendar.weather-city', 'Lisbon');
    localStorage.setItem('open-calendar.weather-coords', JSON.stringify({ lat: 38.7, lon: -9.1 }));
    localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify([]));
    useProfileStore.setState({ name: 'Ada', avatarDataUrl: 'data:image/webp;base64,AA' });
    useSettingsStore.getState().setTheme('dark');

    const bundle = JSON.parse(exportSettings());

    expect(bundle.version).toBe(2);
    expect(bundle.settings.theme).toBe('dark');
    expect(bundle.profile).toEqual({ name: 'Ada', avatarDataUrl: 'data:image/webp;base64,AA' });
    expect(bundle.extras).toEqual({
      upcoming_density: '1.4',
      upcoming_compact_mode: 'true',
      'open-calendar.weather-city': 'Lisbon',
      'open-calendar.weather-coords': '{"lat":38.7,"lon":-9.1}',
      [CUSTOM_STYLES_KEY]: '[]',
    });
  });

  it('leaves events, tasks and calendar credentials out of the backup', () => {
    localStorage.setItem('open-calendar.store', '[{"id":"e1"}]');
    localStorage.setItem('open-calendar.tasks', '[{"id":"t1"}]');
    localStorage.setItem('open-calendar.connection', '{"caldav":{"username":"me"}}');
    localStorage.setItem('open-calendar.special-days', '{"2026-01-01":{}}');
    localStorage.setItem('open-calendar.habit-entries', '{"2026-01-01":{}}');

    const bundle = JSON.parse(exportSettings());

    expect(bundle.extras).toEqual({});
    expect(JSON.stringify(bundle)).not.toContain('caldav');
  });

  it('round-trips extras and the profile, and flags the ones needing a restart', () => {
    localStorage.setItem('upcoming_density', '1.4');
    localStorage.setItem('open-calendar.weather-city', 'Lisbon');
    useProfileStore.setState({ name: 'Ada', avatarDataUrl: null });
    const bundle = exportSettings();

    localStorage.clear();
    useProfileStore.setState({ name: 'Someone else', avatarDataUrl: null });

    const result = importSettings(bundle);

    expect(result).toEqual({ ok: true, restartNeeded: true });
    expect(localStorage.getItem('upcoming_density')).toBe('1.4');
    expect(localStorage.getItem('open-calendar.weather-city')).toBe('Lisbon');
    expect(useProfileStore.getState().name).toBe('Ada');
  });

  it('applies imported custom styles live, without asking for a restart', () => {
    const templates = [
      { id: 'tpl1', name: 'Sunset', recipe: { kind: 'raw', source: 'background: red;' } },
    ];
    const bundle = JSON.stringify({
      kind: 'open-calendar-settings',
      version: 2,
      settings: { theme: 'dark' },
      extras: { [CUSTOM_STYLES_KEY]: JSON.stringify(templates) },
    });

    expect(importSettings(bundle)).toEqual({ ok: true });
    expect(useCustomStylesStore.getState().templates).toEqual(templates);
  });

  it('reports no restart when the imported preferences match what is already stored', () => {
    localStorage.setItem('upcoming_density', '1.4');
    const bundle = exportSettings();

    expect(importSettings(bundle)).toEqual({ ok: true });
  });

  it('ignores keys outside the backup whitelist', () => {
    const bundle = JSON.stringify({
      kind: 'open-calendar-settings',
      version: 2,
      settings: { theme: 'dark' },
      extras: { 'open-calendar.store': '[]', 'sb-auth-token': 'stolen' },
    });

    expect(importSettings(bundle)).toEqual({ ok: true });
    expect(localStorage.getItem('open-calendar.store')).toBeNull();
    expect(localStorage.getItem('sb-auth-token')).toBeNull();
  });

  it('still imports a v1 file (settings only)', () => {
    const v1 = JSON.stringify({
      kind: 'open-calendar-settings',
      version: 1,
      settings: { theme: 'dark', accentColor: '#ff2d55' },
    });

    expect(importSettings(v1)).toEqual({ ok: true });
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().accentColor).toBe('#ff2d55');
  });
});
