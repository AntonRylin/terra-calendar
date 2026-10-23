import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MonthGrid } from './MonthGrid';
import { EventEditorHost } from '../event-editor/EventEditorHost';
import { panelRegistry } from '../../app/panels';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore } from '../../app/settingsStore';
import { useUiStore } from '../../app/uiStore';
import { useSelectionStore } from '../../app/selectionStore';
import { useEventClipboard } from '../../app/eventClipboard';
import { MemoryRepository } from '../../data/memoryRepository';

const date = '2026-09-27';

// Image storage is unavailable in jsdom; these fixtures have no day images.
vi.mock('../../data/dayImageStore', () => ({ listImageIds: async () => [] }));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 27, 12));
  useUiStore.getState().closeOverlays();
  useUiStore.setState({ viewedDate: null, selectedDate: date, activeHabitTab: null });
  useSettingsStore.setState({
    calendarViewMode: 'continuous', displayTimeZone: 'UTC', categories: {},
    weatherAndLocationEnabled: false, showClockOnToday: false,
  });
  useSelectionStore.setState({ active: false, selected: new Set() });
  useEventClipboard.setState({ copied: null });
  await useCalendarStore.getState().init(new MemoryRepository(
    Array.from({ length: 5 }, (_, i) => ({
      id: `overflow-${i}`, title: `Event ${i + 1}`, date: i === 4 ? '2026-09-20' : date,
      time: `${10 + i}:00`, tz: 'UTC',
      recurrence: i === 4 ? { unit: 'week' as const, interval: 1 } : null,
      createdAt: '', updatedAt: '',
    })),
  ));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function expand(container: HTMLElement) {
  const tile = container.querySelector(`[data-date="${date}"]`)!;
  await act(async () => { fireEvent.click(within(tile as HTMLElement).getByRole('button', { name: /\+2 more/ })); });
  return screen.getByRole('dialog', { name: /September 27, 2026/ });
}

it.each(['continuous', 'separate'] as const)('expands hidden occurrences and edits them in %s mode', async (mode) => {
  useSettingsStore.setState({ calendarViewMode: mode });
  const { container } = render(<MonthGrid />);
  const originalTile = container.querySelector(`[data-date="${date}"]`);
  const originalEvent = originalTile?.querySelector('.event-chip');
  const dialog = await expand(container);
  expect(dialog).toBe(originalTile);
  expect(dialog.querySelector('.event-chip')).toBe(originalEvent);
  expect(container.querySelectorAll(`[data-date="${date}"]`)).toHaveLength(1);
  expect(within(dialog).getAllByRole('button', { name: /Event \d/ })).toHaveLength(5);
  expect(useUiStore.getState().quickEntry).toBeNull();
  await act(async () => { fireEvent.click(within(dialog).getByText('Event 5')); });
  expect(useUiStore.getState().editor).toMatchObject({ eventId: 'overflow-4', occurrenceDate: date });
  expect(useSettingsStore.getState().calendarViewMode).toBe(mode);
  expect(dialog).toBeInTheDocument();
});

it('keeps the expanded tile open while using its event editor and updates live', async () => {
  const { container } = render(<><MonthGrid /><EventEditorHost /></>);
  const dialog = await expand(container);
  await act(async () => { fireEvent.click(within(dialog).getByText('Event 4')); });
  const title = screen.getByLabelText('Title');
  await act(async () => {
    fireEvent.pointerDown(title);
    fireEvent.change(title, { target: { value: 'Updated hidden event' } });
  });
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByText('Updated hidden event')).toBeInTheDocument();
});

it('dismisses with Escape or outside press and restores focus when explicitly closed', async () => {
  const { container } = render(<MonthGrid />);
  expect(await expand(container)).toHaveFocus();
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await expand(container);
  await act(async () => { fireEvent.pointerDown(document.body); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const dialog = await expand(container);
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Close expanded day' })); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.activeElement).toHaveTextContent('+2 more');
});

it('offers existing event actions and creates events on the expanded date', async () => {
  const { container } = render(<MonthGrid />);
  const dialog = await expand(container);
  await act(async () => { fireEvent.contextMenu(within(dialog).getByText('Event 4')); });
  expect(screen.getByRole('menuitem', { name: 'Modify' })).toBeInTheDocument();
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(dialog).toBeInTheDocument();
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Add event' })); });
  expect(useUiStore.getState().quickEntry?.date).toBe(date);
});

it('clears expansion when minimap navigation replaces the rendered weeks', async () => {
  const { container } = render(<MonthGrid />);
  const tile = await expand(container);
  await act(async () => { useUiStore.getState().setViewedDate('2028-09-27'); });
  expect(tile).not.toBeInTheDocument();
  await act(async () => { useUiStore.getState().setViewedDate(date); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await expand(container)).toBeInTheDocument();
});

it('makes hidden multi-day events reachable and labels each span in the expanded day', async () => {
  useCalendarStore.setState({ events: Array.from({ length: 5 }, (_, i) => ({
    id: `span-${i}`, title: `Trip ${i + 1}`, date: '2026-09-25', endDate: '2026-09-29',
    recurrence: null, createdAt: '', updatedAt: '',
  })) });
  const { container } = render(<MonthGrid />);
  const dialog = await expand(container);
  expect(within(dialog).getAllByRole('button', { name: /Trip \d/ })).toHaveLength(5);
  await act(async () => { fireEvent.click(within(dialog).getByText('Trip 5')); });
  expect(useUiStore.getState().spanDay).toMatchObject({ eventId: 'span-4', date });
});

it.each(['continuous', 'separate'] as const)('opens a day in the center of week view from %s mode', async (mode) => {
  useSettingsStore.setState({ calendarViewMode: mode });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const CalendarPanel = panelRegistry['month-grid'];
  const { container } = render(<CalendarPanel />);
  await act(async () => { fireEvent.contextMenu(container.querySelector(`[data-date="${date}"]`)!); });
  expect(screen.getByRole('menuitem', { name: 'Special day…' })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Open in week view' })); });
  expect(useSettingsStore.getState().calendarViewMode).toBe('week');
  expect(useUiStore.getState().selectedDate).toBe(date);
  expect(useUiStore.getState().weekWindowStart).toBe('2026-09-24');
  expect(screen.getByRole('button', { name: `Line the week up on whole days (${date})` })).toHaveFocus();
});
