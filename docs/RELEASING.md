# Releasing a production build

This guide covers shipping Terra Calendar as a paid/public desktop app where
**Google Calendar sync works for anybody who installs it** — no per-user setup.

There are three independent pieces: (1) the Google OAuth app, (2) the build, and
(3) the legal/licensing bits. The Google verification (step 1) is the long pole —
start it early.

---

## 1. Google OAuth — make it work for the public

Google sync talks to the Calendar API via OAuth. The Calendar scope
(`https://www.googleapis.com/auth/calendar`) is a **"sensitive" scope**, so an
unverified app can only be used by **test users you add by hand (max 100)** and
shows an "unverified app" warning. To let *anybody* connect, you must publish and
verify the consent screen.

### a. Create the OAuth client (once)

1. [console.cloud.google.com](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Application type: Desktop app.** Copy the client ID
   (`…apps.googleusercontent.com`). No client secret is used (PKCE).

### b. Bake the client ID into the build

Either:
- paste it into `DEFAULT_GOOGLE_CLIENT_ID` in
  [`src/data/google/googleConfig.ts`](../src/data/google/googleConfig.ts), **or**
- set `VITE_GOOGLE_CLIENT_ID` in the environment when you build (CI secret, etc.).

It's safe to commit — a desktop client ID is not a secret (PKCE). The env var
overrides the committed default.

### c. Publish + verify the consent screen (required for public use)

**APIs & Services → OAuth consent screen:**

1. User type **External**.
2. Fill **App information**: app name, user-support email, **app logo**, **app
   home page URL**, **privacy policy URL**, terms URL. These must be reachable
   public URLs — you need at least a simple website + privacy policy.
3. Add the scope `…/auth/calendar` and write a short **justification** for why
   the app needs read/write calendar access.
4. **Publish app** (moves it from "Testing" to "In production").
5. **Submit for verification.** Google reviews branding + scope usage and usually
   asks for a **demo video** showing the OAuth consent and how the scope is used.
   Turnaround is typically days to a few weeks.

Notes:
- Calendar full access is **sensitive**, not **restricted** — so you need brand
  verification, **not** the paid third-party security assessment (CASA) that
  Gmail/Drive restricted scopes require.
- Until verification completes you can still demo/sell to a small group by adding
  them as **test users** (they'll see the warning and can click "Advanced →
  proceed").

---

## 2. Build the installers

Tauri builds a native binary **per operating system on that OS** — you can't
cross-build Windows installers from Linux, etc.

```bash
npm install
npx tauri build       # outputs to src-tauri/target/release/bundle/
```

- **Windows:** produces `.msi` / NSIS `.exe`. Built on Windows
  (see the GNU-toolchain notes in the main README).
- **macOS:** produces `.app` / `.dmg`. Built on a Mac.
- **Linux:** produces `.deb` / `.AppImage`. Built on Linux.

Before releasing, set real product metadata in
[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json): `productName`,
`version`, `identifier`, and the app `icons`. Bump `version` for every release.

### Code signing (strongly recommended for a paid app)

Unsigned apps trigger OS warnings ("unknown publisher" / Gatekeeper):

- **Windows:** sign the installer with an Authenticode certificate
  (`tauri.conf.json` → `bundle.windows.certificateThumbprint`, or sign the
  artifact afterwards).
- **macOS:** sign with an Apple Developer ID and **notarize** the `.dmg`.

This is optional to *run* the app but expected for anything you sell.

---

## 3. Licensing & selling

- Terra Calendar is **AGPL-3.0**. You may sell it, but you must make the
  (corresponding, possibly-modified) **source available to the people you
  distribute it to**. Selling binaries is fine; hiding the source is not.
- The **privacy policy** you need for Google verification should state what data
  the app touches (calendar events stay between the user's device and their own
  Google/Apple account — Terra Calendar runs no server in the free desktop tier).

---

## Quick checklist

- [ ] Google Calendar API enabled, **Desktop app** OAuth client created
- [ ] Client ID baked in (`DEFAULT_GOOGLE_CLIENT_ID`) or set via `VITE_GOOGLE_CLIENT_ID`
- [ ] Consent screen has logo + home page + privacy policy, scope justified
- [ ] Consent screen **published and submitted for verification**
- [ ] `productName` / `version` / `identifier` / icons set in `tauri.conf.json`
- [ ] `npx tauri build` on each target OS
- [ ] Installers code-signed (Windows cert / Apple notarization)
- [ ] Source made available per AGPL
