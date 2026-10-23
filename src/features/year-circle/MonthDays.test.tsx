import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CalendarEvent } from '../../core/types';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { useSettingsStore } from '../../app/settingsStore';
import { MonthDays } from './MonthDays';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  useCalendarStore.setState({ events: [] });
  // July 2026: the 1st is a Wednesday, so the grid runs Mon 29 Jun → Sun 2 Aug.
  useUiStore.setState({
    viewedDate: '2026-07-15',
    selectedDate: '2026-07-15',
    hoveredDate: null,
    weekWindowStart: null,
  });
  useSettingsStore.setState({
    minimapFilter: 'onetime',
    categories: {},
    calendarViewMode: 'continuous',
  });
});

describe('MonthDays minimap', () => {
  it('lays out the viewed month as numbered days, Monday first', () => {
    const { container } = render(<MonthDays />);

    expect(screen.getByRole('button', { name: /July 2026/ })).toBeInTheDocument();
    const days = [...container.querySelectorAll('.minimap-day')];
    expect(days).toHaveLength(35); // five weeks
    expect(days[0].getAttribute('aria-label')).toBe('2026-06-29');
    expect(days[0].textContent).toBe('29');
    expect(days[34].getAttribute('aria-label')).toBe('2026-08-02');

    // Days from the neighbouring months are dimmed rather than dropped.
    expect(days[0].className).toContain('is-outside');
    expect(days[2].className).not.toContain('is-outside'); // 1 July
  });

  it('marks the selected day', () => {
    const { container } = render(<MonthDays />);

    const day = (iso: string) => container.querySelector(`.minimap-day[aria-label="${iso}"]`)!;
    expect(day('2026-07-15').className).toContain('is-selected');
    expect(day('2026-07-16').className).not.toContain('is-selected');
  });

  it('shows the days and nothing else — events belong to the calendar', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Dentist', date: '2026-07-06', recurrence: null, color: '#ff0000' },
      { ...base, id: '2', title: 'Trip', date: '2026-07-10', endDate: '2026-07-12', recurrence: null },
    ];
    useCalendarStore.setState({ events });
    const { container } = render(<MonthDays />);

    const day = container.querySelector('.minimap-day[aria-label="2026-07-06"]')!;
    expect(day.textContent).toBe('6');
    // Nothing in a cell but its numeral, however busy the day is.
    expect(day.children).toHaveLength(1);
    expect(container.querySelector('.minimap-day-dot')).toBeNull();
    expect(container.querySelector('.minimap-day-tick')).toBeNull();
  });

  it('moves the calendar to a clicked day and selects it', () => {
    const { container } = render(<MonthDays />);

    fireEvent.click(container.querySelector('.minimap-day[aria-label="2026-07-23"]')!);

    expect(useUiStore.getState().viewedDate).toBe('2026-07-23');
    expect(useUiStore.getState().selectedDate).toBe('2026-07-23');
  });

  it('bands the seven days Week view is showing, and only in Week view', () => {
    useSettingsStore.setState({ calendarViewMode: 'week' });
    useUiStore.setState({ weekWindowStart: '2026-07-13' }); // a Monday
    const { container } = render(<MonthDays />);

    const banded = () =>
      [...container.querySelectorAll('.minimap-day.is-in-week')].map((d) => d.getAttribute('aria-label'));
    const cls = (name: string) =>
      [...container.querySelectorAll(`.minimap-day.${name}`)].map((d) => d.getAttribute('aria-label'));

    expect(banded()).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15',
      '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19',
    ]);
    // A Monday-aligned window is one row, so it is rounded off at both ends.
    expect(cls('is-week-start')).toEqual(['2026-07-13']);
    expect(cls('is-week-end')).toEqual(['2026-07-19']);

    // The scrolling views show many weeks, so they get no band.
    act(() => useSettingsStore.setState({ calendarViewMode: 'continuous' }));
    expect(banded()).toEqual([]);
  });

  it('caps the band at the row break when the week window rolls mid-week', () => {
    // Week view's window rolls a day at a time, so Wed → Tue is a normal state.
    useSettingsStore.setState({ calendarViewMode: 'week' });
    useUiStore.setState({ weekWindowStart: '2026-07-15' }); // a Wednesday
    const { container } = render(<MonthDays />);
    const cls = (name: string) =>
      [...container.querySelectorAll(`.minimap-day.${name}`)].map((d) => d.getAttribute('aria-label'));

    expect(cls('is-in-week')).toEqual([
      '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18',
      '2026-07-19', '2026-07-20', '2026-07-21',
    ]);
    // Two segments: Wed → Sun on one row, Mon → Tue on the next.
    expect(cls('is-week-start')).toEqual(['2026-07-15', '2026-07-20']);
    expect(cls('is-week-end')).toEqual(['2026-07-19', '2026-07-21']);
  });

  it('bands a week that straddles two months', () => {
    useSettingsStore.setState({ calendarViewMode: 'week' });
    useUiStore.setState({ viewedDate: '2026-07-01', weekWindowStart: '2026-06-29' });
    const { container } = render(<MonthDays />);

    expect([...container.querySelectorAll('.minimap-day.is-in-week')].map((d) => d.getAttribute('aria-label')))
      .toEqual([
        '2026-06-29', '2026-06-30', '2026-07-01',
        '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
      ]);
  });

  it('mirrors the day the pointer is on in the calendar', () => {
    const { container } = render(<MonthDays />);
    expect(container.querySelector('.minimap-day.is-hovered')).toBeNull();

    act(() => useUiStore.getState().setHoveredDate('2026-07-08'));
    expect(container.querySelector('.minimap-day.is-hovered')!.getAttribute('aria-label')).toBe('2026-07-08');

    act(() => useUiStore.getState().setHoveredDate(null));
    expect(container.querySelector('.minimap-day.is-hovered')).toBeNull();
  });

  it('steps whole months, clamping the day into a shorter month', () => {
    useUiStore.setState({ viewedDate: '2026-07-31' });
    render(<MonthDays />);

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(useUiStore.getState().viewedDate).toBe('2026-08-31');

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(useUiStore.getState().viewedDate).toBe('2026-09-30');

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(useUiStore.getState().viewedDate).toBe('2026-08-30');
  });

  it('rolls over the year boundary', () => {
    useUiStore.setState({ viewedDate: '2026-01-10' });
    render(<MonthDays />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(useUiStore.getState().viewedDate).toBe('2025-12-10');
  });

  it('walks day by day with the arrow keys', () => {
    const { container } = render(<MonthDays />);
    const grid = container.querySelector('.minimap-days-grid')!;

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(useUiStore.getState().viewedDate).toBe('2026-07-16');

    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(useUiStore.getState().viewedDate).toBe('2026-07-23');

    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(useUiStore.getState().viewedDate).toBe('2026-07-15');
  });
});
