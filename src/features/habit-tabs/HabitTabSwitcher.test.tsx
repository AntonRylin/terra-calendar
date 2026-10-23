import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitTabSwitcher } from './HabitTabSwitcher';
import { useSettingsStore, type HabitTab } from '../../app/settingsStore';
import { useUiStore } from '../../app/uiStore';

const TABS: HabitTab[] = [
  { id: 'gym', name: 'Gym', icon: 'dumbbell', kind: 'check' },
  { id: 'money', name: 'Money', icon: 'dollar', kind: 'number' },
];

beforeEach(() => {
  useSettingsStore.setState({ habitTabsEnabled: true, habitTabs: TABS });
  useUiStore.setState({ activeHabitTab: null });
});

describe('HabitTabSwitcher', () => {
  it('renders nothing while the feature is disabled', () => {
    useSettingsStore.setState({ habitTabsEnabled: false });
    const { container } = render(<HabitTabSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no tabs are defined', () => {
    useSettingsStore.setState({ habitTabs: [] });
    const { container } = render(<HabitTabSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Events plus each tab, with Events selected by default', () => {
    render(<HabitTabSwitcher />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Events', 'Gym', 'Money']);
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a tab activates it, clicking Events returns to null', async () => {
    render(<HabitTabSwitcher />);
    await userEvent.click(screen.getByRole('tab', { name: 'Gym' }));
    expect(useUiStore.getState().activeHabitTab).toBe('gym');
    expect(screen.getByRole('tab', { name: 'Gym' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'false');

    await userEvent.click(screen.getByRole('tab', { name: 'Events' }));
    expect(useUiStore.getState().activeHabitTab).toBeNull();
  });

  it('treats a stale active id (deleted tab) as Events', () => {
    useUiStore.setState({ activeHabitTab: 'deleted-tab' });
    render(<HabitTabSwitcher />);
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
  });
});
