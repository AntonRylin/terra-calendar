import { describe, it, expect, beforeEach } from 'vitest';
import { localStorageKv } from './localStorageKv';

beforeEach(() => localStorage.clear());

describe('localStorageKv', () => {
  it('round-trips values', async () => {
    await localStorageKv.set('k', 'v');
    expect(await localStorageKv.get('k')).toBe('v');
    expect(await localStorageKv.get('missing')).toBeNull();
  });
});
