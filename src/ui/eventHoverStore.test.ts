import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSelectionStore } from '../app/selectionStore';
import {
  HOVER_OPEN_DELAY_MS,
  closeEventHover,
  installEventHoverGuards,
  requestEventHover,
  useEventHoverStore,
} from './eventHoverStore';

/** A stand-in chip. `clipped` decides whether its text is cut off, which is the
 *  only reason a description-less event still gets a card. */
function anchor(clipped = false): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: clipped ? 200 : 100, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true });
  document.body.appendChild(el);
  return el;
}

const DATA = { title: 'Standup', when: '09:30', description: 'Blockers only.', color: '#0a84ff' };

describe('eventHoverStore', () => {
  let teardown: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    useEventHoverStore.setState({ shown: null });
    useSelectionStore.getState().exit();
    teardown = installEventHoverGuards();
  });

  afterEach(() => {
    teardown();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('waits out the open delay before showing anything', () => {
    requestEventHover(anchor(), DATA);
    expect(useEventHoverStore.getState().shown).toBeNull();

    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 1);
    expect(useEventHoverStore.getState().shown).toBeNull();

    vi.advanceTimersByTime(1);
    expect(useEventHoverStore.getState().shown?.data.description).toBe('Blockers only.');
  });

  it('never opens for a pointer that has already moved on', () => {
    const a = anchor();
    requestEventHover(a, DATA);
    closeEventHover(a);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS * 2);
    expect(useEventHoverStore.getState().shown).toBeNull();
  });

  it('leaves a card that belongs to a different anchor alone', () => {
    const a = anchor();
    const b = anchor();
    requestEventHover(a, DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

    closeEventHover(b);
    expect(useEventHoverStore.getState().shown?.anchor).toBe(a);

    closeEventHover(a);
    expect(useEventHoverStore.getState().shown).toBeNull();
  });

  it('shows nothing for an event with no description', () => {
    requestEventHover(anchor(), { ...DATA, description: '   ' });
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(useEventHoverStore.getState().shown).toBeNull();
  });

  it('falls back to a bare title when there is no description but the chip is clipped', () => {
    requestEventHover(anchor(true), { ...DATA, description: '' });
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

    const shown = useEventHoverStore.getState().shown;
    expect(shown?.bare).toBe(true);
    expect(shown?.data.title).toBe('Standup');
  });

  it('stays shut while a pointer is held — every drag and resize starts that way', () => {
    window.dispatchEvent(new Event('pointerdown'));
    requestEventHover(anchor(), DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(useEventHoverStore.getState().shown).toBeNull();

    window.dispatchEvent(new Event('pointerup'));
    requestEventHover(anchor(), DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(useEventHoverStore.getState().shown).not.toBeNull();
  });

  it('closes an open card the moment a drag begins', () => {
    requestEventHover(anchor(), DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(useEventHoverStore.getState().shown).not.toBeNull();

    window.dispatchEvent(new Event('pointerdown'));
    expect(useEventHoverStore.getState().shown).toBeNull();
  });

  it('stays shut in bulk-select mode, where chips are checkboxes', () => {
    useSelectionStore.getState().enter();
    requestEventHover(anchor(), DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(useEventHoverStore.getState().shown).toBeNull();
  });

  it('closes on scroll, so the card cannot drift away from its chip', () => {
    requestEventHover(anchor(), DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);

    window.dispatchEvent(new Event('scroll'));
    expect(useEventHoverStore.getState().shown).toBeNull();
  });

  it('drops the guards on teardown', () => {
    teardown();
    teardown = () => {};

    // A stale pointerdown listener would leave pointerHeld stuck on and
    // suppress every card from here on.
    window.dispatchEvent(new Event('pointerdown'));
    teardown = installEventHoverGuards();
    requestEventHover(anchor(), DATA);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(useEventHoverStore.getState().shown).not.toBeNull();
  });
});
