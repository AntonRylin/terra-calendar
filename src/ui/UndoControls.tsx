import { useEffect } from 'react';
import { useCalendarStore } from '../app/store';

/** True when focus is in an editable field, so we don't hijack the browser's
 *  native text undo while the user is typing. */
function isEditingText(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/**
 * Floating Undo / Redo buttons plus the Ctrl/Cmd+Z (undo) and
 * Ctrl/Cmd+Shift+Z / Ctrl+Y (redo) keyboard shortcuts. Undo/redo rewind the
 * whole event list to its previously saved state, so they cover creating and
 * deleting (and editing) events.
 */
export function UndoControls() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      // Leave native text editing (and its own undo) alone while typing.
      if (isEditingText()) return;
      e.preventDefault();
      if (isUndo) void useCalendarStore.getState().undo();
      else void useCalendarStore.getState().redo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Buttons are intentionally hidden — undo/redo are keyboard-only
  // (Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y), handled by the effect above.
  return null;
}
