import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventHoverCard } from './EventHoverCard';
import { useEventHoverStore, requestEventHover, HOVER_OPEN_DELAY_MS } from './eventHoverStore';
import { useSelectionStore } from '../app/selectionStore';

function anchor(clipped = false): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: clipped ? 200 : 100, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true });
  document.body.appendChild(el);
  return el;
}

const DESCRIPTION = 'Fifteen minutes, standing. Blockers only.';

function open(data: Partial<Parameters<typeof requestEventHover>[1]> = {}, clipped = false) {
  act(() => {
    requestEventHover(anchor(clipped), {
      title: 'Standup',
      when: '09:30',
      description: DESCRIPTION,
      color: '#0a84ff',
      ...data,
    });
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
  });
}

describe('EventHoverCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useEventHoverStore.setState({ shown: null });
    useSelectionStore.getState().exit();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders nothing until an event is hovered', () => {
    const { container } = render(<EventHoverCard />);
    expect(container.firstChild).toBeNull();
    expect(document.querySelector('.ehc-card')).toBeNull();
  });

  it('puts every word in the DOM on the first frame so the card cannot grow while it streams', () => {
    render(<EventHoverCard />);
    open();

    const words = [...document.querySelectorAll('.ehc-word')].map((w) => w.textContent);
    expect(words).toEqual(DESCRIPTION.split(' '));
    // The whole sentence is present as text from the outset — only opacity
    // changes as it arrives, so the height is settled before the first paint.
    expect(document.querySelector('.ehc-desc')?.textContent).toBe(DESCRIPTION);
  });

  it('starts with the description hidden and reveals it word by word', () => {
    render(<EventHoverCard />);
    open();

    const total = document.querySelectorAll('.ehc-word').length;
    expect(document.querySelectorAll('.ehc-word.is-in').length).toBeLessThan(total);
  });

  it('shows the time and title in the footer, not in place of the description', () => {
    render(<EventHoverCard />);
    open();

    expect(document.querySelector('.ehc-foot-text')?.textContent).toBe('09:30 · Standup');
  });

  it('carries the event colour through to the footer dot', () => {
    render(<EventHoverCard />);
    open();

    const card = document.querySelector('.ehc-card') as HTMLElement;
    expect(card.style.getPropertyValue('--event-color')).toBe('#0a84ff');
  });

  it('shows a bare title — and no duplicate in the footer — when a clipped chip has no description', () => {
    render(<EventHoverCard />);
    open({ description: '' }, true);

    const card = document.querySelector('.ehc-card') as HTMLElement;
    expect(card.className).toContain('is-bare');
    expect(document.querySelector('.ehc-bare-title')?.textContent).toBe('Standup');
    expect(document.querySelector('.ehc-desc')).toBeNull();
    expect(document.querySelector('.ehc-foot-text')?.textContent).toBe('09:30');
  });

  it('drops the footer entirely when an all-day span has nothing left to say there', () => {
    render(<EventHoverCard />);
    open({ description: '', when: '' }, true);

    expect(document.querySelector('.ehc-foot')).toBeNull();
    expect(document.querySelector('.ehc-bare-title')?.textContent).toBe('Standup');
  });
});
