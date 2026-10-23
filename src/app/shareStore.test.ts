import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Share } from '../data/sharing/types';

const updateShare = vi.fn(async () => {});
vi.mock('../data/sharing/sharesApi', () => ({
  listOwnedShares: vi.fn(async () => []),
  createShare: vi.fn(),
  deleteShare: vi.fn(async () => {}),
  updateShare: (...args: unknown[]) => updateShare(...(args as [])),
}));

const { useShareStore } = await import('./shareStore');

const share = (id: string, extra: Partial<Share> = {}): Share => ({
  id, name: id, scopeMode: 'all', categories: [], detail: 'full', role: 'viewer',
  token: `tok-${id}`, createdAt: '2026-08-01T00:00:00Z', ...extra,
});

beforeEach(() => {
  updateShare.mockClear();
  useShareStore.setState({ shares: [], error: null });
});

describe('shareStore.renameCategory', () => {
  it('follows a rename in every share that scoped to the old name', async () => {
    // Shares scope by category NAME. Without this the share keeps pointing at a
    // name no event carries any more and silently stops sharing.
    useShareStore.setState({
      shares: [share('s1', { scopeMode: 'categories', categories: ['Work', 'Holiday'] })],
    });
    await useShareStore.getState().renameCategory('Work', 'Job');
    expect(useShareStore.getState().shares[0].categories).toEqual(['Job', 'Holiday']);
    expect(updateShare).toHaveBeenCalledWith('s1', { categories: ['Job', 'Holiday'] });
  });

  it('leaves shares that never listed the category alone', async () => {
    useShareStore.setState({
      shares: [
        share('s1', { scopeMode: 'categories', categories: ['Holiday'] }),
        share('s2', { scopeMode: 'all' }),
      ],
    });
    await useShareStore.getState().renameCategory('Work', 'Job');
    expect(updateShare).not.toHaveBeenCalled();
  });

  it('rolls back and reports when the update fails', async () => {
    updateShare.mockRejectedValueOnce(new Error('offline'));
    useShareStore.setState({
      shares: [share('s1', { scopeMode: 'categories', categories: ['Work'] })],
    });
    await useShareStore.getState().renameCategory('Work', 'Job');
    expect(useShareStore.getState().shares[0].categories).toEqual(['Work']);
    expect(useShareStore.getState().error).toBe('offline');
  });
});

describe('shareStore.revoke', () => {
  it('restores the share when the server refuses', async () => {
    const { deleteShare } = await import('../data/sharing/sharesApi');
    vi.mocked(deleteShare).mockRejectedValueOnce(new Error('nope'));
    useShareStore.setState({ shares: [share('s1')] });
    await useShareStore.getState().revoke('s1');
    expect(useShareStore.getState().shares.map((s) => s.id)).toEqual(['s1']);
  });
});
