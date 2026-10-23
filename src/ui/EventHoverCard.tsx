import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import { useSettingsStore } from '../app/settingsStore';
import { closeEventHover, installEventHoverGuards, useEventHoverStore } from './eventHoverStore';
import './eventHoverCard.css';

/** Roughly how long the whole description should take to arrive, whatever its
 *  length. Time-boxed rather than per-word: a long note must not feel stuck. */
const STREAM_BUDGET_MS = 620;
const MIN_WORD_GAP_MS = 16;
const MAX_WORD_GAP_MS = 52;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The description, arriving one word at a time. Every word is in the DOM from
 * the first frame and only its opacity changes, so the card's height is settled
 * before anything is drawn — it can never grow under the pointer and re-flip
 * its own placement mid-sentence.
 */
function StreamedDescription({ text }: { text: string }) {
  // Keeps the whitespace as its own entries, so words rejoin exactly as typed.
  const parts = useMemo(() => text.split(/(\s+)/).filter((p) => p !== ''), [text]);
  const wordCount = useMemo(() => parts.filter((p) => !/^\s+$/.test(p)).length, [parts]);

  const instant = prefersReducedMotion();
  const [revealed, setRevealed] = useState(() => (instant ? wordCount : 0));

  useEffect(() => {
    if (instant) {
      setRevealed(wordCount);
      return;
    }
    setRevealed(0);
    const gap = Math.min(
      MAX_WORD_GAP_MS,
      Math.max(MIN_WORD_GAP_MS, (STREAM_BUDGET_MS * 1.15) / Math.max(1, wordCount)),
    );
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const due = Math.min(wordCount, Math.floor((t - start) / gap) + 1);
      setRevealed(due);
      if (due < wordCount) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, wordCount, instant]);

  let wordIndex = 0;
  return (
    <p className="ehc-desc">
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        const mine = wordIndex++;
        return (
          <span key={i} className={'ehc-word' + (mine < revealed ? ' is-in' : '')}>
            {part}
          </span>
        );
      })}
    </p>
  );
}

/**
 * One card for the whole app, driven by eventHoverStore. Replaces the native
 * `title` tooltip on every event surface: instead of repeating the title the
 * chip already shows, it streams the event's description in.
 */
export function EventHoverCard() {
  const shown = useEventHoverStore((s) => s.shown);
  // Same interface-scale correction as AnchoredPopover and HoverTip: floating-ui
  // measures in visual px, the portaled card renders in layout px that the zoom
  // multiplies again. No-op at scale 1.
  const fontScale = useSettingsStore((s) => s.fontScale) || 1;
  const anchorRef = useRef<HTMLElement | null>(null);

  useEffect(() => installEventHoverGuards(), []);

  const { refs, x, y, strategy, floatingStyles } = useFloating({
    open: !!shown,
    placement: 'bottom-start',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const anchor = shown?.anchor ?? null;
  useEffect(() => {
    anchorRef.current = anchor;
    refs.setReference(anchor);
  }, [anchor, refs]);

  // An anchor can be unmounted under us — a month flipping over, an event
  // deleted from the context menu — leaving the card pointing at nothing.
  useEffect(() => {
    if (!anchor) return;
    if (!anchor.isConnected) closeEventHover();
  });

  if (!shown) return null;

  const style: CSSProperties =
    fontScale === 1
      ? floatingStyles
      : {
          position: strategy,
          top: 0,
          left: 0,
          transform: `translate(${Math.round(x / fontScale)}px, ${Math.round(y / fontScale)}px)`,
        };

  const { data, bare } = shown;
  // In bare mode the title is the card, so the footer would only repeat it.
  const footText = bare ? data.when : [data.when, data.title].filter(Boolean).join(' · ');

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...style, ['--event-color' as string]: data.color }}
        className={'ehc-card' + (bare ? ' is-bare' : '')}
        role="tooltip"
      >
        {bare ? (
          <p className="ehc-bare-title">{data.title}</p>
        ) : (
          <StreamedDescription key={data.title + data.when} text={data.description} />
        )}
        {footText && (
          <div className="ehc-foot">
            <span className="ehc-dot" />
            <span className="ehc-foot-text">{footText}</span>
          </div>
        )}
      </div>
    </FloatingPortal>
  );
}
