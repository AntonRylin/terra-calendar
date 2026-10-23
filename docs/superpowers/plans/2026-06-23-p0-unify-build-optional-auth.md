# P0 — Unify Build & Optional Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two build-time editions (free-local vs paid-cloud) into a single app that always boots local-first, where signing into an account is optional and additive — never a gate.

**Architecture:** Today `src/App.tsx` forks into `LocalApp` (free) or `CloudApp` (requires login) based on the build-time `getBackend()` switch. P0 removes that fork: `App` always renders the local-first `Shell`, loads events from the local-first repository (`createRepositoryAsync`), and only initialises Supabase auth when the hosted backend is configured. The full-screen `LoginScreen` gate is deleted; account sign-in/out moves inline into the existing Settings panel. No cloud data sync and no entitlements yet — those arrive in P1/P3. The single build is compiled WITH `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (so accounts work) but WITHOUT `VITE_BACKEND=supabase` (so the repository stays local).

**Tech Stack:** React 18, Zustand, Supabase JS (auth only in P0), Vitest + Testing Library, TypeScript.

---

## File Structure

- **Modify** `src/auth/authStore.ts` — make `init()` a safe no-op when Supabase isn't configured (today it calls `getSupabase()`, which throws).
- **Modify** `src/App.tsx` — remove the `LocalApp`/`CloudApp` fork and the login gate; single `App` that always renders `Shell`, initialises auth only when configured, loads the local repository.
- **Modify** `src/features/settings/Settings.tsx` — replace the cloud-only account block with an inline **Account** section (sign in / create account / sign out) shown whenever an account backend is configured.
- **Delete** `src/auth/LoginScreen.tsx` and `src/auth/auth.css` — the full-screen gate is gone; its form is replaced by the inline Settings section.
- **Create** `src/auth/authStore.test.ts` — covers the safe-when-unconfigured behaviour.

---

## Task 1: Make auth initialisation safe when Supabase isn't configured

**Files:**
- Modify: `src/auth/authStore.ts`
- Test: `src/auth/authStore.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/auth/authStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { useAuthStore } from './authStore';

// In the test environment VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset,
// so isSupabaseConfigured() is false and init() must not touch getSupabase()
// (which throws when unconfigured).
describe('authStore', () => {
  it('init() is a safe no-op when Supabase is not configured', () => {
    const unsubscribe = useAuthStore.getState().init();
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().session).toBeNull();
    expect(typeof unsubscribe).toBe('function');
    // Calling the returned unsubscribe must not throw.
    expect(() => unsubscribe()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auth/authStore.test.ts`
Expected: FAIL — `init()` calls `getSupabase()`, which throws `"Supabase is not configured."`

- [ ] **Step 3: Guard `init()` in `src/auth/authStore.ts`**

Add the import at the top (next to the existing `getSupabase` import):

```ts
import { getSupabase, isSupabaseConfigured } from '../data/supabaseClient';
```

Replace the existing `init()` method body:

```ts
  init() {
    // Accounts are optional: with no hosted backend configured there is nothing
    // to initialise. Resolve loading so the app never waits on auth.
    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return () => {};
    }
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, loading: false });
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, loading: false });
    });
    return () => subscription.unsubscribe();
  },
```

(The existing `import { getSupabase } from '../data/supabaseClient';` line is replaced by the combined import above — do not leave a duplicate.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/auth/authStore.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/auth/authStore.ts src/auth/authStore.test.ts
git commit -m "feat(auth): make auth init a no-op when Supabase unconfigured"
```

---

## Task 2: Inline Account section in Settings

Replaces the full-screen login gate with an optional, additive sign-in inside the existing Settings panel. Reuses the `settings-*` classes already used by the Apple-connect form.

**Files:**
- Modify: `src/features/settings/Settings.tsx`

- [ ] **Step 1: Swap the build-time edition check for an account-availability check**

In `src/features/settings/Settings.tsx`, replace this import:

```ts
import { getBackend } from '../../data/createRepository';
```

with:

```ts
import { isSupabaseConfigured } from '../../data/supabaseClient';
```

- [ ] **Step 2: Pull sign-in/up actions from the auth store and add form state**

Find these lines:

```ts
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const isCloud = getBackend() === 'supabase';
```

Replace with:

```ts
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const accountAvailable = isSupabaseConfigured();
  const [account, setAccount] = useState({
    mode: 'signin' as 'signin' | 'signup',
    email: '',
    password: '',
    busy: false,
    error: '',
    info: '',
  });
```

- [ ] **Step 3: Add the submit handler**

Add this function next to the other handlers (e.g. directly after the `deletePastEvents` function):

