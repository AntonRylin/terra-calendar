import { invoke } from '@tauri-apps/api/core';
import { CalDavClient, type CalendarInfo } from '../caldav/caldavClient';
import { credentials } from '../caldav/credentials';
import type { CalDavConfig } from '../caldav/types';
import { GOOGLE_CALDAV_BASE, getGoogleClientId, tauriOAuthHttp } from './googleConfig';
import { createGoogleTransport } from './googleTransport';
import { createTokenProvider, type TokenProvider } from './tokenProvider';
import {
  GOOGLE_SCOPE,
  decodeIdTokenEmail,
  exchangeCode,
  generatePkce,
  randomState,
} from './oauth';

/** Keychain account key for a Google connection — namespaced so it can't clash
 *  with a Basic-auth CalDAV account that happens to share the same email. */
function keychainAccount(email: string): string {
  return `google:${email}`;
}

function tokenProviderFor(
  email: string,
  clientId: string,
  seed?: { accessToken: string; expiresIn: number },
): TokenProvider {
  return createTokenProvider({
    http: tauriOAuthHttp,
    clientId,
    getRefreshToken: () => credentials.get(keychainAccount(email)),
    seed,
  });
}

/**
 * Build a CalDAV client for a connected Google account. If `config` lacks a
 * calendar list, runs discovery and enables every calendar. The refresh token is
 * read from the OS keychain; access tokens are minted/refreshed on demand.
 * Returns the client + resolved config (the caller assembles the repository).
 */
export async function buildGoogleAccount(
  email: string,
  config?: CalDavConfig,
  seed?: { accessToken: string; expiresIn: number },
): Promise<{ client: CalDavClient; config: CalDavConfig; discovered: CalendarInfo[] }> {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('Google sync is not configured (missing VITE_GOOGLE_CLIENT_ID).');

  const transport = createGoogleTransport(tokenProviderFor(email, clientId, seed));

  let discovered: CalendarInfo[] = [];
  let finalConfig: CalDavConfig;

  if (config && config.calendars && config.calendars.length > 0) {
    finalConfig = config;
  } else {
    const base = new CalDavClient(transport, { serverUrl: GOOGLE_CALDAV_BASE, username: email });
    discovered = await base.discover();
    if (discovered.length === 0) throw new Error('No calendars found for this Google account.');

    const calendars = discovered.map((c) => ({
      url: c.url,
      displayName: c.displayName,
      enabled: true,
      shared: c.shared || undefined,
      readOnly: c.readOnly || undefined,
    }));
    finalConfig = {
      serverUrl: GOOGLE_CALDAV_BASE,
      username: email,
      // Never default-write to a calendar shared with this account (see the
      // Apple connector for the same rule).
      calendarUrl: calendars.find((c) => !c.shared && !c.readOnly)?.url,
      calendars,
    };
  }

  return { client: new CalDavClient(transport, finalConfig), config: finalConfig, discovered };
}

interface OAuthLoopbackResult {
  code: string;
  state: string;
  redirectUri: string;
}

/**
 * Run the full desktop consent flow (PKCE + loopback, via the `google_oauth`
 * Tauri command), store the refresh token in the OS keychain, and return the
 * connected account config (with its discovered calendars). Desktop only.
 */
export async function connectGoogle(): Promise<CalDavConfig> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('Google sync is not configured. Set VITE_GOOGLE_CLIENT_ID and rebuild the app.');
  }

  const { verifier, challenge } = await generatePkce();
  const state = randomState();

  const result = await invoke<OAuthLoopbackResult>('google_oauth', {
    clientId,
    scope: GOOGLE_SCOPE,
    codeChallenge: challenge,
    state,
  });
  if (result.state !== state) {
    throw new Error('OAuth state mismatch — please try connecting again.');
  }

  const tokens = await exchangeCode(tauriOAuthHttp, {
    code: result.code,
    verifier,
    redirectUri: result.redirectUri,
    clientId,
  });

  const email = decodeIdTokenEmail(tokens.id_token);
  if (!email) throw new Error('Could not determine your Google account email from the sign-in.');
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Remove Terra Calendar from your Google account ' +
        'permissions (myaccount.google.com/permissions) and connect again.',
    );
  }

  await credentials.save(keychainAccount(email), tokens.refresh_token);

  // Reuse the access token we just received to discover calendars without an
  // immediate extra refresh.
  const { config } = await buildGoogleAccount(email, undefined, {
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
  });
  return config;
}

/** Forget a Google connection's stored refresh token. */
export async function disconnectGoogle(email: string): Promise<void> {
  await credentials.remove(keychainAccount(email)).catch(() => {});
}
