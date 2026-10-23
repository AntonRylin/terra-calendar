import type { ReactNode } from 'react';
import { ToolbarButton } from '../ui/ToolbarButton';
import { AccountMenu } from '../ui/AccountMenu';
import { useUiStore } from './uiStore';
import { useMobileMenuStore } from './mobileMenu';
import './mobileHeader.css';

/**
 * Phone version of the calendar header, shared by the month and week views.
 * Two rows: the menu button (opens the Upcoming drawer), the title, "+" and the
 * account avatar on top; the view's own controls (`children`) underneath.
 * Desktop-only controls (zoom, side-panel toggle) are simply not passed in.
 */
export function MobileHeader({ title, children }: { title: ReactNode; children: ReactNode }) {
  const openCreate = useUiStore((s) => s.openCreate);
  const menuOpen = useMobileMenuStore((s) => s.open);
  const setMenuOpen = useMobileMenuStore((s) => s.setOpen);

  return (
    <header className="month-header mobile-header">
      <div className="mobile-header-top">
        <ToolbarButton
          variant="icon"
          className="mobile-header-menu"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-drawer"
          onClick={() => setMenuOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </ToolbarButton>
        <h1 className="month-title">{title}</h1>
        <ToolbarButton
          variant="icon"
          className="mobile-header-add"
          aria-label="Add event"
          onClick={(e) => openCreate(e.currentTarget)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </ToolbarButton>
        <AccountMenu />
      </div>
      <nav className="month-nav mobile-header-nav">{children}</nav>
    </header>
  );
}
