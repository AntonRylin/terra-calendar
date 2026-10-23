import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './titleBar.css';

// Tauri also runs on Android and iOS, where the OS owns the window: no
// minimise / maximise / close buttons there.
const isDesktop =
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window &&
  !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Tag the document on desktop so the toolbar can reserve room at its right edge
// for the fixed window controls (see .is-tauri-desktop .month-header).
if (isDesktop && typeof document !== 'undefined') {
  document.documentElement.classList.add('is-tauri-desktop');
}

/**
 * Frameless window controls (minimise / maximise / close) for the desktop
 * (Tauri) build. Native decorations are disabled in tauri.conf.json, so these
 * replace the OS buttons. They render inline at the end of the calendar
 * toolbar row — on the same line as the settings gear, Notion-style — and the
 * surrounding toolbar acts as the window drag region. Renders nothing on web.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  if (!isDesktop) return null;

  const win = getCurrentWindow();

  return (
    <div className="window-controls">
      <button
        className="window-control-btn"
        aria-label="Minimize"
        onClick={() => void win.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        className="window-control-btn"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M3 2.5 V1 H8.5 V6.5 H7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        className="window-control-btn window-control-close"
        aria-label="Close"
        onClick={() => void win.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}
