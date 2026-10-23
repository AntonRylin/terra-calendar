import { useEffect, useRef, type ReactNode } from 'react';
import { useUiStore } from './uiStore';
import { useSettingsStore } from './settingsStore';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from './profileStore';
import { useEntitlementStore } from './entitlementStore';
import { effectiveIdentity, initials } from './identity';
import { closeMobileMenu, useMobileMenuStore } from './mobileMenu';
import { useAndroidBack } from './androidBack';

/** Overlays that sit above the drawer and own Escape while they're open. */
const OVERLAY_SELECTOR = '.popover-backdrop, .settings-backdrop, .confirm-overlay';

/**
 * Phone navigation drawer: slides in from the left over the calendar, with a
 * scrim behind it. Header (app name + who's signed in), the Upcoming panel as
 * compact rows, and Settings at the bottom. It stays mounted while closed
 * (off-screen and inert) so the list keeps its scroll.
 *
 * Closes on: scrim tap, Escape, the Android back gesture, and whenever an item
 * in it navigates the calendar (a row tap sets the viewed date / highlighted
 * event) or opens Settings.
 */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const open = useMobileMenuStore((s) => s.open);
  const panelRef = useRef<HTMLElement>(null);
  const openSettings = useSettingsStore((s) => s.openSettings);

  const session = useAuthStore((s) => s.session);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const profileName = useProfileStore((s) => s.name);
  const profileAvatar = useProfileStore((s) => s.avatarDataUrl);
  const id = effectiveIdentity(session, { name: profileName, avatarDataUrl: profileAvatar });

  useAndroidBack(open, closeMobileMenu);

  // Leaving the phone layout (or unmounting) shouldn't leave it "open" for later.
  useEffect(() => () => closeMobileMenu(), []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // `inert` keeps the hidden panel out of the tab order and screen readers.
    if (open) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    if (open) panel.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = useUiStore.subscribe((state, prev) => {
      const navigated =
        state.viewedDate !== prev.viewedDate ||
        (state.highlightedEvent !== prev.highlightedEvent && state.highlightedEvent !== null);
      if (navigated) closeMobileMenu();
    });
    // Capture phase, so a sheet opened from inside the drawer (filters, add
    // event…) still exists in the DOM and gets to handle its own Escape.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      closeMobileMenu();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      unsubscribe();
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const go = (panel: Parameters<typeof openSettings>[0]) => {
    closeMobileMenu();
    openSettings(panel);
  };

  return (
    <div className={'mobile-drawer-root' + (open ? ' is-open' : '')}>
      <div className="mobile-drawer-scrim" onClick={closeMobileMenu} aria-hidden="true" />
      <aside
        ref={panelRef}
        id="mobile-drawer"
        className="mobile-drawer"
        role="dialog"
        aria-modal={open}
        aria-label="Menu"
        tabIndex={-1}
      >
        <div className="mobile-drawer-head">
          <div className="mobile-drawer-brand">Terra Calendar</div>
          <button type="button" className="mobile-drawer-account" onClick={() => go('account')}>
            <span className="mobile-drawer-avatar" aria-hidden="true">
              {id.avatarDataUrl ? <img src={id.avatarDataUrl} alt="" /> : initials(id.name ?? id.email ?? '')}
            </span>
            <span className="mobile-drawer-who">
              <span className="mobile-drawer-name">{id.name ?? 'Set up your profile'}</span>
              <span className="mobile-drawer-plan">
                {id.email ? `${id.email} · ` : ''}
                {cloudActive ? 'Cloud plan' : 'Free plan'}
              </span>
            </span>
          </button>
        </div>
        <div className="mobile-drawer-body">{children}</div>
        <div className="mobile-drawer-foot">
          <button type="button" className="mobile-drawer-row" onClick={() => go('account')}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>
      </aside>
    </div>
  );
}
