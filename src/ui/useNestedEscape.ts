import { useEffect, useRef } from 'react';

/**
 * Escape handling for a popover opened from inside another popover.
 *
 * Both AnchoredPopovers listen for Escape on `document` (floating-ui's
 * useDismiss), and the outer one also sees the inner one's keydown through
 * React's portal tree — so a plain Escape inside the inner popover closes the
 * outer one too. This claims the key first, in the capture phase at `document`,
 * and stops it dead so only `onEscape` runs.
 */
export function useNestedEscape(active: boolean, onEscape: () => void): void {
  const latest = useRef(onEscape);
  latest.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      latest.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active]);
}
