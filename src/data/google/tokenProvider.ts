import { refreshAccessToken, type OAuthHttp } from './oauth';

/** Supplies a valid OAuth access token on demand, refreshing transparently when
 *  it is missing or about to expire. */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
  refresh(): Promise<string>;
}

export function createTokenProvider(opts: {
  http: OAuthHttp;
  clientId: string;
  /** Loads the stored refresh token (from the OS keychain in the app). */
  getRefreshToken: () => Promise<string | null>;
  /** Optionally seed with an access token already in hand (e.g. straight after
   *  the consent flow) to skip an immediate refresh. */
  seed?: { accessToken: string; expiresIn: number };
}): TokenProvider {
  let accessToken: string | null = opts.seed?.accessToken ?? null;
  let expiresAt = opts.seed ? Date.now() + opts.seed.expiresIn * 1000 : 0;

  async function refresh(): Promise<string> {
    const refreshToken = await opts.getRefreshToken();
    if (!refreshToken) {
      throw new Error('Google account is not connected (no stored refresh token).');
    }
    const tokens = await refreshAccessToken(opts.http, { refreshToken, clientId: opts.clientId });
    accessToken = tokens.access_token;
    expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
    return accessToken;
  }

  return {
    async getAccessToken() {
      // Refresh a minute early so a request never races the expiry.
      if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
      return refresh();
    },
    refresh,
  };
}
