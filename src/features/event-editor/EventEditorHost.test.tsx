import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventEditorHost } from './EventEditorHost';
import { ConfirmHost } from '../../ui/ConfirmHost';
import { useConfirmStore } from '../../ui/confirmStore';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';

beforeEach(async () => {
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
  useUiStore.setState({ editor: { eventId: 'e1', anchorEl: document.body }, quickEntry: null });
  useConfirmStore.setState({ request: null });
});

function renderEditor() {
  return render(
    <>
      <ConfirmHost />
      <EventEditorHost />
    </>
  );
}

describe('EventEditorHost', () => {
  it('prefills the form from the event', () => {
    renderEditor();
    expect(screen.getByLabelText('Title')).toHaveValue('Dentist');
    // The date field shows a typeable DD.MM.YYYY string, not the raw ISO value.
    expect(screen.getByLabelText('Date')).toHaveValue('12.06.2026');
    expect(screen.getByLabelText('Time')).toHaveValue('14:30');
  });

  it('saves edits including description and recurrence', async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText('Description'), 'Bring insurance card');
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'year');
    await userEvent.click(screen.getByText('Save'));
    const [event] = useCalendarStore.getState().events;
    expect(event.description).toBe('Bring insurance card');
    expect(event.recurrence).toEqual({ unit: 'year', interval: 1 });
    expect(useUiStore.getState().editor).toBeNull();
  });

  it('saves edits including toggling showOnMinimap off', async () => {
    renderEditor();
    const toggle = screen.getByLabelText('On map') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await userEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    await userEvent.click(screen.getByText('Save'));
    const [event] = useCalendarStore.getState().events;
    expect(event.showOnMinimap).toBe(false);
    expect(useUiStore.getState().editor).toBeNull();
  });

  it('sets the recurrence interval', async () => {
    renderEditor();
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'week');
    const intervalInput = screen.getByLabelText('Interval');
    await userEvent.clear(intervalInput);
    await userEvent.type(intervalInput, '2');
    await userEvent.click(screen.getByText('Save'));
    expect(useCalendarStore.getState().events[0].recurrence).toEqual({
      unit: 'week',
      interval: 2,
    });
  });

  it('deletes the event after confirming', async () => {
    renderEditor();
    await userEvent.click(document.querySelector('.editor-delete')!);

    // A confirmation step is shown before the event is removed.
    expect(screen.getByText('Delete event')).toBeInTheDocument();
    expect(useCalendarStore.getState().events).not.toEqual([]);

    await userEvent.click(document.querySelector('.confirm-btn.danger')!);
    expect(useCalendarStore.getState().events).toEqual([]);
    expect(useUiStore.getState().editor).toBeNull();
  });

  it('keeps the event when delete is cancelled', async () => {
    renderEditor();
    await userEvent.click(document.querySelector('.editor-delete')!);
    await userEvent.click(screen.getByText('Cancel'));

    expect(useCalendarStore.getState().events).not.toEqual([]);
    expect(useUiStore.getState().editor).not.toBeNull();
  });

  it('asks to delete whole series or single occurrence for recurring events', async () => {
    await useCalendarStore.getState().init(
      new MemoryRepository([
        {
          id: 'e2',
          title: 'Weekly Sync',
          date: '2026-06-12',
          recurrence: { unit: 'week', interval: 1 },
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );
    useUiStore.setState({
      editor: { eventId: 'e2', anchorEl: document.body, occurrenceDate: '2026-06-19' },
      quickEntry: null,
    });

    renderEditor();
    
    await userEvent.click(screen.getByText('Delete'));
    
    expect(screen.getByText('Delete recurring event')).toBeInTheDocument();
    expect(screen.getByText('Only this event')).toBeInTheDocument();
    expect(screen.getByText('All events')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Only this event'));

    const events = useCalendarStore.getState().events;
    expect(events.length).toBe(1);
    expect(events[0].exdates).toEqual(['2026-06-19']);
    expect(useUiStore.getState().editor).toBeNull();
  });

  it('prefills the category from the event and saves edits to category', async () => {
    await useCalendarStore.getState().init(
      new MemoryRepository([
        {
          id: 'e1',
          title: 'Dentist',
          date: '2026-06-12',
          time: '14:30',
          type: 'Health',
          recurrence: null,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );
    useUiStore.setState({ editor: { eventId: 'e1', anchorEl: document.body }, quickEntry: null });

    renderEditor();
    expect(screen.getByLabelText('Category')).toHaveValue('Health');

    await userEvent.clear(screen.getByLabelText('Category'));
    await userEvent.type(screen.getByLabelText('Category'), 'Personal');
    await userEvent.click(screen.getByText('Save'));

    const [event] = useCalendarStore.getState().events;
    expect(event.type).toBe('Personal');
  });

  it('triggers delete choices on Delete key press when input is not focused', async () => {
    renderEditor();
    
    // Title is auto-focused initially. Let's blur it so no input is focused.
    screen.getByLabelText('Title').blur();

    // Trigger keydown on window
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(screen.getByText('Delete event')).toBeInTheDocument();
  });

  it('does not trigger delete choices on Delete key press when typing in Title input', async () => {
    renderEditor();
    
    // Title is focused. Send keydown.
    screen.getByLabelText('Title').focus();
    await act(async () => {
      screen.getByLabelText('Title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });

    expect(screen.queryByText('Delete event')).toBeNull();
  });

  it('closes delete choices on Escape key press, returning to form', async () => {
    renderEditor();
    
    screen.getByLabelText('Title').blur();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(screen.getByText('Delete event')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByText('Delete event')).toBeNull();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('deletes event on Enter key press when delete choices are open', async () => {
    renderEditor();
    
    screen.getByLabelText('Title').blur();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(screen.getByText('Delete event')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(useCalendarStore.getState().events).toEqual([]);
    expect(useUiStore.getState().editor).toBeNull();
  });
});
