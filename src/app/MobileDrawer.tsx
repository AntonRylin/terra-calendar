import { useEffect, useRef, type ReactNode } from 'react';
import { useUiStore } from './uiStore';
import { closeMobileMenu, useMobileMenuStore } from './mobileMenu';

/** Overlays that sit above the drawer and own Escape while they're open. */
const OVERLAY_SELECTOR = '.popover-backdrop, .settings-backdrop, .confirm-overlay';

/**
 * Phone layout: a full-height panel that slides in from the left over the
 * calendar, with a scrim behind it. Holds the Upcoming panel. It stays mounted
 * while closed (just off-screen and hidden) so the list keeps its scroll.
 *
 * Closes on: scrim tap, the close button, Escape, and whenever an item in it
 * navigates the calendar (a card tap sets the viewed date / highlighted event).
 */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const open = useMobileMenuStore((s) => s.open);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Leaving the phone layout (or unmounting) shouldn't leave it "open" for later.
  useEffect(() => () => closeMobileMenu(), []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // `inert` keeps the hidden panel out of the tab order and screen readers.
    if (open) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    if (open) closeRef.current?.focus({ preventScroll: true });
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

  return (
    <div className={'mobile-drawer-root' + (open ? ' is-open' : '')}>
      <div className="mobile-drawer-scrim" onClick={closeMobileMenu} aria-hidden="true" />
      <aside
        ref={panelRef}
        id="mobile-drawer"
        className="mobile-drawer"
        role="dialog"
        aria-modal={open}
        aria-label="Upcoming"
      >
        <div className="mobile-drawer-head">
          <span className="mobile-drawer-title">Upcoming</span>
          <button ref={closeRef} type="button" className="mobile-drawer-close" aria-label="Close menu" onClick={closeMobileMenu}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mobile-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
