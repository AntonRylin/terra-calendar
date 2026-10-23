import { useState, useEffect } from 'react';
import { defaultLayout, panelRegistry, type LayoutConfig } from './panels';
import { useIsMobile } from '../ui/useMediaQuery';
import { useSettingsStore } from './settingsStore';
import { isSidebarShortcut, toggleSidebar } from './sidebarVisibility';
import { SelectionBar } from '../features/bulk-select/SelectionBar';
import { useReminderScheduler } from './useReminderScheduler';
import { MobileDrawer } from './MobileDrawer';
import './mainScreen.css';

export function MainScreen({ layout = defaultLayout }: { layout?: LayoutConfig }) {
  useReminderScheduler();
  const Top = panelRegistry[layout.sidebar.top];
  const Bottom = panelRegistry[layout.sidebar.bottom];
  const Main = panelRegistry[layout.main];
  const isMobile = useIsMobile();

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

  // Phones: the calendar fills the screen. Upcoming lives in a slide-in drawer
  // opened from the header's menu button; the minimap isn't offered at all.
  if (isMobile) {
    return (
      <div className="main-screen main-screen-mobile">
        <div className="mobile-view">
          <Main />
        </div>
        <MobileDrawer>
          <Top />
        </MobileDrawer>
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
