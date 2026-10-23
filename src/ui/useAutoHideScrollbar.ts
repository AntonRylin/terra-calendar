import { useEffect, useRef, type RefObject } from 'react';

/**
 * Apple-style auto-hiding scrollbar. Returns a ref to attach to a scrollable
 * element; while the user is actively scrolling it adds an `is-scrolling` class
 * so CSS can reveal the thumb, then removes it after a short idle delay. Combine
 * with a `:hover` rule to also reveal the thumb when the pointer is nearby.
 *
 * Pass an existing ref to reuse it on an element that already has one (e.g. a
 * virtualized scroller); otherwise a fresh ref is created and returned.
 */
export function useAutoHideScrollbar<T extends HTMLElement>(externalRef?: RefObject<T>) {
  const internalRef = useRef<T>(null);
  const ref = externalRef ?? internalRef;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: number | undefined;
    const onScroll = () => {
      el.classList.add('is-scrolling');
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove('is-scrolling'), 900);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [ref]);
  return ref;
}
