import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WeekView } from './WeekView';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore } from '../../app/settingsStore';
import { useUiStore } from '../../app/uiStore';

let viewportHeight = 600;
const observers: { callback: ResizeObserverCallback; target?: Element }[] = [];

beforeEach(() => {
  viewportHeight = 600;
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', class {
    record: typeof observers[number];
    constructor(callback: ResizeObserverCallback) {
      this.record = { callback };
      observers.push(this.record);
    }
    observe(target: Element) { this.record.target = target; }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('wv-scroll') ? viewportHeight : 0;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  useSettingsStore.setState({ displayTimeZone: 'UTC', categories: {} });
  useUiStore.setState({ viewedDate: '2026-09-07', selectedDate: undefined, weekFocusDate: null });
  useCalendarStore.setState({ events: [{
    id: 'height-test', title: 'Morning meeting', date: '2026-09-08',
    time: '09:00', endTime: '10:00', tz: 'UTC', recurrence: null,
    createdAt: '', updatedAt: '',
  }] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useCalendarStore.setState({ events: [] });
});

function resize(height: number) {
  viewportHeight = height;
  act(() => {
    for (const observer of observers) {
      observer.callback([], {} as ResizeObserver);
    }
  });
}

it('names both months when the displayed week crosses a month boundary', () => {
  useUiStore.setState({ viewedDate: '2026-10-26' });
  render(<WeekView />);
  expect(screen.getByText('26 Oct – 1 Nov')).toBeInTheDocument();
});

it('shows separate start and end times alongside the event title', () => {
  render(<WeekView />);
  const block = screen.getByRole('button', { name: /Morning meeting/ });
  expect(within(block).getByText('09:00', { selector: 'time' })).toHaveAttribute('dateTime', '09:00');
  expect(within(block).getByText('10:00', { selector: 'time' })).toHaveAttribute('dateTime', '10:00');
  expect(within(block).queryByText('09:00–10:00')).not.toBeInTheDocument();
  expect(block).toHaveStyle({ top: '432px', height: '48px' });
});

it('fills a tall viewport and keeps timed events and hour labels aligned after resizing', () => {
  const { container } = render(<WeekView />);
  const block = screen.getByText('Morning meeting').closest('.wv-block')!;
  expect(block).toHaveStyle({ top: '432px', height: '48px' });

  resize(1440);
  expect(block).toHaveStyle({ top: '540px', height: '60px' });
  expect(screen.getByText('09:00', { selector: '.wv-hour-label' })).toHaveStyle({ top: '540px' });
  expect((container.querySelector('.week-view') as HTMLElement).style.getPropertyValue('--wv-hour')).toBe('60px');

  resize(720);
  expect(block).toHaveStyle({ top: '432px', height: '48px' });
  expect(screen.getByText('09:00', { selector: '.wv-hour-label' })).toHaveStyle({ top: '432px' });
});

it('measures the available grid height on first render', () => {
  viewportHeight = 1728;
  render(<WeekView />);
  expect(screen.getByText('Morning meeting').closest('.wv-block')).toHaveStyle({ top: '648px', height: '72px' });
});

it('centers a requested day using layout pixels at enlarged interface scale', () => {
  useSettingsStore.setState({ fontScale: 1.4 });
  useCalendarStore.setState({ events: [] });
  useUiStore.setState({ selectedDate: '2026-09-08', viewedDate: '2026-09-08', weekFocusDate: '2026-09-08' });
  // The visible track is 500 CSS px, painted as 700 px at 140% zoom.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('wv-cols-clip') ? 500 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, this.classList.contains('wv-cols-clip') ? 700 : 0, 600);
  });
  const { container } = render(<WeekView />);
  // Columns are 100 CSS px here: the fourth day's center is 350. Move it
  // left 100 CSS px to the track center (250), not the visual-pixel midpoint.
  expect((container.querySelector('.wv-day-headers') as HTMLElement).style.translate).toBe('-100px');
  expect(useUiStore.getState().weekFocusDate).toBeNull();
});

function phone() {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query.includes('max-width: 768px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

it('shows three days on a phone, opening on today, with today in the app bar', () => {
  phone();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
  try {
    useUiStore.setState({ viewedDate: '2026-09-01' });
    const { container } = render(<WeekView />);
    const shown = () => [...container.querySelectorAll<HTMLElement>('.wv-day-head')]
      .map((b) => b.dataset.date)
      .slice(3, 6);
    expect(shown()).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^September$/);
    expect(screen.queryByRole('button', { name: 'Next week' })).not.toBeInTheDocument();

    act(() => useUiStore.setState({ viewedDate: '2026-09-29' }));
    expect(shown()).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Sep – Oct$/);

    act(() => screen.getByRole('button', { name: 'Go to today' }).click());
    expect(shown()).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
  } finally {
    vi.useRealTimers();
  }
});

it('gives phone events a fixed title with their times underneath', () => {
  phone();
  useUiStore.setState({ viewedDate: '2026-09-08', selectedDate: '2026-09-08' });
  render(<WeekView />);
  const block = screen.getByRole('button', { name: /Morning meeting/ });
  expect(block.querySelector('.wv-phone-title')).toHaveTextContent('Morning meeting');
  expect(block.querySelector('.wv-title-text')).toBeNull();
  expect(within(block).getByText('09:00', { selector: 'time' })).toBeInTheDocument();
});
