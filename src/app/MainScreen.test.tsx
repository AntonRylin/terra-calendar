import { render, screen, fireEvent, act } from '@testing-library/react';
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
import { MOBILE_QUERY } from '../ui/useMediaQuery';
import { openMobileMenu, useMobileMenuStore } from './mobileMenu';
import { useUiStore } from './uiStore';
import { handleBack } from './androidBack';

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

describe('MainScreen on a phone', () => {
  const desktopMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      ...desktopMatchMedia(query),
      matches: query === MOBILE_QUERY,
    })) as typeof window.matchMedia;
    useMobileMenuStore.setState({ open: false });
  });

  afterEach(() => {
    window.matchMedia = desktopMatchMedia;
  });

  it('fills the screen with the calendar: no tab bar, no minimap, Upcoming in a closed drawer', () => {
    const { container } = render(<MainScreen />);

    expect(screen.getByText('CALENDAR')).toBeInTheDocument();
    expect(screen.queryByText('MINIMAP')).not.toBeInTheDocument();
    expect(container.querySelector('.mobile-tabbar')).toBeNull();
    expect(container.querySelector('.sidebar')).toBeNull();

    const drawer = container.querySelector('#mobile-drawer') as HTMLElement;
    expect(drawer).toContainElement(screen.getByText('UPCOMING'));
    expect(container.querySelector('.mobile-drawer-root.is-open')).toBeNull();
    expect(drawer).toHaveAttribute('inert');
  });

  it('opens the drawer and closes it from the back gesture, Escape and the scrim', () => {
    const { container } = render(<MainScreen />);
    const isOpen = () => container.querySelector('.mobile-drawer-root.is-open') !== null;

    act(() => openMobileMenu());
    expect(isOpen()).toBe(true);
    act(() => {
      handleBack();
    });
    expect(isOpen()).toBe(false);

    act(() => openMobileMenu());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOpen()).toBe(false);

    act(() => openMobileMenu());
    fireEvent.click(container.querySelector('.mobile-drawer-scrim')!);
    expect(isOpen()).toBe(false);
  });

  it('closes the drawer once an item in it navigates the calendar', () => {
    const { container } = render(<MainScreen />);

    act(() => openMobileMenu());
    act(() => useUiStore.getState().setViewedDate('2031-05-04'));

    expect(container.querySelector('.mobile-drawer-root.is-open')).toBeNull();
  });

  it('shows a floating "+" that adds an event on the selected day', () => {
    useUiStore.setState({ selectedDate: '2031-05-04', quickEntry: null });
    render(<MainScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^New event on/ }));

    expect(useUiStore.getState().quickEntry?.date).toBe('2031-05-04');
  });
});
