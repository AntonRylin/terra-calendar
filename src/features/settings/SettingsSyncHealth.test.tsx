import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { Settings } from './Settings';
import { useSettingsStore } from '../../app/settingsStore';
import { useConnectionStore } from '../../app/connectionStore';

const auth = vi.hoisted(() => ({ saved: 'old-password', fail: false, wait: undefined as Promise<void> | undefined }));
const config = {
  serverUrl: 'https://caldav.icloud.com', username: 'me@example.com', calendarUrl: '/home/',
  calendars: [{ url: '/home/', displayName: 'Home', enabled: false, writeDefault: false }],
};
vi.mock('../../data/caldav/credentials', () => ({ credentials: {
  save: async (_email: string, password: string) => { auth.saved = password; },
} }));
vi.mock('../../data/caldav/connect', () => ({ buildAppleAccount: async () => {
  await auth.wait;
  if (auth.fail) throw new Error('Unauthorized (401)');
  return { config: { ...config, calendars: [{ ...config.calendars[0], enabled: true }] } };
} }));

beforeEach(() => {
  localStorage.clear();
  auth.saved = 'old-password'; auth.fail = false; auth.wait = undefined;
  useSettingsStore.setState({ panel: 'calendars' });
  useConnectionStore.getState().disconnectGoogle();
  useConnectionStore.getState().setCalDav(config);
  useConnectionStore.setState({ syncHealth: { apple: { status: 'error', error: 'HTTP failed' } } });
});

it('shows the failing account and keeps the error visible when Settings is reopened', () => {
  const view = render(<Settings />);
  expect(screen.getByText(/Sync paused/)).toBeInTheDocument();
  expect(screen.getByText(/HTTP failed/)).toBeInTheDocument();
  view.unmount();
  render(<Settings />);
  expect(screen.getByText(/HTTP failed/)).toBeInTheDocument();
});

it('retry requests a repository rebuild even when the account details have not changed', () => {
  render(<Settings />);
  const before = useConnectionStore.getState().syncRevision;
  fireEvent.click(screen.getByRole('button', { name: 'Retry Apple Calendar sync' }));
  expect(useConnectionStore.getState().syncRevision).toBeGreaterThan(before);
  expect(screen.getByText(/Checking sync/)).toBeInTheDocument();
});

it('reconnects the same Apple account while preserving calendar choices', async () => {
  render(<Settings />);
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect Apple Calendar' }));
  expect(screen.getByPlaceholderText('Apple ID email')).toHaveValue('me@example.com');
  fireEvent.change(screen.getByPlaceholderText('App-specific password'), { target: { value: 'new-password' } });
  const before = useConnectionStore.getState().syncRevision;
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  await waitFor(() => expect(screen.queryByPlaceholderText('App-specific password')).toBeNull());
  expect(auth.saved).toBe('new-password');
  expect(useConnectionStore.getState().caldav?.calendars).toEqual(config.calendars);
  expect(useConnectionStore.getState().syncRevision).toBeGreaterThan(before);
});

it('a failed reconnect keeps the previous credentials and account', async () => {
  auth.fail = true;
  render(<Settings />);
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect Apple Calendar' }));
  fireEvent.change(screen.getByPlaceholderText('App-specific password'), { target: { value: 'bad-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  await screen.findByText('Unauthorized (401)');
  expect(auth.saved).toBe('old-password');
  expect(useConnectionStore.getState().caldav).toEqual(config);
});

it('updates to healthy status after a successful sync', () => {
  render(<Settings />);
  act(() => useConnectionStore.setState({ syncHealth: { apple: { status: 'connected' } } }));
  expect(screen.queryByText(/Sync paused/)).toBeNull();
  expect(screen.getByText(/Connected · Sync up to date/)).toBeInTheDocument();
});

it('does not restore an account disconnected while reconnect discovery was in flight', async () => {
  let finish!: () => void;
  auth.wait = new Promise<void>((resolve) => { finish = resolve; });
  render(<Settings />);
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect Apple Calendar' }));
  fireEvent.change(screen.getByPlaceholderText('App-specific password'), { target: { value: 'new-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  act(() => useConnectionStore.getState().disconnectCalDav());
  await act(async () => { finish(); await auth.wait; });
  expect(useConnectionStore.getState().caldav).toBeUndefined();
  expect(auth.saved).toBe('old-password');
});
