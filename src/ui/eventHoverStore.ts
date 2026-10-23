import { create } from 'zustand';
import { useSelectionStore } from '../app/selectionStore';

/** What the card says about the event under the pointer. */
export interface EventHoverData {
  title: string;
  /** Already formatted for display — "09:30", "09:30–10:30", "All day". */
  when: string;
  /** The event's description. Empty means there is nothing worth a card. */
  description: string;
  /** The event's colour, for the footer dot. */
  color?: string;
}

interface Shown {
  anchor: HTMLElement;
  data: EventHoverData;
  /** True when there is no description and we are only rescuing a clipped title. */
  bare: boolean;
}

interface EventHoverState {
  shown: Shown | null;
}

export const useEventHoverStore = create<EventHoverState>(() => ({ shown: null }));

/** Long enough that dragging the pointer across a week doesn't fire a dozen cards. */
export const HOVER_OPEN_DELAY_MS = 260;

let openTimer: ReturnType<typeof setTimeout> | undefined;
/** True between pointerdown and pointerup anywhere: every drag, resize and
 *  span-create in the app starts that way, so one flag suppresses them all. */
let pointerHeld = false;

function clearTimer() {
  if (openTimer !== undefined) {
    clearTimeout(openTimer);
    openTimer = undefined;
  }
}

/** Is the anchor's own text clipped? Only then is a title worth a card of its
 *  own — otherwise it just repeats what the chip already shows. */
function isTextClipped(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export function requestEventHover(anchor: HTMLElement, data: EventHoverData): void {
  clearTimer();
  // Never over a held pointer: that is a move, a resize or a drag-to-create.
  if (pointerHeld) return;
  // In bulk-select mode chips are checkboxes, not events to read about.
  if (useSelectionStore.getState().active) return;

  const description = data.description.trim();
  const bare = description === '';
  if (bare && !isTextClipped(anchor)) return;

  openTimer = setTimeout(() => {
    openTimer = undefined;
    useEventHoverStore.setState({ shown: { anchor, data: { ...data, description }, bare } });
  }, HOVER_OPEN_DELAY_MS);
}

/** Close the card. Pass the anchor to only close that anchor's card, so a
 *  pointer that has already moved on to the next chip isn't cut off. */
export function closeEventHover(anchor?: HTMLElement): void {
  clearTimer();
  const { shown } = useEventHoverStore.getState();
  if (!shown) return;
  if (anchor && shown.anchor !== anchor) return;
  useEventHoverStore.setState({ shown: null });
}

/** Global guards. Installed once by EventHoverCard, which is always mounted. */
export function installEventHoverGuards(): () => void {
  const down = () => {
    pointerHeld = true;
    closeEventHover();
  };
  const up = () => {
    pointerHeld = false;
  };
  const away = () => closeEventHover();

  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', away);
  window.addEventListener('wheel', away, { passive: true });
  // Capture, so scrolling any pane inside the app closes it too.
  window.addEventListener('scroll', away, true);

  return () => {
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    window.removeEventListener('blur', away);
    window.removeEventListener('wheel', away);
    window.removeEventListener('scroll', away, true);
    clearTimer();
    pointerHeld = false;
  };
}

/**
 * Handlers to spread onto any event surface — month chips, span bars, week
 * blocks, all-day bars. Deliberately not a wrapper component: the grid is not
 * virtualised, so an extra element (and an extra floating-ui instance) per chip
 * would be paid for on every render of every visible month.
 */
export function eventHoverProps(data: EventHoverData) {
  return {
    onPointerEnter: (e: { currentTarget: HTMLElement; pointerType?: string }) => {
      // Touch has no hover; a long-press there is the context menu's business.
      if (e.pointerType === 'touch') return;
      requestEventHover(e.currentTarget, data);
    },
    onPointerLeave: (e: { currentTarget: HTMLElement }) => closeEventHover(e.currentTarget),
    onFocus: (e: { currentTarget: HTMLElement }) => requestEventHover(e.currentTarget, data),
    onBlur: (e: { currentTarget: HTMLElement }) => closeEventHover(e.currentTarget),
  };
}
