import { render, screen, fireEvent } from '@testing-library/react';
import { UpcomingStack } from './UpcomingStack';
import { useCalendarStore } from '../../app/store';
import { MemoryRepository } from '../../data/memoryRepository';
import { vi } from 'vitest';

beforeEach(async () => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 12)); // June 12, 2026
  await useCalendarStore.getState().init(
    new MemoryRepository([
      {
        id: 'e1',
        title: 'Meeting',
        date: '2026-06-12',
        time: '14:30',
        recurrence: null,
        type: 'Work',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpcomingStack header count', () => {
  it('counts what is on screen and omits the clauses that are empty', () => {
    render(<UpcomingStack />);

    const count = document.querySelector('.upcoming-count');
    expect(count).toHaveTextContent('1 upcoming');
    expect(count).not.toHaveTextContent('ongoing');
    expect(count).not.toHaveTextContent('task');
  });

  it('counts ongoing spans as their own clause', async () => {
    await useCalendarStore.getState().init(
      new MemoryRepository([
        {
          id: 'e1',
          title: 'Meeting',
          date: '2026-06-12',
          time: '14:30',
          recurrence: null,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'span1',
          title: 'Trip',
          date: '2026-06-10',
          endDate: '2026-06-15',
          recurrence: null,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );
    render(<UpcomingStack />);

    const count = document.querySelector('.upcoming-count');
    expect(count).toHaveTextContent('1 ongoing');
    expect(count).toHaveTextContent('1 upcoming');
  });
});

describe('UpcomingStack Field Ordering', () => {
  it('renders settings popover with drag to reorder controls', async () => {
    render(<UpcomingStack />);

    const settingsBtn = screen.getByTitle('Panel settings');
    fireEvent.click(settingsBtn);

    // Verify the "Card Visibility" header with drag hint is displayed
    expect(screen.getByText(/Card Visibility/)).toBeInTheDocument();
    expect(screen.getByText(/\(drag to reorder\)/)).toBeInTheDocument();

    // Verify default order of buttons exists
    const segmentButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('apple-segment-btn')
    );
    expect(segmentButtons).toHaveLength(4);
    expect(segmentButtons[0]).toHaveTextContent('Date');
    expect(segmentButtons[1]).toHaveTextContent('Recurrence');
    expect(segmentButtons[2]).toHaveTextContent('Category');
    expect(segmentButtons[3]).toHaveTextContent('Time Until');
  });

  it('allows dragover to swap elements and stores the new order', async () => {
    render(<UpcomingStack />);

    const settingsBtn = screen.getByTitle('Panel settings');
    fireEvent.click(settingsBtn);

    let segmentButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('apple-segment-btn')
    );

    // Perform a simulated drag-and-drop / dragover to swap Date (index 0) and Recurrence (index 1)
    const dateBtn = segmentButtons[0];
    const recurrenceBtn = segmentButtons[1];

    // dragStart on Date
    fireEvent.dragStart(dateBtn, {
      dataTransfer: {
        effectAllowed: '',
      },
    });

    // dragOver on Recurrence
    fireEvent.dragOver(recurrenceBtn);

    // dragEnd
    fireEvent.dragEnd(dateBtn);

    // Verify updated order of buttons
    segmentButtons = screen.getAllByRole('button').filter(
      (btn) => btn.className.includes('apple-segment-btn')
    );
    expect(segmentButtons[0]).toHaveTextContent('Recurrence');
    expect(segmentButtons[1]).toHaveTextContent('Date');

    // Verify that it is persisted in localStorage
    const saved = localStorage.getItem('upcoming_settings_order');
    expect(saved).toBe(JSON.stringify(['recurrence', 'date', 'category', 'time_until']));
  });

  it('allows toggling Align Columns switch and persists the state', () => {
    render(<UpcomingStack />);

    const settingsBtn = screen.getByTitle('Panel settings');
    fireEvent.click(settingsBtn);

    // Verify Align Columns label exists
    expect(screen.getByText('Align Columns')).toBeInTheDocument();

    const switchCheckbox = screen.getByRole('checkbox', { name: 'Align Columns' });
    
    // Toggle the switch on
    fireEvent.click(switchCheckbox);
    expect(switchCheckbox).toBeChecked();
    expect(localStorage.getItem('upcoming_align_columns')).toBe('true');

    // Toggle it off
    fireEvent.click(switchCheckbox);
    expect(switchCheckbox).not.toBeChecked();
    expect(localStorage.getItem('upcoming_align_columns')).toBe('false');
  });

  it('renders elements inside aligned columns and placeholder spans when enabled', () => {
    localStorage.setItem('upcoming_align_columns', 'true');
    render(<UpcomingStack />);

    // The event has a category ('Work') but no recurrence.
    // So there should be an empty placeholder span for recurrence.
    const container = screen.getByText('Meeting').closest('.upcoming-card');
    expect(container?.querySelector('.has-columns')).toBeInTheDocument();
    
    // Recurrence is empty but has fixed width to align with other cards
    const recurrenceSpan = container?.querySelector('.recurrence-column') as HTMLSpanElement;
    expect(recurrenceSpan).toBeInTheDocument();
    expect(recurrenceSpan).toHaveTextContent('');
    expect(recurrenceSpan.style.width).toBe('85px');

    // Category shows 'Work'
    const categorySpan = container?.querySelector('.category-column') as HTMLSpanElement;
    expect(categorySpan).toBeInTheDocument();
    expect(categorySpan).toHaveTextContent('Work');
    expect(categorySpan.style.width).toBe('110px');

    // Date should have a fixed width style
    const dateSpan = container?.querySelector('.date-column') as HTMLSpanElement;
    expect(dateSpan).toBeInTheDocument();
    expect(dateSpan.style.width).toBe('120px');
  });

  it('omits leading empty placeholders', () => {
    localStorage.setItem('upcoming_align_columns', 'true');
    localStorage.setItem('upcoming_show_date', 'false');
    localStorage.setItem('upcoming_show_recurrence', 'false');
    render(<UpcomingStack />);

    const container = screen.getByText('Meeting').closest('.upcoming-card');
    expect(container?.querySelector('.has-columns')).toBeInTheDocument();

    const categorySpan = container?.querySelector('.category-column') as HTMLSpanElement;
    expect(categorySpan).toBeInTheDocument();
    expect(categorySpan.style.width).toBe('110px');

    expect(container?.querySelector('.date-column')).not.toBeInTheDocument();
    expect(container?.querySelector('.recurrence-column')).not.toBeInTheDocument();
  });
});
