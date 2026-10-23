import { describe, it, expect, vi } from 'vitest';
import { createGoogleTransport, type FetchLike, type FetchResponse } from './googleTransport';
import type { TokenProvider } from './tokenProvider';

function res(status: number, body = '', headers: Record<string, string> = {}): FetchResponse {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      forEach: (cb) => Object.entries(headers).forEach(([k, v]) => cb(v, k)),
    },
    text: async () => body,
  };
}

function provider(refreshTo = 'fresh'): TokenProvider & { refresh: ReturnType<typeof vi.fn> } {
  let token = 'access1';
  const refresh = vi.fn(async () => {
    token = refreshTo;
    return token;
  });
  return { getAccessToken: async () => token, refresh };
}

describe('createGoogleTransport', () => {
  it('adds the bearer token to requests', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => res(207, '<ok/>'));
    const transport = createGoogleTransport(provider(), fetchImpl);

    const out = await transport({ method: 'PROPFIND', url: 'https://apidata.googleusercontent.com/caldav/v2/' });
    expect(out.status).toBe(207);
    expect(out.body).toBe('<ok/>');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://apidata.googleusercontent.com/caldav/v2/',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer access1' }) }),
    );
  });

  it('refreshes once and retries on 401', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      calls.push(init.headers.Authorization);
      return calls.length === 1 ? res(401) : res(207, '<ok/>');
    });
    const p = provider('access2');
    const transport = createGoogleTransport(p, fetchImpl);

    const out = await transport({ method: 'GET', url: 'https://apidata.googleusercontent.com/x' });
    expect(out.status).toBe(207);
    expect(p.refresh).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['Bearer access1', 'Bearer access2']);
  });

  it('does not loop forever if the refreshed token still 401s', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => res(401));
    const p = provider();
    const transport = createGoogleTransport(p, fetchImpl);

    const out = await transport({ method: 'GET', url: 'https://apidata.googleusercontent.com/x' });
    expect(out.status).toBe(401);
    expect(p.refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('follows a redirect within Google, keeping the token', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      seen.push(url);
      return seen.length === 1
        ? res(302, '', { location: 'https://apidata.googleusercontent.com/caldav/v2/final' })
        : res(207, '<ok/>');
    });
    const transport = createGoogleTransport(provider(), fetchImpl);

    const out = await transport({ method: 'PROPFIND', url: 'https://www.googleapis.com/caldav/v2/' });
    expect(out.status).toBe(207);
    expect(seen).toEqual([
      'https://www.googleapis.com/caldav/v2/',
      'https://apidata.googleusercontent.com/caldav/v2/final',
    ]);
  });
});
