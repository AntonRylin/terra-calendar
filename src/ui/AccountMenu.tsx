import { useRef, useState } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { useSettingsStore } from '../app/settingsStore';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../app/profileStore';
import { effectiveIdentity, initials } from '../app/identity';
import { useEntitlementStore } from '../app/entitlementStore';
import './accountMenu.css';

/** Inner content of an avatar circle: the image when set, else initials text.
 *  The caller owns the circular wrapper (`.acct-avatar` / `.acct-avatar-lg`). */
function AvatarInner({
  avatarDataUrl,
  fallback,
}: {
  avatarDataUrl: string | null;
  fallback: string;
}): JSX.Element {
  if (avatarDataUrl) return <img className="acct-avatar-img" src={avatarDataUrl} alt="" />;
  return <>{initials(fallback)}</>;
}

/** 16px outline icon stroked with currentColor so it follows the item color. */
function itemIcon(paths: JSX.Element): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

const ICONS = {
  settings: itemIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  calendar: itemIcon(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></>),
  moon: itemIcon(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
  sparkles: itemIcon(<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></>),
  logout: itemIcon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>),
};

/** Avatar trigger + account dropdown. Replaces the app settings gear. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const profileName = useProfileStore((s) => s.name);
  const profileAvatar = useProfileStore((s) => s.avatarDataUrl);
  const id = effectiveIdentity(session, { name: profileName, avatarDataUrl: profileAvatar });
  const fallback = id.name ?? id.email ?? '';
  const isDark = theme === 'dark';

  function go(panel: Parameters<typeof openSettings>[0]) {
    openSettings(panel);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={anchor}
        className="acct-avatar"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarInner avatarDataUrl={id.avatarDataUrl} fallback={fallback} />
      </button>
      {open && anchor.current && (
        <AnchoredPopover anchorEl={anchor.current} onClose={() => setOpen(false)} placement="bottom-end" className="popover--account">
          <div className="acct-menu" role="menu">
            <button className="acct-head acct-head-btn" onClick={() => go('account')}>
              <div className="acct-avatar acct-avatar-lg" aria-hidden="true">
                <AvatarInner avatarDataUrl={id.avatarDataUrl} fallback={fallback} />
              </div>
              <div className="acct-id">
                <div className="acct-name">{id.name ?? 'Set up your profile'}</div>
                <div className="acct-plan">
                  {id.email ? `${id.email} · ` : ''}
                  {cloudActive ? 'Cloud plan' : 'Free plan'}
                </div>
              </div>
            </button>
            <div className="acct-sep" />
            <button role="menuitem" className="acct-item" onClick={() => go('account')}>
              <span className="acct-item-main">{ICONS.settings}Settings</span>
            </button>
            <button role="menuitem" className="acct-item" onClick={() => go('calendars')}>
              <span className="acct-item-main">{ICONS.calendar}Calendars</span>
            </button>
            <button
              role="menuitem"
              className="acct-item acct-item-toggle"
              aria-checked={isDark}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              <span className="acct-item-main">{ICONS.moon}Dark mode</span>
              <span className={`acct-switch${isDark ? ' on' : ''}`} aria-hidden="true"><span className="acct-knob" /></span>
            </button>
            {!cloudActive && (
              <button role="menuitem" className="acct-item acct-item-accent" onClick={() => go('account')}>
                <span className="acct-item-main">{ICONS.sparkles}Upgrade to cloud</span>
              </button>
            )}
            {session && (
              <>
                <div className="acct-sep" />
                <button role="menuitem" className="acct-item" onClick={() => { void signOut(); setOpen(false); }}>
                  <span className="acct-item-main">{ICONS.logout}Sign out</span>
                </button>
              </>
            )}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
