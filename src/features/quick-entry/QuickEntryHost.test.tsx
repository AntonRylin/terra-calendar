import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickEntryHost } from './QuickEntryHost';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';

beforeEach(async () => {
  await useCalendarStore.getState().init(new MemoryRepository());
  useUiStore.setState({ quickEntry: { date: '2026-06-18', anchorEl: document.body }, editor: null });
});

describe('QuickEntryHost', () => {
  it('creates a timed event from "HH MM title" + Enter', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), '14 30 Dentist{Enter}');
    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Dentist',
      time: '14:30',
      date: '2026-06-18',
      recurrence: null,
    });
  });

  it('creates an all-day event from plain text', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), 'Buy flowers{Enter}');
    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0].time).toBeUndefined();
    expect(events[0].title).toBe('Buy flowers');
  });

  it('does not save an empty title', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), '14 30{Enter}');
    expect(useCalendarStore.getState().events).toHaveLength(0);
  });

  it('closes the popover after saving', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), 'Buy flowers{Enter}');
    expect(useUiStore.getState().quickEntry).toBeNull();
  });

  it('creates a timed event with custom end time from "HH MM HH MM title" + Enter', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), '12 30 13 45 Team meeting{Enter}');
    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Team meeting',
      time: '12:30',
      endTime: '13:45',
      date: '2026-06-18',
    });
  });
});
