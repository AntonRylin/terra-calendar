import { useState } from 'react';
import { useAuthStore } from './authStore';
import './authGate.css';

/** Custom URI scheme the desktop app registers for browser-based sign-in. */
export const DESKTOP_AUTH_SCHEME = 'opencalendar';

const RELEASES_URL = 'https://github.com/AntonRylin/terra-calendar/releases/latest';

/**
 * True when the page was opened by the desktop app to sign in on its behalf
 * (`?desktop=1`). After sign-in the gate offers to hand the session back to
 * the app via the `opencalendar://` deep link instead of entering the web app.
 */
export function isDesktopHandoff(): boolean {
  return new URLSearchParams(window.location.search).get('desktop') === '1';
}

function BrandHeader() {
  return (
    <div className="auth-gate-brand">
      <span className="auth-gate-mark">OC</span>
      <span>Terra Calendar</span>
    </div>
  );
}

/** Shown when a desktop handoff is signed in: send the session to the app. */
function DesktopHandoff() {
  const session = useAuthStore((s) => s.session);
  if (!session) return null;
  const deepLink =
    `${DESKTOP_AUTH_SCHEME}://auth/callback` +
    `#access_token=${encodeURIComponent(session.access_token)}` +
    `&refresh_token=${encodeURIComponent(session.refresh_token)}`;
  const continueInBrowser = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('desktop');
    window.location.replace(url.toString());
  };
  return (
    <div className="auth-gate">
      <div className="auth-gate-card">
        <BrandHeader />
        <h1>You’re signed in</h1>
        <p className="auth-gate-sub">
          Signed in as <b>{session.user.email}</b>. Send this sign-in to the
          desktop app to finish connecting it.
        </p>
        <a className="auth-gate-submit" href={deepLink}>
          Open the desktop app
        </a>
        <button className="auth-gate-link" onClick={continueInBrowser}>
          Continue in the browser instead
        </button>
      </div>
    </div>
  );
}

/**
 * Full-screen account gate for the browser build. The web version stores data
 * in the cloud, so it needs a signed-in user before showing the calendar —
 * unlike desktop, where accounts stay optional. Also serves as the sign-in
 * page for the desktop app's browser-based login (see {@link isDesktopHandoff}).
 */
export function AuthGate() {
  const session = useAuthStore((s) => s.session);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (session && isDesktopHandoff()) return <DesktopHandoff />;

  async function submit() {
    const mail = email.trim();
    if (!mail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    const meta = name.trim() ? { full_name: name.trim() } : undefined;
    const result = mode === 'signin' ? await signIn(mail, password) : await signUp(mail, password, meta);
    setBusy(false);
    if (result.error) {
      setError(result.error);
    } else if (result.needsConfirmation) {
      setInfo('Almost there — confirm the link we sent to your email, then sign in.');
      setMode('signin');
    }
    // On success the auth listener updates the session and the gate unmounts.
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate-card">
        <BrandHeader />
        <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-gate-sub">
          {mode === 'signin'
            ? 'Sign in to open your calendar in the browser.'
            : 'Your events and styles, synced to every device.'}
        </p>

        {mode === 'signup' && (
          <label className="auth-gate-field">
            <span>Name <span className="auth-gate-optional">(optional)</span></span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              placeholder="Ada Lovelace"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className="auth-gate-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="auth-gate-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </label>

        {error && <p className="auth-gate-error">{error}</p>}
        {info && <p className="auth-gate-info">{info}</p>}

        <button className="auth-gate-submit" disabled={busy} onClick={() => void submit()}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <button
          className="auth-gate-link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError('');
            setInfo('');
          }}
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>

      <p className="auth-gate-download">
        Prefer to keep things local? <a href={RELEASES_URL}>Download the desktop app</a> — free,
        no account needed.
      </p>
    </div>
  );
}
