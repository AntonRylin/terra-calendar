import { useSettingsStore } from './settingsStore';
import { useUiStore } from './uiStore';

/** True on Apple platforms, where the toggle shortcut is ⌘B rather than Ctrl+B. */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const id = navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(id);
}

/** Human-readable form of the side-panel shortcut, for tooltips. */
export const SIDEBAR_SHORTCUT_LABEL = isApplePlatform() ? '⌘B' : 'Ctrl+B';

/** True when the keyboard event is the side-panel toggle shortcut and the user
 *  isn't typing (⌘B/Ctrl+B is "bold" inside a text field). */
export function isSidebarShortcut(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false;
  if (e.key.toLowerCase() !== 'b') return false;
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
    return false;
  }
  return true;
}

/** Popovers are positioned against an anchor element. Anchors living inside the
 *  side panel vanish with it, which would leave an orphaned popover floating
 *  over the calendar — so close those, and only those, as the panel collapses. */
function closeSidebarAnchoredOverlays(): void {
  if (typeof document === 'undefined') return;
  const sidebarEl = document.querySelector('.sidebar');
  if (!sidebarEl) return;
  const ui = useUiStore.getState();
  const anchored = [
    ui.quickEntry,
    ui.editor,
    ui.create,
    ui.taskEditor,
    ui.span,
    ui.spanDay,
    ui.specialDayEditor,
    ui.categoryEditor,
  ];
  if (anchored.some((t) => t != null && sidebarEl.contains(t.anchorEl))) {
    ui.closeOverlays();
  }
}

/** Show or hide the side panel (upcoming + minimap). The choice persists. */
export function setSidebarVisible(visible: boolean): void {
  if (!visible) closeSidebarAnchoredOverlays();
  useSettingsStore.getState().setSidebarCollapsed(!visible);
}

/** Flip the side panel between hidden and visible. */
export function toggleSidebar(): void {
  setSidebarVisible(useSettingsStore.getState().sidebarCollapsed);
}
