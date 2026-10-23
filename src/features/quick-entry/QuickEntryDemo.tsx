import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useSettingsStore } from '../../app/settingsStore';
import { parseQuickEntry } from '../../core/timeParser';
import { timeToMinutes, minutesToTime, DEFAULT_DURATION_MIN } from '../../core/timeOfDay';

/** One event per input form the parser accepts, in the order the demo types
 *  them. Between them they cover everything: four-digit times, spaced and
 *  colon-separated ones, all three range separators (space, `to`, `-`), the
 *  eight-digit start+end run-together, a lone start, and no time at all.
 *
 *  Every string here is checked against the real parser in QuickEntryDemo.test
 *  — the demo must not teach syntax that fails. */
export const DEMO_EVENTS = [
  { text: '1230 1410 gym', time: '12:30', title: 'gym' },
  { text: '0900 bank meeting', time: '09:00', title: 'bank meeting' },
  { text: '9 30 to 11 30 spanish lesson', time: '09:30', title: 'spanish lesson' },
  { text: '14:00-15:30 standup', time: '14:00', title: 'standup' },
  { text: '05002015 family dinner', time: '05:00', title: 'family dinner' },
  { text: 'dentist', time: null, title: 'dentist' },
] as const;

// Six passes per loop, so the typing has to be brisker than it was for two.
const CHAR_MS = 58;

/** The little screencast, beat by beat. Each entry is how long that beat runs
 *  before the next one starts; `typing` is timed by the text itself. The whole
 *  sequence runs twice per loop, once per event. */
const BEATS = {
  /** Empty frame — the calendar sitting there before anything happens. */
  idle: 500,
  /** Pointer glides over to the day cell. */
  moving: 620,
  /** Click lands: ripple, cell selects. */
  clicking: 400,
  /** Beat on the finished text before Enter. */
  review: 420,
  /** Enter is down and the popover is on its way out. */
  entering: 300,
  /** An event has landed; pause before going back for the next one. */
  settling: 620,
  /** The finished day, with all six events on it. */
  saved: 2200,
  /** Everything fades back out before the next run. */
  resetting: 420,
} as const;

type Phase = keyof typeof BEATS | 'typing';

/** Breathing room between the input card and the demo, matching the gap the
 *  popover's own flex column uses. Kept in sync with `--qe-demo-gap` in the CSS. */
const DEMO_GAP = 12;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The same start–end summary the real hint line shows, for the typed prefix. */
function summarize(text: string): string {
  const parsed = parseQuickEntry(text);
  if (!parsed.time) return 'All day';
  const end =
    parsed.endTime ??
    minutesToTime(Math.min(timeToMinutes(parsed.time) + DEFAULT_DURATION_MIN, 24 * 60 - 1));
  return `${parsed.time}–${end}`;
}

/**
 * A looping mini screencast under the quick-entry box, framed on the one day
 * cell that matters: the pointer clicks the cell, `1230 1410 gym` types into a
 * scaled-down copy of the popover above, Enter lands, and a 12:30 event drops
 * into the cell — then it does it again with `0900 bank meeting`, which slots
 * in ABOVE the first one because the day sorts by time. That's the whole
 * feature, shown rather than described.
 *
 * It's a mock — it never touches real events — but the summary line runs the
 * typed prefix through the real parser, so what it promises can't drift from
 * what the box above actually does. The close button writes the same setting as
 * the Settings checkbox, so dismissing it here sticks.
 */
