import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitDayContent, HabitEntryEditor } from './HabitDayContent';
import type { HabitTab } from '../../app/settingsStore';
import type { HabitEntry } from '../../app/habitEntriesStore';

const checkTab: HabitTab = { id: 'gym', name: 'Gym', icon: 'dumbbell', kind: 'check' };
const numberTab: HabitTab = { id: 'money', name: 'Money', icon: 'dollar', kind: 'number' };
const textTab: HabitTab = { id: 'diary', name: 'Diary', icon: 'pen', kind: 'text' };

const entry = (v: HabitEntry['v']): HabitEntry => ({ v, updatedAt: '2026-07-12T00:00:00Z' });

describe('HabitDayContent', () => {
  it('renders a checkmark only when a check entry is true', () => {
    const { container, rerender } = render(<HabitDayContent tab={checkTab} entry={entry(true)} />);
    expect(container.querySelector('.habit-day-check')).toBeInTheDocument();

    rerender(<HabitDayContent tab={checkTab} entry={entry(false)} />);
    expect(container.querySelector('.habit-day-check')).not.toBeInTheDocument();

    rerender(<HabitDayContent tab={checkTab} entry={undefined} />);
    expect(container.querySelector('.habit-day-check')).not.toBeInTheDocument();
  });

  it('renders a number value, trimming trailing zeros', () => {
    const { rerender } = render(<HabitDayContent tab={numberTab} entry={entry(42)} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    rerender(<HabitDayContent tab={numberTab} entry={entry(12.5)} />);
    expect(screen.getByText('12.5')).toBeInTheDocument();
  });

  it('renders a text snippet, nothing for a tombstone', () => {
    const { container, rerender } = render(<HabitDayContent tab={textTab} entry={entry('a good day')} />);
    expect(screen.getByText('a good day')).toBeInTheDocument();
    rerender(<HabitDayContent tab={textTab} entry={entry(null)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('HabitEntryEditor', () => {
  it('saves a typed number on Save', async () => {
    const onSave = vi.fn();
    render(
      <HabitEntryEditor tab={numberTab} date="2026-07-12" value={null} onSave={onSave} onClear={vi.fn()} onClose={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText('Money value'), '19.99');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(19.99);
  });

  it('saves text on Enter (Shift+Enter inserts a newline instead)', async () => {
    const onSave = vi.fn();
    render(
      <HabitEntryEditor tab={textTab} date="2026-07-12" value={null} onSave={onSave} onClear={vi.fn()} onClose={vi.fn()} />,
    );
    const field = screen.getByLabelText('Diary note');
    await userEvent.type(field, 'hello');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith('hello');
  });

  it('clears an existing value and offers no Clear button when empty', async () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <HabitEntryEditor tab={textTab} date="2026-07-12" value="old" onSave={vi.fn()} onClear={onClear} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();

    rerender(
      <HabitEntryEditor tab={textTab} date="2026-07-12" value={null} onSave={vi.fn()} onClear={onClear} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('clears when an existing value is emptied and saved', async () => {
    const onClear = vi.fn();
    const onSave = vi.fn();
    render(
      <HabitEntryEditor tab={numberTab} date="2026-07-12" value={5} onSave={onSave} onClear={onClear} onClose={vi.fn()} />,
    );
    await userEvent.clear(screen.getByLabelText('Money value'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClear).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
