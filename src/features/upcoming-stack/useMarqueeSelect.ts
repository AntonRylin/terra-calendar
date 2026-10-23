import { useCallback, useRef, useState, type RefObject } from 'react';
import { useSelectionStore } from '../../app/selectionStore';

/** Axis-aligned box; `right`/`bottom` are exclusive edges (viewport coords). */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** True when two axis-aligned boxes overlap (touching edges don't count). */
export function rectsIntersect(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Marquee overlay rectangle in viewport coordinates (for a `position: fixed` div). */
export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pointer must travel this far before a press becomes a drag-select (so a plain
 *  click on empty space doesn't enter selection mode). */
const DRAG_THRESHOLD = 4;

/**
 * Mouse marquee (rubber-band) selection for the Upcoming list. Press on empty
 * space and drag a rectangle; every `.upcoming-card[data-event-id]` it touches is
 * selected (replace semantics). Auto-enters tap selection mode. Touch is ignored
 * so list scrolling is unaffected.
 *
 * Returns `onPointerDown` to attach to the scrollable list element and the live
 * `marquee` rectangle to render (null when not dragging).
 */
export function useMarqueeSelect(listRef: RefObject<HTMLElement>) {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const start = startRef.current;
      const listEl = listRef.current;
      if (!start || !listEl) return;
      if (!draggingRef.current && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) {
        return;
      }
      draggingRef.current = true;

      const left = Math.min(start.x, e.clientX);
      const top = Math.min(start.y, e.clientY);
      const right = Math.max(start.x, e.clientX);
      const bottom = Math.max(start.y, e.clientY);
      const box: Box = { left, top, right, bottom };

      const ids: string[] = [];
      listEl.querySelectorAll<HTMLElement>('.upcoming-card[data-event-id]').forEach((card) => {
        const r = card.getBoundingClientRect();
        if (rectsIntersect(box, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
          const id = card.dataset.eventId;
          if (id && !ids.includes(id)) ids.push(id);
        }
      });

      const sel = useSelectionStore.getState();
      if (!sel.active) sel.enter();
      sel.selectMany(ids);

      setMarquee({ left, top, width: right - left, height: bottom - top });
    },
    [listRef],
  );

  const handleUp = useCallback(() => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);

    const sel = useSelectionStore.getState();
    if (!draggingRef.current) {
      // A plain click on empty space deselects (standard behavior).
      if (sel.active) sel.exit();
    } else if (sel.active && sel.selected.size === 0) {
      // Dragged over nothing — don't strand an empty selection bar.
      sel.exit();
    }

    startRef.current = null;
    draggingRef.current = false;
    setMarquee(null);
  }, [handleMove]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const listEl = listRef.current;
      if (!listEl) return;
      const target = e.target as HTMLElement;
      if (target.closest('.upcoming-card')) return; // started on a card, not empty space
      if (e.nativeEvent.offsetX >= listEl.clientWidth) return; // scrollbar gutter

      e.preventDefault(); // suppress native text selection
      startRef.current = { x: e.clientX, y: e.clientY };
      draggingRef.current = false;
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [listRef, handleMove, handleUp],
  );

  return { onPointerDown, marquee };
}
