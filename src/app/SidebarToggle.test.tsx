import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarToggle } from './SidebarToggle';
import { useSettingsStore } from './settingsStore';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ sidebarCollapsed: false });
});

describe('SidebarToggle', () => {
  it('hides the panel on click and offers to bring it back', () => {
    render(<SidebarToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide side panel' }));
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);

    const showBtn = screen.getByRole('button', { name: 'Show side panel' });
    expect(showBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(showBtn);
    expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
  });

  it('reports the panel as expanded while it is showing', () => {
    render(<SidebarToggle />);

    const btn = screen.getByRole('button', { name: 'Hide side panel' });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-controls', 'side-panel');
    expect(btn.getAttribute('title')).toMatch(/Hide side panel \((⌘B|Ctrl\+B)\)/);
  });
});
