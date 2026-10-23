import { render, screen } from '@testing-library/react';
import { Settings } from './Settings';
import { useSettingsStore, type HabitTab } from '../../app/settingsStore';

describe('Settings Data panel - Habits export and import buttons', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      panel: 'data',
      habitTabs: [],
    });
  });

  it('renders Import habits button but hides Export habits button when there are no habit tabs', () => {
    render(<Settings />);

    expect(screen.getByText('Habit tracker data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import habits/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export habits/i })).toBeNull();
  });

  it('renders both Export habits and Import habits buttons when at least one habit tab exists', () => {
    const tabs: HabitTab[] = [
      { id: 'tab-1', name: 'Workout', icon: 'dumbbell', kind: 'check' },
    ];
    useSettingsStore.setState({ habitTabs: tabs });

    render(<Settings />);

    expect(screen.getByText('Habit tracker data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export habits/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import habits/i })).toBeInTheDocument();
  });
});
