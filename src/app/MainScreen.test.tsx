import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { useSettingsStore } from './settingsStore';

// Stub the panels: this suite is about the shell's layout, not what the
// upcoming stack, minimap, or calendar render inside it.
vi.mock('./panels', async () => {
  const actual = await vi.importActual<typeof import('./panels')>('./panels');
  return {
    ...actual,
    panelRegistry: {
      'upcoming-stack': () => <div>UPCOMING</div>,
      'year-circle': () => <div>MINIMAP</div>,
      'month-grid': () => <div>CALENDAR</div>,
    },
  };
});

vi.mock('./useReminderScheduler', () => ({ useReminderScheduler: () => {} }));

import { MainScreen } from './MainScreen';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ sidebarCollapsed: false, sidebarWidth: 30, sidebarSplit: 65 });
});

describe('MainScreen side panel', () => {
  it('shows the panels and the resize handles by default', () => {
    const { container } = render(<MainScreen />);

    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
    expect(screen.getByText('MINIMAP')).toBeInTheDocument();
    expect(container.querySelector('.sidebar')).not.toBeNull();
    expect(container.querySelector('.resize-handle-h')).not.toBeNull();
    expect(container.querySelector('.main-screen.is-sidebar-collapsed')).toBeNull();
  });

  it('drops the panel and its handles when collapsed, keeping the calendar', () => {
    useSettingsStore.setState({ sidebarCollapsed: true });
    const { container } = render(<MainScreen />);

    expect(screen.queryByText('UPCOMING')).not.toBeInTheDocument();
    expect(screen.queryByText('MINIMAP')).not.toBeInTheDocument();
    expect(container.querySelector('.sidebar')).toBeNull();
    expect(container.querySelector('.resize-handle-h')).toBeNull();
    expect(container.querySelector('.resize-handle-v')).toBeNull();

    expect(screen.getByText('CALENDAR')).toBeInTheDocument();
    const screenEl = container.querySelector('.main-screen') as HTMLElement;
    expect(screenEl.classList.contains('is-sidebar-collapsed')).toBe(true);
    expect(screenEl.style.getPropertyValue('--sidebar-width')).toBe('0%');
  });

  it('toggles the panel with Ctrl+B, and back again', () => {
    render(<MainScreen />);
    expect(screen.getByText('UPCOMING')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.queryByText('UPCOMING')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
  });

  it('leaves a plain B alone so typing elsewhere is unaffected', () => {
    render(<MainScreen />);

    fireEvent.keyDown(window, { key: 'b' });

    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
  });
});
