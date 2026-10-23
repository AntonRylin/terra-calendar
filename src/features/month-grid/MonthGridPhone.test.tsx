import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MonthGrid } from './MonthGrid';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';
import { MOBILE_QUERY } from '../../ui/useMediaQuery';
import { handleBack } from '../../app/androidBack';

vi.mock('../../data/dayImageStore', () => ({ listImageIds: async () => [] }));

const desktopMatchMedia = window.matchMedia;

beforeEach(async () => {
  window.matchMedia = ((query: string) => ({
    ...desktopMatchMedia(query),
    matches: query === MOBILE_QUERY,
  })) as typeof window.matchMedia;
  useUiStore.setState({ viewedDate: null, selectedDate: '2026-06-12', quickEntry: null, editor: null, specialDayEditor: null });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 12)); // June 12, 2026
  await useCalendarStore.getState().init(
    new MemoryRepository([
      {
        id: 'e1',
        title: 'Dentist',
        date: '2026-06-15',
        time: '14:30',
        endTime: '15:00',
        recurrence: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]),
  );
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = desktopMatchMedia;
});

const tile = (container: HTMLElement, date: string) =>
  container.querySelector(`.day-tile[data-date="${date}"]`) as HTMLElement;

describe('MonthGrid on a phone', () => {
  it('has a one-row app bar: month without the current year, today and view buttons', () => {
    const { container } = render(<MonthGrid />);
    expect(container.querySelector('.mobile-header .month-title')).toHaveTextContent(/^June$/);
    expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Calendar view:/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add event' })).not.toBeInTheDocument();
    expect(container.querySelector('.mobile-header-nav')).toBeNull();
  });

  it('shows weekday initials and no clock on today', () => {
    const { container } = render(<MonthGrid />);
    const initials = [...container.querySelectorAll('.weekday-row > div')].map((d) => d.textContent);
    expect(initials).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(container.querySelector('.today-clock')).toBeNull();
    expect(tile(container, '2026-06-12').querySelector('.day-num')).toHaveTextContent('12');
  });

  it('opens a day sheet on tap, listing the day with its events', () => {
    const { container } = render(<MonthGrid />);
    fireEvent.click(tile(container, '2026-06-15'));

    const sheet = screen.getByRole('dialog', { name: 'Monday, 15 June' });
    expect(within(sheet).getByText('Dentist')).toBeInTheDocument();
    expect(within(sheet).getByText(/14:30 – 15:00/)).toBeInTheDocument();
    expect(useUiStore.getState().selectedDate).toBe('2026-06-15');
    // Not the desktop quick-entry popover.
    expect(useUiStore.getState().quickEntry).toBeNull();
  });

  it('opens the editor from an event row and closes the sheet', () => {
    const { container } = render(<MonthGrid />);
    fireEvent.click(tile(container, '2026-06-15'));
    const sheet = screen.getByRole('dialog', { name: 'Monday, 15 June' });
    fireEvent.click(within(sheet).getByRole('button', { name: /Dentist/ }));

    expect(useUiStore.getState().editor?.eventId).toBe('e1');
    expect(container.ownerDocument.querySelector('.day-sheet')).toBeNull();
  });

  it('adds an event or styles the day from the sheet', () => {
    const { container } = render(<MonthGrid />);
    fireEvent.click(tile(container, '2026-06-16'));
    expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New event' }));
    expect(useUiStore.getState().quickEntry?.date).toBe('2026-06-16');

    fireEvent.click(tile(container, '2026-06-17'));
    fireEvent.click(screen.getByRole('button', { name: 'Style this day' }));
    expect(useUiStore.getState().specialDayEditor?.date).toBe('2026-06-17');
  });

  it('closes the day sheet with the Android back gesture', () => {
    const { container } = render(<MonthGrid />);
    fireEvent.click(tile(container, '2026-06-15'));
    expect(container.ownerDocument.querySelector('.day-sheet')).not.toBeNull();

    act(() => {
      handleBack();
      vi.runAllTimers(); // the sheet's slide-down
    });
    expect(container.ownerDocument.querySelector('.day-sheet')).toBeNull();
  });
});
