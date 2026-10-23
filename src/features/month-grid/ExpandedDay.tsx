import { useEffect, useLayoutEffect, useRef } from 'react';
import { useUiStore } from '../../app/uiStore';
import { useConfirmStore } from '../../ui/confirmStore';

interface ExpandedDayOptions {
  tile: HTMLElement | null;
  collapsedHeight: number;
  childOverlayOpen: boolean;
  onClose(restoreFocus?: boolean): void;
}

/** The original grid item grows over later rows, keeping its column and width. */
export function useExpandedDay({ tile, collapsedHeight, childOverlayOpen, onClose }: ExpandedDayOptions) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const animationRef = useRef<Animation | null>(null);
  const editorOpen = useUiStore((s) => Boolean(
    s.editor || s.quickEntry || s.create || s.taskEditor || s.span || s.spanDay ||
    s.specialDayEditor || s.categoryEditor || s.dayBackground,
  ));
  const confirmOpen = useConfirmStore((s) => s.request !== null);

  // Minimap navigation can rebuild the rendered weeks without a pointer press.
  // Close before a replacement tile can inherit state tied to the removed node.
  useLayoutEffect(() => {
    if (tile && !tile.isConnected) closeRef.current();
  });

  useEffect(() => {
    if (!tile || editorOpen || confirmOpen || childOverlayOpen) return;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !tile.contains(e.target)) closeRef.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(true); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [tile, editorOpen, confirmOpen, childOverlayOpen]);

  useLayoutEffect(() => {
    if (!tile || !tile.isConnected) return;
    animationRef.current?.cancel();
    tile.classList.remove('day-tile-collapsing');
    const scroller = tile.closest<HTMLElement>('.week-scroll');
    const oldHeight = tile.style.height;
    const oldOverflow = tile.style.overflowY;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let opening = true;
    let lastWidth = tile.offsetWidth;
    let frame = 0;

    const measure = () => {
      tile.style.height = 'auto';
      const style = getComputedStyle(tile);
      const borders = parseFloat(style.borderTopWidth || '0') + parseFloat(style.borderBottomWidth || '0');
      const limit = Math.max(collapsedHeight, (scroller?.clientHeight || window.innerHeight) - 16);
      const height = Math.min(limit, Math.max(collapsedHeight, tile.scrollHeight + borders));
      tile.style.height = `${height}px`;
      return height;
    };
    const height = measure();
    tile.focus({ preventScroll: true });

    if (!reducedMotion && typeof tile.animate === 'function') {
      tile.style.overflowY = 'hidden';
      const animation = tile.animate(
        [{ height: `${collapsedHeight}px` }, { height: `${height}px` }],
        { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      animationRef.current = animation;
      animation.onfinish = () => { opening = false; tile.style.overflowY = 'auto'; };
    } else {
      opening = false;
      tile.style.overflowY = 'auto';
    }

    // Near the bottom, scroll the calendar itself instead of moving the tile.
    if (scroller && typeof scroller.scrollBy === 'function') {
      const rect = tile.getBoundingClientRect();
      const zoom = tile.offsetWidth ? rect.width / tile.offsetWidth : 1;
      const extra = (rect.top + height * zoom - scroller.getBoundingClientRect().bottom) / zoom + 8;
      if (extra > 0) scroller.scrollBy({ top: extra, behavior: reducedMotion ? 'instant' : 'smooth' });
    }

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (opening) { animationRef.current?.cancel(); opening = false; }
        measure();
        tile.style.overflowY = 'auto';
      });
    };
    const resize = new ResizeObserver(() => {
      if (tile.offsetWidth !== lastWidth) { lastWidth = tile.offsetWidth; scheduleMeasure(); }
    });
    resize.observe(tile);
    const changes = new MutationObserver((records) => {
      // Clock ticks do not change the event list's height and must not cut an
      // opening animation short when the second happens to change mid-flight.
      if (records.some(({ target }) => !(target instanceof Element ? target : target.parentElement)?.closest('.today-clock'))) {
        scheduleMeasure();
      }
    });
    changes.observe(tile, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      resize.disconnect();
      changes.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      cancelAnimationFrame(frame);
      const from = parseFloat(tile.style.height) || collapsedHeight;
      animationRef.current?.cancel();
      tile.style.height = oldHeight;
      tile.style.overflowY = oldOverflow;
      if (tile.isConnected && !reducedMotion && typeof tile.animate === 'function') {
        tile.classList.add('day-tile-collapsing');
        const animation = tile.animate(
          [{ height: `${from}px` }, { height: `${collapsedHeight}px` }],
          { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
        animationRef.current = animation;
        const clearCollapse = () => tile.classList.remove('day-tile-collapsing');
        animation.onfinish = clearCollapse;
        animation.oncancel = clearCollapse;
      }
    };
  }, [tile, collapsedHeight]);
}