export function QuickEntryDemo() {
  const setShowQuickEntryDemo = useSettingsStore((s) => s.setShowQuickEntryDemo);
  const [reduced] = useState(prefersReducedMotion);
  const [typed, setTyped] = useState(reduced ? DEMO_EVENTS[1].text : '');
  const [phase, setPhase] = useState<Phase>(reduced ? 'saved' : 'idle');
  /** How many of DEMO_EVENTS are sitting in the cell right now. */
  const [landed, setLanded] = useState(reduced ? 2 : 0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<'below' | 'above'>('below');

  // Hang the demo off whichever side of the input card has room for it —
  // below by default, above when the day sits near the bottom of the window.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const anchor = card?.parentElement;
    if (!card || !anchor) return;

    const decide = () => {
      const rect = anchor.getBoundingClientRect();
      const needed = card.offsetHeight + DEMO_GAP;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      setSide(below >= needed || below >= above ? 'below' : 'above');
    };

    decide();
    // On the first frame the popover is still at floating-ui's placeholder
    // position, so that first measurement is of the wrong spot. Watch the
    // floating element's inline style — autoUpdate rewrites it on every
    // reposition, including the one that lands it on the day — and re-decide.
    const floating = card.closest('.popover');
    const styleWatch = floating
      ? new MutationObserver(decide)
      : null;
    styleWatch?.observe(floating!, { attributes: true, attributeFilter: ['style'] });

    window.addEventListener('resize', decide);
    window.addEventListener('scroll', decide, true);
    return () => {
      styleWatch?.disconnect();
      window.removeEventListener('resize', decide);
      window.removeEventListener('scroll', decide, true);
    };
  }, []);

  useEffect(() => {
    // Reduced motion gets the last frame, held still: same lesson, no movement.
    if (reduced) return;

    let cancelled = false;
    const timers = new Set<number>();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });
    /** Run a beat; returns false once the component is gone. */
    const beat = async (next: Phase, ms: number) => {
      setPhase(next);
      await wait(ms);
      return !cancelled;
    };

    /** Type one event's text out and land it in the cell. */
    const addEvent = async (index: number) => {
      const { text } = DEMO_EVENTS[index];
      setPhase('typing');
      for (let i = 1; i <= text.length; i++) {
        setTyped(text.slice(0, i));
        // A space reads as a deliberate pause between the time and what follows.
        await wait(text[i - 1] === ' ' ? CHAR_MS * 2.5 : CHAR_MS);
        if (cancelled) return false;
      }
      if (!(await beat('review', BEATS.review))) return false;
      if (!(await beat('entering', BEATS.entering))) return false;
      setLanded(index + 1);
      return true;
    };

    void (async () => {
      for (;;) {
        setTyped('');
        setLanded(0);
        if (!(await beat('idle', BEATS.idle))) return;
        // The pointer travels to the cell for the first one; after that it's
        // already there and just clicks again.
        if (!(await beat('moving', BEATS.moving))) return;

        for (let i = 0; i < DEMO_EVENTS.length; i++) {
          if (!(await beat('clicking', BEATS.clicking))) return;
          if (!(await addEvent(i))) return;
          const last = i === DEMO_EVENTS.length - 1;
          if (!(await beat(last ? 'saved' : 'settling', last ? BEATS.saved : BEATS.settling))) {
            return;
          }
        }

        if (!(await beat('resetting', BEATS.resetting))) return;
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, [reduced]);

  // Everything from the click to the moment the event lands.
  const popoverOpen = phase === 'typing' || phase === 'review' || phase === 'entering';
  const cellActive = phase !== 'idle' && phase !== 'moving';

  /** Which row an event occupies: the day sorts by time with all-day first, so
   *  a later arrival with an earlier time slots in above and pushes the rest
   *  down. Events not yet landed are given the row they'll take when they do,
   *  so they fade in already in place instead of sliding in from nowhere. */
  const minutesOf = (e: (typeof DEMO_EVENTS)[number]) =>
    e.time === null ? -1 : timeToMinutes(e.time);
  const rowOf = (index: number) =>
    DEMO_EVENTS.filter((_, i) => i < landed || i === index)
      .sort((a, b) => minutesOf(a) - minutesOf(b))
      .findIndex((e) => e === DEMO_EVENTS[index]);

  return (
    <div ref={cardRef} className={`qe-demo qe-demo-${phase} is-${side}`}>
      <button
        className="qe-close-btn"
        title="Hide this tip"
        aria-label="Hide this tip"
        onClick={() => setShowQuickEntryDemo(false)}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      </button>

      <div className="qe-demo-stage" aria-hidden="true">
        <div className={`qe-demo-cell${cellActive ? ' is-active' : ''}`}>
          <span className="qe-demo-daynum">23</span>
          {DEMO_EVENTS.map((event, i) => (
            <span
              key={event.text}
              className={
                'qe-demo-event' +
                (event.time === null ? ' is-allday' : '') +
                (i < landed ? ' is-in' : '')
              }
              style={{ '--row': rowOf(i) } as CSSProperties}
            >
              {event.time && <span className="qe-demo-event-time">{event.time}</span>}
              {event.title}
            </span>
          ))}
        </div>

        {/* The neighbour, mostly covered by the popover — same as the real thing. */}
        <div className="qe-demo-cell qe-demo-cell-next">
          <span className="qe-demo-daynum">24</span>
        </div>

        <div className={`qe-demo-pop${popoverOpen ? ' is-open' : ''}`}>
          <div className={`qe-demo-pop-input${phase === 'entering' ? ' is-entering' : ''}`}>
            <span className="qe-demo-pop-text">{typed}</span>
            <span className="qe-demo-caret" />
          </div>
          <div className="qe-demo-pop-hint">
            Wed 23 · {summarize(typed)} · <span className="qe-demo-enter">Enter</span>
          </div>
        </div>

        <span className="qe-demo-ripple" />

        <svg className="qe-demo-pointer" viewBox="0 0 12 18" width="12" height="18">
          <path
            d="M1 1.2 L1 15.2 L4.6 11.9 L6.9 16.9 L9.1 15.9 L6.9 11.1 L11 11.1 Z"
            fill="var(--color-text)"
            stroke="var(--color-surface)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