```ts
  async function submitAccount() {
    const email = account.email.trim();
    const password = account.password;
    if (!email || !password) {
      setAccount((a) => ({ ...a, error: 'Enter your email and password.' }));
      return;
    }
    setAccount((a) => ({ ...a, busy: true, error: '', info: '' }));
    const result =
      account.mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    if (result.error) {
      setAccount((a) => ({ ...a, busy: false, error: result.error! }));
      return;
    }
    if (result.needsConfirmation) {
      setAccount((a) => ({
        ...a,
        busy: false,
        mode: 'signin',
        password: '',
        info: 'Check your inbox to confirm your email, then sign in.',
      }));
      return;
    }
    // Signed in — the auth listener updates `session`; clear the form.
    setAccount({ mode: 'signin', email: '', password: '', busy: false, error: '', info: '' });
    notify('Signed in.');
  }
```

- [ ] **Step 4: Replace the cloud-only account block with the unified Account section**

Find this block (near the end of the `panel === 'calendars'` section):

```tsx
            {isCloud && session && (
              <>
                <h3 className="settings-subhead">Account</h3>
                <p className="settings-empty">
                  Signed in as {session.user.email}. Your events sync across all your devices.
                </p>
                <button className="settings-reset-btn" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            )}
```

Replace it with:

```tsx
            {accountAvailable && (
              <>
                <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)' }}>Account</h3>
                {session ? (
                  <>
                    <p className="settings-empty">
                      Signed in as {session.user.email}. An account is optional — it carries your
                      purchases and (with Cloud) syncs everything across devices.
                    </p>
                    <button className="settings-reset-btn" onClick={() => void signOut()}>
                      Sign out
                    </button>
                  </>
                ) : (
                  <div
                    className="settings-field-group"
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                  >
                    <p className="settings-empty" style={{ margin: 0 }}>
                      Optional. Create an account to unlock purchases on any device. You can keep
                      using everything here without one.
                    </p>
                    <input
                      className="settings-mode"
                      type="email"
                      placeholder="Email"
                      autoComplete="email"
                      value={account.email}
                      onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                    />
                    <input
                      className="settings-mode"
                      type="password"
                      placeholder="Password"
                      autoComplete={account.mode === 'signin' ? 'current-password' : 'new-password'}
                      value={account.password}
                      onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                    />
                    {account.error && (
                      <p className="settings-empty" style={{ margin: 0, color: 'var(--color-danger, #ff453a)' }}>
                        {account.error}
                      </p>
                    )}
                    {account.info && (
                      <p className="settings-empty" style={{ margin: 0 }}>{account.info}</p>
                    )}
                    <button className="settings-connect" disabled={account.busy} onClick={() => void submitAccount()}>
                      {account.busy
                        ? 'Please wait…'
                        : account.mode === 'signin'
                          ? 'Sign in'
                          : 'Create account'}
                    </button>
                    <button
                      className="settings-reset-btn"
                      style={{ marginTop: 0 }}
                      onClick={() =>
                        setAccount((a) => ({
                          ...a,
                          mode: a.mode === 'signin' ? 'signup' : 'signin',
                          error: '',
                          info: '',
                        }))
                      }
                    >
                      {account.mode === 'signin' ? 'No account? Create one' : 'Have an account? Sign in'}
                    </button>
                  </div>
                )}
              </>
            )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `getBackend`/`isCloud` are fully removed and the new state/handlers typecheck.)

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/Settings.tsx
git commit -m "feat(settings): inline optional Account sign-in/out section"
```

---

## Task 3: Unify `App.tsx` — remove the edition fork and login gate

**Files:**
- Modify: `src/App.tsx` (replace whole file)
- Delete: `src/auth/LoginScreen.tsx`, `src/auth/auth.css`

- [ ] **Step 1: Replace the entire contents of `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { MainScreen } from './app/MainScreen';
import { useCalendarStore } from './app/store';
import { useSettingsStore, ACCENT_COLORS, hydrateSettingsFromDisk } from './app/settingsStore';
import { createRepositoryAsync } from './data/createRepository';
import { isSupabaseConfigured } from './data/supabaseClient';
import { useConnectionStore } from './app/connectionStore';
import { useAuthStore } from './auth/authStore';
import { QuickEntryHost } from './features/quick-entry/QuickEntryHost';
import { EventEditorHost } from './features/event-editor/EventEditorHost';
import { EventCreateHost } from './features/event-editor/EventCreateHost';
import { SpanHost } from './features/span-editor/SpanHost';
import { SpanDayHost } from './features/span-editor/SpanDayHost';
import { SpecialDayHost } from './features/special-day/SpecialDayHost';
import { DayBackgroundHost } from './features/day-background/DayBackgroundHost';
import { CategoryEditorHost } from './features/category-editor/CategoryEditorHost';
import { Settings } from './features/settings/Settings';
import { Toast } from './ui/Toast';
import { ConfirmHost } from './ui/ConfirmHost';

function getSoftAccent(hexColor: string): string {
  if (hexColor.startsWith('#')) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, 0.12)`;
  }
  return 'rgba(10, 132, 255, 0.12)';
}

