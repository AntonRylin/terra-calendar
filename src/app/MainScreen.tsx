import { useState, useEffect } from 'react';
import { defaultLayout, panelRegistry, type LayoutConfig } from './panels';
import { useIsMobile } from '../ui/useMediaQuery';
import { useSettingsStore } from './settingsStore';
import { isSidebarShortcut, toggleSidebar } from './sidebarVisibility';
import { SelectionBar } from '../features/bulk-select/SelectionBar';
import { useReminderScheduler } from './useReminderScheduler';
import './mainScreen.css';

type MobileTab = 'calendar' | 'upcoming' | 'minimap';

const TABS: { id: MobileTab; label: string; icon: JSX.Element }[] = [
  {
    id: 'calendar',
    label: 'Calendar',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="16" y1="2" x2="16" y2="6" />
      </svg>
    ),
  },
  {
    id: 'upcoming',
    label: 'Upcoming',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'minimap',
    label: 'Minimap',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <line x1="12" y1="3" x2="12" y2="6" />
      </svg>
    ),
  },
];

export function MainScreen({ layout = defaultLayout }: { layout?: LayoutConfig }) {
  useReminderScheduler();
  const Top = panelRegistry[layout.sidebar.top];
  const Bottom = panelRegistry[layout.sidebar.bottom];
  const Main = panelRegistry[layout.main];
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<MobileTab>('calendar');

  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const sidebarSplit = useSettingsStore((s) => s.sidebarSplit);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const setSidebarSplit = useSettingsStore((s) => s.setSidebarSplit);

  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);

  useEffect(() => {
    if (isDraggingH) {
      document.body.classList.add('is-dragging-h');
    } else {
      document.body.classList.remove('is-dragging-h');
    }
    return () => {
      document.body.classList.remove('is-dragging-h');
    };
  }, [isDraggingH]);

  useEffect(() => {
    if (isDraggingV) {
      document.body.classList.add('is-dragging-v');
    } else {
      document.body.classList.remove('is-dragging-v');
    }
    return () => {
      document.body.classList.remove('is-dragging-v');
    };
  }, [isDraggingV]);

  // ⌘B / Ctrl+B toggles the side panel, matching the editors people already use.
  // Mobile has no sidebar — its panels are tabs — so the shortcut stays off there.
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isSidebarShortcut(e)) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile]);

  const handleHorizontalPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDraggingH(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const containerWidth = window.innerWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newWidth = Math.max(15, Math.min(50, startWidth + deltaPercent));
      setSidebarWidth(newWidth);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      setIsDraggingH(false);
      try {
        (e.target as Element).releasePointerCapture(upEvent.pointerId);
      } catch {
        // Safe check
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleVerticalPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDraggingV(true);
    const startY = e.clientY;
    const startSplit = sidebarSplit;
    const sidebarEl = document.querySelector('.sidebar');
    const sidebarHeight = sidebarEl ? sidebarEl.clientHeight : (window.innerHeight || 1);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / (sidebarHeight * fontScale)) * 100;
      const newSplit = Math.max(20, Math.min(80, startSplit + deltaPercent));
      setSidebarSplit(newSplit);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      setIsDraggingV(false);
      try {
        (e.target as Element).releasePointerCapture(upEvent.pointerId);
      } catch {
        // Safe check
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (isMobile) {
    return (
      <div className="main-screen main-screen-mobile">
        <div className="mobile-view">
          {/* All panes stay mounted so each keeps its scroll/position; only the
              active one is shown. The calendar mounts visible so its initial
              scroll-to-today measurement is correct. */}
          <div className="mobile-pane" hidden={tab !== 'calendar'}>
            <Main />
          </div>
          <div className="mobile-pane" hidden={tab !== 'upcoming'}>
            <Top />
          </div>
          <div className="mobile-pane" hidden={tab !== 'minimap'}>
            <Bottom />
          </div>
        </div>
        <nav className="mobile-tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'mobile-tab' + (tab === t.id ? ' is-active' : '')}
              onClick={() => setTab(t.id)}
              aria-label={t.label}
              aria-current={tab === t.id}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <SelectionBar />
      </div>
    );
  }

  return (
    <div
      className={'main-screen' + (sidebarCollapsed ? ' is-sidebar-collapsed' : '')}
      style={
        {
          '--sidebar-width': sidebarCollapsed ? '0%' : `${sidebarWidth}%`,
          '--sidebar-split': `${sidebarSplit}%`,
        } as React.CSSProperties
      }
    >
      {/* Hidden means gone: unmounting the panels frees their timers, observers,
          and rendering work while the calendar is at full width. */}
      {!sidebarCollapsed && (
        <>
          <aside
            id="side-panel"
            className="sidebar"
            style={{ '--sidebar-split': `${sidebarSplit}%` } as React.CSSProperties}
          >
            <section className="sidebar-top">
              <Top />
            </section>
            <div
              className={`resize-handle-v ${isDraggingV ? 'is-dragging' : ''}`}
              onPointerDown={handleVerticalPointerDown}
            />
            <section className="sidebar-bottom">
              <Bottom />
            </section>
          </aside>
          <div
            className={`resize-handle-h ${isDraggingH ? 'is-dragging' : ''}`}
            onPointerDown={handleHorizontalPointerDown}
          />
        </>
      )}
      <main className="main-panel">
        <Main />
      </main>
      <SelectionBar />
    </div>
  );
}
