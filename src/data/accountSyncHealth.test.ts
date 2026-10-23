import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createRepositoryAsync } from './createRepository';
import { useConnectionStore } from '../app/connectionStore';
import type { CalendarEvent } from '../core/types';

const remote = vi.hoisted(() => ({
  password: 'saved-password' as string | null,
  keychainError: false,
  readError: false as boolean | string,
  writeError: false,
}));
vi.mock('./caldav/credentials', () => ({ credentials: {
  get: async () => { if (remote.keychainError) throw new Error('Keychain unavailable'); return remote.password; },
} }));
vi.mock('./caldav/tauriTransport', () => ({ createTauriTransport: () => async ({ method }: { method: string }) => {
  if (method === 'REPORT' && remote.readError) throw typeof remote.readError === 'string' ? remote.readError : new Error('HTTP failed');
  if (method === 'PUT' && remote.writeError) return { status: 401, headers: {}, body: '' };
  return { status: method === 'PUT' ? 201 : 207, headers: { etag: 'v1' }, body: '<d:multistatus xmlns:d="DAV:" />' };
} }));
vi.mock('./jsonFileRepository', () => ({ JsonFileRepository: class {
  async load() { return { events: [] }; }
  async saveAll() {}
} }));

const config = {
  serverUrl: 'https://caldav.icloud.com', username: 'me@example.com', calendarUrl: 'https://caldav.icloud.com/home/',
  calendars: [{ url: 'https://caldav.icloud.com/home/', displayName: 'Home', enabled: true }],
};

describe('account sync health through the real repository', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(remote, { password: 'saved-password', keychainError: false, readError: false, writeError: false });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    useConnectionStore.getState().disconnectGoogle();
    useConnectionStore.getState().setCalDav(config);
  });
  afterEach(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });

  it.each([true, 'HTTP failed'])('shows a cached HTTP read failure (%s) as paused and clears it only after a successful sync', async (failure) => {
    remote.readError = failure;
    const repo = await createRepositoryAsync();
    await repo.load();
    expect(useConnectionStore.getState().syncHealth.apple).toMatchObject({ status: 'error', error: expect.stringContaining('HTTP failed') });
    await repo.saveAll([]); // a no-op write cannot prove a failed read has recovered
    expect(useConnectionStore.getState().syncHealth.apple?.status).toBe('error');
    remote.readError = false;
    await repo.load();
    expect(useConnectionStore.getState().syncHealth.apple?.status).toBe('connected');
    expect(useConnectionStore.getState().syncHealth.apple?.error).toBeUndefined();
  });

  it.each(['missing', 'unavailable'])('reports %s credentials without losing the configured account', async (kind) => {
    remote.password = kind === 'missing' ? null : 'saved-password';
    remote.keychainError = kind === 'unavailable';
    const repo = await createRepositoryAsync();
    await repo.load();
    expect(useConnectionStore.getState().syncHealth.apple?.status).toBe('error');
    expect(useConnectionStore.getState().caldav).toEqual(config);
  });

  it('reports authentication failures when saving local changes', async () => {
    const repo = await createRepositoryAsync();
    await repo.load();
    remote.writeError = true;
    await repo.saveAll([{ id: 'new', title: 'New', date: '2026-09-06', updatedAt: '2026-09-06T10:00:00Z' } as CalendarEvent]);
    expect(useConnectionStore.getState().syncHealth.apple).toMatchObject({ status: 'error', error: expect.stringContaining('401') });
  });

  it('does not let an old repository overwrite a reconnected account health', async () => {
    const oldRepo = await createRepositoryAsync();
    useConnectionStore.getState().retrySync('apple');
    const newRepo = await createRepositoryAsync();
    await newRepo.load();
    remote.readError = true;
    await oldRepo.load();
    expect(useConnectionStore.getState().syncHealth.apple?.status).toBe('connected');
  });
});
