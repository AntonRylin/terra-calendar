import { act, fireEvent, render, screen } from '@testing-library/react';
import { Settings } from './Settings';
import { useSettingsStore } from '../../app/settingsStore';
import { handleBack } from '../../app/androidBack';
import { MOBILE_QUERY } from '../../ui/useMediaQuery';

const desktopMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = ((query: string) => ({
    ...desktopMatchMedia(query),
    matches: query === MOBILE_QUERY,
  })) as typeof window.matchMedia;
  useSettingsStore.setState({ panel: null });
});

afterEach(() => {
  act(() => useSettingsStore.setState({ panel: null }));
  window.matchMedia = desktopMatchMedia;
});

const appBarTitle = () => document.querySelector('.ps-appbar-title')?.textContent;

describe('Settings on a phone', () => {
  it('opens on the section list, then one page per section, with back going up a level', () => {
    render(<Settings />);
    act(() => useSettingsStore.getState().openSettings('account'));

    expect(appBarTitle()).toBe('Settings');
    expect(document.querySelector('.settings-nav')).toBeNull();
    // Desktop-only sections are not offered on a phone.
    expect(screen.queryByText('AI / MCP Server')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Appearance/ }));
    expect(appBarTitle()).toBe('Appearance');
    expect(screen.queryByText(/Restore default layout|Layout is at defaults/)).toBeNull();

    // Android back: section → list → closed.
    act(() => void handleBack());
    expect(appBarTitle()).toBe('Settings');
    act(() => void handleBack());
    expect(useSettingsStore.getState().panel).toBeNull();
  });

  it('a deep link opens its page directly', () => {
    render(<Settings />);
    act(() => useSettingsStore.getState().openSettings('calendars'));
    expect(appBarTitle()).toBe('Calendars');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(appBarTitle()).toBe('Settings');
  });
});
