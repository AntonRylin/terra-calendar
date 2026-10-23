import { useRef, useState, type ReactNode } from 'react';
import { AccountMenu } from '../ui/AccountMenu';
import { AnchoredPopover } from '../ui/AnchoredPopover';
import { todayISO } from '../core/dates';
import { useUiStore } from './uiStore';
import { useSettingsStore } from './settingsStore';
import { useMobileMenuStore } from './mobileMenu';
import './mobileHeader.css';

type ViewMode = 'separate' | 'week' | 'continuous';

const svgProps = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const VIEW_ICONS: Record<ViewMode, JSX.Element> = {
  separate: (
    <svg {...svgProps}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17M9.2 9.5v11M14.8 9.5v11M3.5 15h17" />
    </svg>
  ),
  week: (
    <svg {...svgProps}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M8 4.5v16M12 4.5v16M16 4.5v16" />
    </svg>
  ),
  continuous: (
    <svg {...svgProps}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      <path d="M12 2.5v1.5M12 20v1.5" />
    </svg>
  ),
};

const VIEW_OPTIONS: { value: ViewMode; label: string; hint: string }[] = [
  { value: 'separate', label: 'Month', hint: 'One month at a time' },
  { value: 'week', label: '3 days', hint: 'Three days with hours, swipe for more' },
  { value: 'continuous', label: 'Continuous', hint: 'An endless scroll of weeks' },
];

/** Calendar glyph with today's date in it (like Google Calendar's today button). */
function TodayGlyph() {
  const day = Number(todayISO().slice(8, 10));
  return (
    <span className="m-today-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
        <path d="M3.5 8.5h17" />
      </svg>
      <span className="m-today-num">{day}</span>
    </span>
  );
}

/** View switch: an icon button that opens the Month / Week / Continuous sheet. */
function ViewSwitch() {
  const mode = (useSettingsStore((s) => s.calendarViewMode) ?? 'continuous') as ViewMode;
  const setMode = useSettingsStore((s) => s.setCalendarViewMode);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const current = VIEW_OPTIONS.find((o) => o.value === mode) ?? VIEW_OPTIONS[0];

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="m-icon-btn"
        aria-label={`Calendar view: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {VIEW_ICONS[current.value]}
      </button>
      {open && anchor.current && (
        <AnchoredPopover anchorEl={anchor.current} onClose={() => setOpen(false)} placement="bottom-end" className="popover--view-switch">
          <div className="m-view-menu" role="menu" aria-label="Calendar view">
            <div className="m-sheet-heading">View</div>
            {VIEW_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === mode}
                className={'m-view-item' + (o.value === mode ? ' is-current' : '')}
                onClick={() => {
                  setMode(o.value);
                  setOpen(false);
                }}
              >
                <span className="m-view-item-icon">{VIEW_ICONS[o.value]}</span>
                <span className="m-view-item-text">
                  <span className="m-view-item-label">{o.label}</span>
                  <span className="m-view-item-hint">{o.hint}</span>
                </span>
                {o.value === mode && (
                  <svg className="m-view-item-check" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}

/**
 * Phone top app bar, shared by the month and week views: one 64px row under
 * the status bar with the menu (opens the drawer), the month name, a "today"
 * button showing today's date, the view switch and the account avatar.
 *
 * `onToday` scrolls the view to today; without it the bar selects today and
 * lets the view follow `viewedDate`/`selectedDate`. `children`, when given,
 * render as a second, compact row (view-specific controls).
 */
export function MobileHeader({
  title,
  onToday,
  children,
}: {
  title: ReactNode;
  onToday?: () => void;
  children?: ReactNode;
}) {
  const menuOpen = useMobileMenuStore((s) => s.open);
  const setMenuOpen = useMobileMenuStore((s) => s.setOpen);

  const goToday =
    onToday ??
    (() => {
      const today = todayISO();
      useUiStore.setState({ selectedDate: today, viewedDate: today });
    });

  return (
    <header className="month-header mobile-header">
      <div className="mobile-header-top">
        <button
          type="button"
          className="m-icon-btn mobile-header-menu"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-drawer"
          onClick={() => setMenuOpen(true)}
        >
          <svg {...svgProps}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <h1 className="month-title">{title}</h1>
        <button type="button" className="m-icon-btn mobile-header-today" aria-label="Go to today" onClick={goToday}>
          <TodayGlyph />
        </button>
        <ViewSwitch />
        <span className="mobile-header-avatar">
          <AccountMenu />
        </span>
      </div>
      {children && <nav className="month-nav mobile-header-nav">{children}</nav>}
    </header>
  );
}
