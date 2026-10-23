import { ToolbarButton } from '../ui/ToolbarButton';
import { useIsMobile } from '../ui/useMediaQuery';
import { useSettingsStore } from './settingsStore';
import { SIDEBAR_SHORTCUT_LABEL, toggleSidebar } from './sidebarVisibility';

/** Panel glyph: an outlined window whose left column is filled while the side
 *  panel is showing, and hollow once it's hidden. */
function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <line x1="10" y1="4.5" x2="10" y2="19.5" />
      {!collapsed && (
        <path
          d="M5.5 4.5H10v15H5.5A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5Z"
          fill="currentColor"
          stroke="none"
          opacity="0.32"
        />
      )}
    </svg>
  );
}

/**
 * Toolbar toggle that hides the side panel (upcoming + minimap) so the calendar
 * fills the window, and brings it back. Lives in the calendar header — the one
 * area on screen in both states — and mirrors the ⌘B / Ctrl+B shortcut.
 * Renders nothing on mobile, where the panels are tabs rather than a sidebar.
 */
export function SidebarToggle() {
  const isMobile = useIsMobile();
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  if (isMobile) return null;

  const label = collapsed ? 'Show side panel' : 'Hide side panel';
  return (
    <ToolbarButton
      variant="icon"
      className="sidebar-toggle"
      onClick={toggleSidebar}
      aria-label={label}
      aria-pressed={collapsed}
      aria-expanded={!collapsed}
      aria-controls="side-panel"
      title={`${label} (${SIDEBAR_SHORTCUT_LABEL})`}
    >
      <PanelIcon collapsed={collapsed} />
    </ToolbarButton>
  );
}