/** The calendar UI itself. */
function Shell() {
  return (
    <>
      <MainScreen />
      <QuickEntryHost />
      <EventEditorHost />
      <EventCreateHost />
      <SpanHost />
      <SpanDayHost />
      <SpecialDayHost />
      <DayBackgroundHost />
      <CategoryEditorHost />
      <Settings />
      <Toast />
      <ConfirmHost />
    </>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const tileScale = useSettingsStore((s) => s.tileScale);
  const ready = useCalendarStore((s) => s.ready);

  // Re-initialise the repository whenever a connected calendar account changes.
  const connUser = useConnectionStore((s) => s.caldav?.username);
  const connCalendarsStr = JSON.stringify(useConnectionStore((s) => s.caldav?.calendars));
  const connGoogleUser = useConnectionStore((s) => s.google?.username);
  const connGoogleCalendarsStr = JSON.stringify(useConnectionStore((s) => s.google?.calendars));

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Recover settings (incl. category cosmetics) from the durable on-disk mirror
  // on desktop; no-op on web. See settingsStore.
  useEffect(() => {
    void hydrateSettingsFromDisk();
  }, []);

  // Optional account: only initialise auth when a hosted backend is configured.
  // Signing in is additive — it never gates the app.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return useAuthStore.getState().init();
  }, []);

  // Load events from the local-first repository (local file / browser store, plus
  // any connected CalDAV/Google accounts). Cloud-mode repository selection by
  // entitlement arrives in a later phase.
  useEffect(() => {
    let active = true;
    void (async () => {
      const repo = await createRepositoryAsync();
      if (active) await useCalendarStore.getState().init(repo);
    })();
    return () => {
      active = false;
    };
  }, [connUser, connCalendarsStr, connGoogleUser, connGoogleCalendarsStr]);

  // Resolve 'system' against the OS preference, keeping it live in system mode.
  useEffect(() => {
    if (theme !== 'system') {
      setResolvedTheme(theme);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setResolvedTheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    let soft: string;
    if (resolvedTheme === 'dark') {
      soft = getSoftAccent(accentColor).replace(/0\.12\)$/, '0.22)');
    } else {
      const preset = ACCENT_COLORS.find((c) => c.primary === accentColor);
      soft = preset ? preset.soft : getSoftAccent(accentColor);
    }
    document.documentElement.style.setProperty('--color-accent', accentColor);
    document.documentElement.style.setProperty('--color-accent-soft', soft);
  }, [accentColor, resolvedTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', fontScale.toString());
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--tile-scale', tileScale.toString());
  }, [tileScale]);

  if (!ready) return null;
  return <Shell />;
}
```

- [ ] **Step 2: Delete the now-unused login gate**

```bash
git rm src/auth/LoginScreen.tsx src/auth/auth.css
```

- [ ] **Step 3: Typecheck to confirm nothing else references the deleted gate or removed exports**

Run: `npx tsc --noEmit`
Expected: no errors. (If anything still imports `LoginScreen`, `createRepository` (the sync export), or `getBackend` from a deleted/changed path, the typecheck names the file — fix that import. As of this plan only `App.tsx` and `Settings.tsx` referenced them, both updated above.)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/auth/LoginScreen.tsx src/auth/auth.css
git commit -m "feat(app): unify into one local-first build; drop login gate"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all suites PASS (the prior 343 tests plus the 1 new authStore test = 344).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 3: Build to confirm the bundle compiles**

Run: `npm run build`
Expected: `tsc && vite build` completes with no errors.

- [ ] **Step 4: Manual smoke (desktop dev), then commit nothing**

Run: `npm run tauri dev` (or `npm run dev` for the web build).
Verify:
- The app opens straight to the calendar — no login screen.
- Settings → the **Account** section shows a sign-in form when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set at build time, and is **absent** when they aren't (pure local build).
- Creating/editing events and categories still works exactly as before.

No commit — this step only confirms the unified app runs.

---

## Self-Review

**Spec coverage (against `2026-06-23-business-model-strategy-design.md` → "Architecture: one app, runtime-selected tier"):**
- "Always boots in Local mode, no account required" → Task 3 (`App` always renders `Shell`, no gate). ✓
- "Auth becomes optional and additive, not a whole-app gate" → Task 1 (safe init) + Task 2 (inline Account) + Task 3 (delete `LoginScreen`). ✓
- "On sign-in, fetch entitlements / switch to Cloud mode" → **intentionally deferred to P1/P3.** P0 establishes account presence only; this is called out in the Goal/Architecture. ✓ (no gap — out of P0 scope by design)

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output. ✓

**Type consistency:** `submitAccount` uses `signIn`/`signUp` returning `AuthResult` (`{ error?, needsConfirmation? }`) — matches `authStore.ts`. `isSupabaseConfigured` is imported from `../../data/supabaseClient` (Settings) and `./data/supabaseClient` (App) — both correct relative paths. `account` state shape is defined once (Step 2) and used consistently. ✓
