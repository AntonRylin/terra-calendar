# Spec — Google Calendar connector (free tier, desktop)

Date: 2026-06-18
Status: Implemented

## Context

This is **roadmap slice 3** from the
[iCloud CalDAV connector spec](./2026-06-14-icloud-caldav-connector-design.md):
"Google OAuth connector". Slice 1 shipped a CalDAV engine
(`CalDavClient` / `CalDavRepository` / `CalDavCache` / `icalMapping`) against
Apple iCloud using Basic auth. Google Calendar **also speaks CalDAV**, so the
engine is reused wholesale; the only new ground is **authentication** — Google
requires OAuth 2.0, not a password.

## Goals

- Sync a user's own Google Calendar in the desktop app, reusing the existing
  CalDAV engine unchanged (read + two-way CRUD, local cache, runtime switch).
- OAuth 2.0 **Authorization Code + PKCE** with a **loopback redirect** — the
  recommended installed-app flow, which needs **no client secret**.
- Refresh token in the OS keychain (never in app state or git); access tokens
  minted/refreshed on demand and transparently re-fetched on `401`.

## Non-goals

- Web edition over CalDAV (CORS) — desktop-only, same as iCloud.
- Google-specific extensions (conferencing, attendees, reminders) — the shared
  `icalMapping` model is the contract; Google round-trips it as iCalendar.
- Push/webhook sync — reads still poll on load, as in slice 1.

## Architecture

New modules under `src/data/google/`, all pure/IO-light and unit-tested; the
only Google-specific I/O is the OAuth dance and a bearer-auth transport.

| Module | Responsibility |
|---|---|
| `oauth.ts` | PKCE generation, `state`, ID-token email decode, and token endpoint calls (`exchangeCode`, `refreshAccessToken`) over an **injected** `OAuthHttp`. |
| `tokenProvider.ts` | Caches the access token, refreshes it (60s early) via the stored refresh token. |
| `googleTransport.ts` | A `DavTransport` that adds `Authorization: Bearer …` and, on `401`, refreshes once and retries. Fetch impl is injected (Tauri HTTP in the app, a fake in tests). |
| `googleConfig.ts` | CalDAV base URL, `VITE_GOOGLE_CLIENT_ID` accessor, and the Tauri-backed `OAuthHttp`. |
| `connect.ts` | `connectGoogle()` (full consent flow), `buildGoogleRepository()` (discovery + repo), `disconnectGoogle()`. |

The CalDAV base is `https://apidata.googleusercontent.com/caldav/v2/`; standard
discovery (current-user-principal → calendar-home-set → calendar list) works
from there, so `CalDavClient.discover()` is reused as-is.

### The loopback flow (Rust `google_oauth` command)

Browsers/webviews can't host a redirect listener cleanly, so a small Rust
command (`src-tauri/src/lib.rs`) does it:

1. Bind `127.0.0.1:0` (ephemeral port) and build the consent URL with
   `redirect_uri=http://127.0.0.1:<port>`, the PKCE `code_challenge`, `state`,
   and `access_type=offline&prompt=consent` (to guarantee a refresh token).
2. Open the system browser (`open` crate).
3. Accept the redirect, parse `code`/`state`, reply with a "you can close this
   tab" page, and return `{ code, state, redirectUri }` to JS.

JS verifies `state`, exchanges the `code` (+ PKCE verifier) for tokens via Tauri
HTTP, reads the account email from the ID token, stores the refresh token in the
keychain (`google:<email>`), then discovers calendars and saves the connection.

### Connection model & wiring

- `connectionStore` gains a `google?: CalDavConfig` branch and `setGoogle()`;
  `kind` is now `'local' | 'caldav' | 'google'`, the three mutually exclusive.
- `createRepositoryAsync()` builds a Google repo when connected (falling back to
  local if the keychain/token is unavailable).
- `App.tsx` re-inits the calendar when the Google connection changes.
- Settings: the previously-stubbed "Connect Google Calendar" button now runs the
  flow; the connected view (calendar toggles + disconnect) is shared with iCloud.

## Security

- PKCE → no client secret; the client ID is safe to ship.
- Refresh token only in the OS keychain (reusing the slice-1 keychain commands).
- The bearer token is retained across redirects **only** within `*.google.com`,
  `*.googleapis.com`, `*.googleusercontent.com`.

## Testing

- `oauth.test.ts` — PKCE = S256(verifier), state randomness, ID-token decode,
  token request shape + error surfacing.
- `tokenProvider.test.ts` — seed reuse, refresh-on-empty, caching, missing token.
- `googleTransport.test.ts` — bearer injection, refresh-and-retry on `401`
  (no infinite loop), in-Google redirect following.
- `connectionStore.test.ts` — Google persistence and mutual exclusion with CalDAV.
- Manual: connect a real Google account in `npx tauri dev` with a configured
  client ID; verify read, create/edit/delete round-trip, and reconnect.
