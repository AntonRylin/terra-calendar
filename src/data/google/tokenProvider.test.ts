import { describe, it, expect, vi } from 'vitest';
import { createTokenProvider } from './tokenProvider';
import type { OAuthHttp } from './oauth';

function http(accessToken: string): OAuthHttp {
  return async () => ({
    status: 200,
    body: JSON.stringify({ access_token: accessToken, expires_in: 3600, token_type: 'Bearer' }),
  });
}

describe('createTokenProvider', () => {
  it('uses the seed token without refreshing', async () => {
    const post = vi.fn(http('refreshed'));
    const provider = createTokenProvider({
      http: post,
      clientId: 'cid',
      getRefreshToken: async () => 'rt',
      seed: { accessToken: 'seeded', expiresIn: 3600 },
    });
    expect(await provider.getAccessToken()).toBe('seeded');
    expect(post).not.toHaveBeenCalled();
  });

  it('refreshes when there is no token yet', async () => {
    const provider = createTokenProvider({
      http: http('fromRefresh'),
      clientId: 'cid',
      getRefreshToken: async () => 'rt',
    });
    expect(await provider.getAccessToken()).toBe('fromRefresh');
  });

  it('caches the refreshed token for subsequent calls', async () => {
    const post = vi.fn(http('once'));
    const provider = createTokenProvider({
      http: post,
      clientId: 'cid',
      getRefreshToken: async () => 'rt',
    });
    await provider.getAccessToken();
    await provider.getAccessToken();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('throws when no refresh token is stored', async () => {
    const provider = createTokenProvider({
      http: http('x'),
      clientId: 'cid',
      getRefreshToken: async () => null,
    });
    await expect(provider.getAccessToken()).rejects.toThrow(/not connected/);
  });
});
