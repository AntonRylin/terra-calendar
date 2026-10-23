import { describe, it, expect, vi } from 'vitest';
import {
  decodeIdTokenEmail,
  exchangeCode,
  generatePkce,
  randomState,
  refreshAccessToken,
  TOKEN_ENDPOINT,
  type OAuthHttp,
} from './oauth';

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken(payload: object): string {
  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'RS256' })}.${enc(payload)}.signature`;
}

describe('generatePkce', () => {
  it('produces a verifier and its S256 challenge', async () => {
    const { verifier, challenge } = await generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(challenge).toBe(base64url(new Uint8Array(digest)));
  });

  it('generates a fresh verifier each call', async () => {
    const a = await generatePkce();
    const b = await generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('randomState', () => {
  it('returns a url-safe random string', () => {
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomState()).not.toBe(randomState());
  });
});

describe('decodeIdTokenEmail', () => {
  it('extracts the email claim', () => {
    expect(decodeIdTokenEmail(makeIdToken({ email: 'me@gmail.com' }))).toBe('me@gmail.com');
  });
  it('returns null without an email or on garbage', () => {
    expect(decodeIdTokenEmail(makeIdToken({ sub: '123' }))).toBeNull();
    expect(decodeIdTokenEmail('not-a-jwt')).toBeNull();
    expect(decodeIdTokenEmail(undefined)).toBeNull();
  });
});

describe('exchangeCode', () => {
  it('POSTs the auth-code grant and returns tokens', async () => {
    const http: OAuthHttp = vi.fn(async () => ({
      status: 200,
      body: JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, token_type: 'Bearer' }),
    }));
    const tokens = await exchangeCode(http, {
      code: 'c',
      verifier: 'v',
      redirectUri: 'http://127.0.0.1:1234',
      clientId: 'cid',
    });
    expect(tokens.access_token).toBe('at');
    expect(tokens.refresh_token).toBe('rt');
    expect(http).toHaveBeenCalledWith(TOKEN_ENDPOINT, {
      grant_type: 'authorization_code',
      code: 'c',
      code_verifier: 'v',
      redirect_uri: 'http://127.0.0.1:1234',
      client_id: 'cid',
    });
  });

  it('throws with Google error detail on failure', async () => {
    const http: OAuthHttp = async () => ({
      status: 400,
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }),
    });
    await expect(
      exchangeCode(http, { code: 'c', verifier: 'v', redirectUri: 'r', clientId: 'cid' }),
    ).rejects.toThrow(/Bad code/);
  });
});

describe('refreshAccessToken', () => {
  it('POSTs the refresh grant', async () => {
    const http: OAuthHttp = vi.fn(async () => ({
      status: 200,
      body: JSON.stringify({ access_token: 'fresh', expires_in: 3600, token_type: 'Bearer' }),
    }));
    const tokens = await refreshAccessToken(http, { refreshToken: 'rt', clientId: 'cid' });
    expect(tokens.access_token).toBe('fresh');
    expect(http).toHaveBeenCalledWith(TOKEN_ENDPOINT, {
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'cid',
    });
  });
});
