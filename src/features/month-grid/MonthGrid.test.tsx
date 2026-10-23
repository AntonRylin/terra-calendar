import { render, screen, fireEvent, act } from '@testing-library/react';
import { MonthGrid } from './MonthGrid';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';
import { buildUpcoming } from '../upcoming-stack/upcoming';
import { useSettingsStore } from '../../app/settingsStore';
import { useConfirmStore } from '../../ui/confirmStore';

// These fixtures contain no images; jsdom has no IndexedDB for the startup sweep.
vi.mock('../../data/dayImageStore', () => ({ listImageIds: async () => [] }));

beforeEach(async () => {
  useUiStore.setState({ viewedDate: null, selectedDate: '2026-06-12' });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 12)); // June 12, 2026
  await useCalendarStore.getState().init(
    new MemoryRepository([
      {
        id: 'e1',
        title: 'Dentist',
        date: '2026-06-12',
        time: '14:30',
        recurrence: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]),
  );
});

afterEach(() => vi.useRealTimers());

describe('MonthGrid', () => {
  it('shows the current month title', () => {
    const { container } = render(<MonthGrid />);
    // "June"/"2026" also appear in month-boundary markers and block titles, so
    // scope the assertion to the header title rather than matching anywhere.
    const title = container.querySelector('.month-title');
    expect(title).toHaveTextContent('June');
    expect(title).toHaveTextContent('2026');
  });

  it('renders a continuous stream of week rows', () => {
    const { container } = render(<MonthGrid />);
    // Initial window is 26 weeks before + current + 26 after = 53 rows.
    expect(container.querySelectorAll('.week-row')).toHaveLength(53);
    expect(container.querySelectorAll('.day-tile')).toHaveLength(53 * 7);
  });

  it('labels month boundaries and alternates month tint', () => {
    const { container } = render(<MonthGrid />);
    // Every rendered month contributes exactly one "1st of month" marker.
    expect(container.querySelectorAll('.month-marker').length).toBeGreaterThan(1);
    expect(container.querySelector('.month-tint-a')).toBeInTheDocument();
    expect(container.querySelector('.month-tint-b')).toBeInTheDocument();
  });

  it('highlights today exactly once', () => {
    const { container } = render(<MonthGrid />);
    expect(container.querySelectorAll('.day-tile-today')).toHaveLength(1);
  });

  it('shows "Showing today" (disabled) when today is in view on mount', () => {
    render(<MonthGrid />);
    const btn = screen.getByRole('button', { name: 'Showing today' });
    expect(btn).toBeDisabled();
  });

  it('renders event chips with time', () => {
    render(<MonthGrid />);
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
    expect(screen.getByText(/Dentist/)).toBeInTheDocument();
  });

  it('coalesces a burst of scroll events into one handler run per frame', () => {
    const { container } = render(<MonthGrid />);
    const scroller = container.querySelector('.week-scroll')!;
    expect(container.querySelectorAll('.week-row')).toHaveLength(53);

    // A single wheel gesture fires `scroll` many times per frame. jsdom reports
    // scrollTop 0, so every run of the handler extends the window by a CHUNK —
    // which makes the row count a direct read on how often it ran. Unthrottled
    // this would be 53 + 20 * 12 rows.
    for (let i = 0; i < 20; i++) fireEvent.scroll(scroller);
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(container.querySelectorAll('.week-row')).toHaveLength(53 + 12);

    // The next gesture schedules its own frame rather than being dropped.
    for (let i = 0; i < 20; i++) fireEvent.scroll(scroller);
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(container.querySelectorAll('.week-row')).toHaveLength(53 + 24);
  });

  it('renders every occurrence of recurring events across the scroll window', async () => {
    // Window is 26 weeks before .. 26 after the week of Jun 12 2026
    // (Mon Dec 8 2025 .. ~mid Dec 2026), so recurring events anchored before
    // the window should appear on each occurrence inside it.
    await useCalendarStore.getState().init(
      new MemoryRepository([
        {
          id: 'w1', title: 'Standup', date: '2025-01-06', // a Monday, well before the window
          recurrence: { unit: 'week', interval: 1 },
          createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'm1', title: 'Rent', date: '2025-01-15',
          recurrence: { unit: 'month', interval: 1 },
          createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'o1', title: 'OneOff', date: '2026-06-12', recurrence: null,
          createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );
    render(<MonthGrid />);
    // The 53-week window spans ~12.2 months, so ~53 weekly + ~13 monthly chips.
    expect(screen.getAllByText('Standup').length).toBeGreaterThanOrEqual(50);
    expect(screen.getAllByText('Rent').length).toBeGreaterThanOrEqual(12);
    // A non-recurring event appears exactly once.
    expect(screen.getAllByText('OneOff')).toHaveLength(1);
  });

  it('does not render recurring occurrences before the anchor date', async () => {
    // Weekly event anchored at today; nothing should appear in the ~26 weeks
    // of past that the window also renders.
    await useCalendarStore.getState().init(
      new MemoryRepository([
        {
          id: 'w1', title: 'FutureOnly', date: '2026-06-15', // Monday, on/after today
          recurrence: { unit: 'week', interval: 1 },
          createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );
    render(<MonthGrid />);
    // Window ends ~26 weeks after today, so ~27 future occurrences, but none
    // in the rendered past — i.e. fewer than the full 53 weeks.
    const chips = screen.getAllByText('FutureOnly');
    expect(chips.length).toBeGreaterThanOrEqual(20);
    expect(chips.length).toBeLessThan(40);
  });

  it('moves a single-day non-recurring event via drag and drop', () => {
    const { container } = render(<MonthGrid />);
    const dentistChip = screen.getByText(/Dentist/);
    const targetTile = container.querySelector('[data-date="2026-06-15"]')!;

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type];
      },
      effectAllowed: 'none',
    };

    fireEvent.dragStart(dentistChip, { dataTransfer });
    fireEvent.dragOver(targetTile, { dataTransfer });
    fireEvent.drop(targetTile, { dataTransfer });

    expect(useCalendarStore.getState().events[0].date).toBe('2026-06-15');
  });

  it('moves a recurring event series (All events) via drag and drop', async () => {
    vi.setSystemTime(new Date(2028, 5, 1)); // Set mock system time to June 1, 2028
    // Set up a yearly recurring event starting on 2026-06-05
    const event = {
      id: 'recurring-drag-test',
      title: 'Yearly Order Lenses',
      date: '2026-06-05',
      recurrence: { unit: 'year' as const, interval: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useCalendarStore.setState({ events: [event] });

    // Verify that the event is in the upcoming list before the move
    let upcomingItems = buildUpcoming(useCalendarStore.getState().events, '2026-06-15', 'Europe/Vienna');
    expect(upcomingItems.some(item => item.event.id === event.id)).toBe(true);

    const { container } = render(<MonthGrid />);

    // Find the chips
    const chips = screen.getAllByText(/Yearly Order Lenses/);
    const chip = chips[0];
    const targetTile = container.querySelector('[data-date="2028-06-06"]')!;

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type];
      },
      effectAllowed: 'none',
    };

    // Trigger drag and drop from 2028-06-05 to 2028-06-06
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.drop(targetTile, { dataTransfer });

    // Now the move choices dialog should be open. Let's find and click "All events"
    const allEventsButton = screen.getByRole('button', { name: /All events/ });
    await act(async () => {
      fireEvent.click(allEventsButton);
      await Promise.resolve();
    });

    // Verify that the event date has been shifted to 2026-06-06
    const updatedEvent = useCalendarStore.getState().events.find(e => e.id === event.id)!;
    expect(updatedEvent.date).toBe('2026-06-06');

    // Verify that the event is still in the upcoming list after the move
    upcomingItems = buildUpcoming(useCalendarStore.getState().events, '2026-06-15', 'Europe/Vienna');
    expect(upcomingItems.some(item => item.event.id === event.id)).toBe(true);
  });

  it('moves a recurring event occurrence (Only this event) via drag and drop', async () => {
    vi.setSystemTime(new Date(2028, 5, 1)); // Set mock system time to June 1, 2028
    // Set up a yearly recurring event starting on 2026-06-05
    const event = {
      id: 'recurring-drag-test-single',
      title: 'Yearly Order Lenses Single',
      date: '2026-06-05',
      recurrence: { unit: 'year' as const, interval: 1 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    useCalendarStore.setState({ events: [event] });

    // Verify that the event is in the upcoming list before the move
    let upcomingItems = buildUpcoming(useCalendarStore.getState().events, '2026-06-15', 'Europe/Vienna');
    expect(upcomingItems.some(item => item.event.id === event.id)).toBe(true);

    const { container } = render(<MonthGrid />);

    // Find the chips
    const chips = screen.getAllByText(/Yearly Order Lenses Single/);
    const chip = chips[0];
    const targetTile = container.querySelector('[data-date="2028-06-06"]')!;

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type];
      },
      effectAllowed: 'none',
    };

    // Trigger drag and drop from 2028-06-05 to 2028-06-06
    fireEvent.dragStart(chip, { dataTransfer });
    fireEvent.drop(targetTile, { dataTransfer });

    // Now the move choices dialog should be open. Let's find and click "Only this event"
    const onlyThisEventButton = screen.getByRole('button', { name: /Only this event/ });
    await act(async () => {
      fireEvent.click(onlyThisEventButton);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const updatedEvent = useCalendarStore.getState().events.find(e => e.id === event.id)!;
    expect(updatedEvent.exdates).toBeDefined();
    expect(updatedEvent.exdates).toContain('2028-06-05');

    // Verify that a new non-recurring event is created on 2028-06-06 (targetDate)
    const newEvent = useCalendarStore.getState().events.find(e => e.id !== event.id)!;
    expect(newEvent.date).toBe('2028-06-06');
    expect(newEvent.recurrence).toBeNull();

    // Verify that the new event is present in the upcoming list (as long as today is <= 2028-06-06)
    upcomingItems = buildUpcoming(useCalendarStore.getState().events, '2028-06-01', 'Europe/Vienna');
    expect(upcomingItems.some(item => item.event.id === newEvent.id)).toBe(true);
  });

  it('renders no tiles for adjacent-month days in separate month block mode', () => {
    act(() => {
      useSettingsStore.setState({
        calendarViewMode: 'separate',
        showGrid: true,
      });
    });
    const { container } = render(<MonthGrid />);
    // Non-existent days for a month are invisible placeholders only — no filler
    // tiles and no diagonal crosses.
    expect(container.querySelector('.day-tile-dummy')).toBeNull();
    expect(container.querySelector('.dummy-cross-svg')).toBeNull();
    const placeholders = container.querySelectorAll('.day-tile-empty');
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders[0]).toHaveStyle({ visibility: 'hidden' });
  });

  it('updates selectedDate when a day tile is clicked or when an event is highlighted', () => {
    const { container } = render(<MonthGrid />);

    // Initially, today (2026-06-12) is selected
    expect(useUiStore.getState().selectedDate).toBe('2026-06-12');
    expect(container.querySelector('[data-date="2026-06-12"]')).toHaveClass('day-tile-today');

    // Click on a different day (e.g. 2026-06-15)
    const tile = container.querySelector('[data-date="2026-06-15"]')!;
    fireEvent.click(tile);

    expect(useUiStore.getState().selectedDate).toBe('2026-06-15');
    expect(container.querySelector('[data-date="2026-06-15"]')).toHaveClass('day-tile-today');
    expect(container.querySelector('[data-date="2026-06-12"]')).not.toHaveClass('day-tile-today');

    // Highlight an event on a different date (e.g. 2026-06-18)
    act(() => {
      useUiStore.getState().setHighlightedEvent({ id: 'dummy-id', date: '2026-06-18' });
    });

    expect(useUiStore.getState().selectedDate).toBe('2026-06-18');
    expect(container.querySelector('[data-date="2026-06-18"]')).toHaveClass('day-tile-today');
  });

  it('mirrors the day under the pointer into the ui store', () => {
    const { container } = render(<MonthGrid />);

    fireEvent.pointerOver(container.querySelector('[data-date="2026-06-15"]')!);
    expect(useUiStore.getState().hoveredDate).toBe('2026-06-15');

    fireEvent.pointerOver(container.querySelector('[data-date="2026-06-16"]')!);
    expect(useUiStore.getState().hoveredDate).toBe('2026-06-16');

    fireEvent.pointerLeave(container.querySelector('.week-scroll')!);
    expect(useUiStore.getState().hoveredDate).toBeNull();
  });

  it('triggers delete dialog when Delete or Backspace is pressed on a highlighted event', async () => {
    act(() => {
      useUiStore.getState().setHighlightedEvent({ id: 'e1', date: '2026-06-12' });
    });

    render(<MonthGrid />);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    const request = useConfirmStore.getState().request;
    expect(request).not.toBeNull();
    expect(request?.title).toBe('Delete event');

    act(() => {
      useConfirmStore.getState().resolve(null);
    });
  });

  it('sets highlightedEvent on focus of an event chip and clears it on blur', () => {
    render(<MonthGrid />);
    const chip = screen.getByText('Dentist');

    act(() => {
      chip.focus();
    });

    expect(useUiStore.getState().highlightedEvent).toEqual({ id: 'e1', date: '2026-06-12' });

    act(() => {
      chip.blur();
    });

    expect(useUiStore.getState().highlightedEvent).toBeNull();
  });
});

describe("today's clock", () => {
  // The tick is aligned to whatever the format actually shows, so a
  // seconds-less clock re-renders once a minute instead of 4x a second.
  beforeEach(() => {
    useSettingsStore.setState({ showClockOnToday: true });
    // Start mid-minute so a sub-minute advance can't cross a boundary by luck.
    vi.setSystemTime(new Date(2026, 5, 12, 10, 30, 20));
  });

  it('ticks every second when seconds are shown', () => {
    useSettingsStore.setState((s) => ({ clockStyle: { ...s.clockStyle, showSeconds: true } }));
    const { container } = render(<MonthGrid />);
    expect(container.querySelector('.today-clock')).toHaveTextContent('10:30:20');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector('.today-clock')).toHaveTextContent('10:30:22');
  });

  it('holds steady within the minute when seconds are hidden, then updates', () => {
    useSettingsStore.setState((s) => ({ clockStyle: { ...s.clockStyle, showSeconds: false } }));
    const { container } = render(<MonthGrid />);
    const clock = () => container.querySelector('.today-clock');
    expect(clock()).toHaveTextContent('10:30');

    // 30s later the displayed text is unchanged — and no tick was scheduled
    // before the boundary to re-render it.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(clock()).toHaveTextContent('10:30');

    // Crossing the minute boundary does update it.
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(clock()).toHaveTextContent('10:31');
  });
});
