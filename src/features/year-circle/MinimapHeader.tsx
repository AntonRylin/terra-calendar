import type { ReactNode } from 'react';
import { useSettingsStore } from '../../app/settingsStore';

/**
 * Shared chrome for both minimap views: one row across the top of the panel.
 * The left of the row belongs to the view — the month and its arrows where a
 * month of days is up, the panel's own name where the wheel is — and the right
 * holds the layout toggle and the settings gear, which fade in with the pointer.
 * The band the row sits in is reserved either way, so nothing is covered.
 */
export function MinimapHeader({ children }: { children?: ReactNode }) {
  const mode = useSettingsStore((s) => s.minimapMode);
  const setMode = useSettingsStore((s) => s.setMinimapMode);
  const openSettings = useSettingsStore((s) => s.openSettings);

  return (
    <div className="minimap-chrome" data-tauri-drag-region>
      {children ?? <div className="panel-label minimap-label">Minimap</div>}

      <div className="minimap-chrome-right">
        <div className="minimap-mode-toggle" role="group" aria-label="Minimap layout">
          <button
            type="button"
            className={`minimap-mode-btn${mode === 'circle' ? ' is-active' : ''}`}
            onClick={() => setMode('circle')}
            aria-pressed={mode === 'circle'}
            aria-label="Circle layout"
            title="Circle"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>
          <button
            type="button"
            className={`minimap-mode-btn${mode === 'days' ? ' is-active' : ''}`}
            onClick={() => setMode('days')}
            aria-pressed={mode === 'days'}
            aria-label="Month days layout"
            title="Month days"
          >
            {/* A month of numbered days, in miniature. */}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
              <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
              <line x1="9.2" y1="13" x2="9.2" y2="13.01" />
              <line x1="14.8" y1="13" x2="14.8" y2="13.01" />
              <line x1="9.2" y1="17" x2="9.2" y2="17.01" />
              <line x1="14.8" y1="17" x2="14.8" y2="17.01" />
            </svg>
          </button>
        </div>

        <button
          className="year-settings"
          onClick={() => openSettings('minimap')}
          aria-label="Minimap settings"
          title="Minimap settings"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
