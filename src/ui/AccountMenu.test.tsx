import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from './AccountMenu';
import { useSettingsStore } from '../app/settingsStore';

describe('AccountMenu', () => {
  it('opens settings on the account section when Settings is clicked', async () => {
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    expect(useSettingsStore.getState().panel).toBe('account');
  });

  it('opens the calendars section from the menu', async () => {
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Calendars' }));
    expect(useSettingsStore.getState().panel).toBe('calendars');
  });
});
