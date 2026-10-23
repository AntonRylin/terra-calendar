import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCreateHost } from './EventCreateHost';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';

beforeEach(async () => {
  await useCalendarStore.getState().init(new MemoryRepository());
  useUiStore.setState({ create: { anchorEl: document.body, eventId: 'test-create-id' }, editor: null, quickEntry: null });
});

describe('EventCreateHost', () => {
  it('creates a full event (date far in the future, description, recurrence)', async () => {
    render(<EventCreateHost />);
    await userEvent.type(screen.getByLabelText('Title'), 'Passport renewal');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2031-09-20' } });
    await userEvent.type(screen.getByLabelText('Description'), 'Book appointment');
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'year');
    await userEvent.click(screen.getByText('Add'));

    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Passport renewal',
      date: '2031-09-20',
      description: 'Book appointment',
      recurrence: { unit: 'year', interval: 1 },
      showOnMinimap: true,
    });
    expect(useUiStore.getState().create).toBeNull();
  });

  it('supports toggling showOnMinimap off', async () => {
    render(<EventCreateHost />);
    await userEvent.type(screen.getByLabelText('Title'), 'Hide Me');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2031-09-20' } });
    
    const toggle = screen.getByLabelText('On map') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await userEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    
    await userEvent.click(screen.getByText('Add'));

    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Hide Me',
      date: '2031-09-20',
      showOnMinimap: false,
    });
  });

  it('supports toggling showInUpcoming off', async () => {
    render(<EventCreateHost />);
    await userEvent.type(screen.getByLabelText('Title'), 'Hide In Upcoming');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2031-09-20' } });
    
    const toggle = screen.getByLabelText('In upcoming') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await userEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    
    await userEvent.click(screen.getByText('Add'));

    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Hide In Upcoming',
      date: '2031-09-20',
      showInUpcoming: false,
    });
  });

  it('does not add without a title', async () => {
    render(<EventCreateHost />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2031-09-20' } });
    await userEvent.click(screen.getByText('Add'));
    expect(useCalendarStore.getState().events).toHaveLength(0);
  });

  it('creates an event with a category', async () => {
    render(<EventCreateHost />);
    await userEvent.type(screen.getByLabelText('Title'), 'Gym workout');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-15' } });
    await userEvent.type(screen.getByLabelText('Category'), 'Fitness');
    await userEvent.click(screen.getByText('Add'));

    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Gym workout',
      date: '2026-06-15',
      type: 'Fitness',
    });
  });
});
