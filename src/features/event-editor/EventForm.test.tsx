import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventForm, type EventFormValues } from './EventForm';
import { useConnectionStore } from '../../app/connectionStore';
import { useSettingsStore } from '../../app/settingsStore';

const baseInitial: EventFormValues = {
  title: 'Standup',
  date: '2026-06-22',
  recurrence: null,
};

beforeEach(() => {
  useConnectionStore.setState({ caldav: undefined, google: undefined });
});

afterEach(() => {
  useConnectionStore.setState({ caldav: undefined, google: undefined });
});

describe('EventForm daily recurrence', () => {
  it('saves an event repeating every three days', async () => {
    const onSubmit = vi.fn();
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'day');
    await userEvent.clear(screen.getByLabelText('Interval'));
    await userEvent.type(screen.getByLabelText('Interval'), '3');
    expect(screen.getByLabelText('Interval').closest('label')).toHaveTextContent('everydays');
    await userEvent.click(screen.getByText('Save'));
    expect(onSubmit.mock.calls[0][0].recurrence).toEqual({ unit: 'day', interval: 3 });
  });

  it('prefills an existing daily interval', () => {
    render(<EventForm initial={{ ...baseInitial, recurrence: { unit: 'day', interval: 5 } }} submitLabel="Save" onSubmit={() => {}} />);
    expect(screen.getByLabelText('Repeats')).toHaveValue('day');
    expect(screen.getByLabelText('Interval')).toHaveValue(5);
  });
});

describe('EventForm reminders', () => {
  it('adds a preset reminder as a pill and disables it in the menu afterwards', async () => {
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={() => {}} />);

    await userEvent.click(screen.getByLabelText('Add reminder'));
    await userEvent.click(screen.getByRole('menuitem', { name: '15 minutes before' }));

    expect(screen.getByText('15 minutes before')).toBeInTheDocument();

    // Re-open the menu: the just-added preset is now disabled (dedup).
    await userEvent.click(screen.getByLabelText('Add reminder'));
    expect(screen.getByRole('menuitem', { name: '15 minutes before' })).toBeDisabled();
  });

  it('removes a reminder pill', async () => {
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={() => {}} />);

    await userEvent.click(screen.getByLabelText('Add reminder'));
    await userEvent.click(screen.getByRole('menuitem', { name: '1 day before' }));
    expect(screen.getByText('1 day before')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Remove reminder 1'));
    expect(screen.queryByText('1 day before')).not.toBeInTheDocument();
  });

  it('adds and edits a custom reminder, submitting the chosen value/unit', async () => {
    const onSubmit = vi.fn();
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText('Add reminder'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Custom…' }));

    const valueInput = screen.getByLabelText('Reminder 1 custom value');
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, '45');
    await userEvent.selectOptions(screen.getByLabelText('Reminder 1 custom unit'), 'hours');

    await userEvent.click(screen.getByText('Save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].reminders).toEqual([{ value: 45, unit: 'hours' }]);
  });

  it('prefills existing reminders as pills, treating non-preset values as custom', () => {
    render(
      <EventForm
        initial={{ ...baseInitial, reminders: [{ value: 15, unit: 'minutes' }, { value: 45, unit: 'minutes' }] }}
        submitLabel="Save"
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByText('15 minutes before')).toBeInTheDocument();
    expect(screen.getByText('45 minutes before')).toBeInTheDocument();
  });
});

describe('EventForm category default reminders', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      categories: {
        Work: {
          type: 'color',
          value: '#0a84ff',
          reminders: [
            { value: 1, unit: 'hours' },
            { value: 1, unit: 'days' },
          ],
        },
      },
    });
  });

  afterEach(() => {
    useSettingsStore.setState({ categories: {} });
  });

  it('picking a category adds its default reminders as pills', async () => {
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={() => {}} />);

    await userEvent.click(screen.getByLabelText('Category'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Work' }));

    expect(screen.getByText('1 hour before')).toBeInTheDocument();
    expect(screen.getByText('1 day before')).toBeInTheDocument();
  });

  it('a removed default is not re-added on submit, and stays out when re-picking is not involved', async () => {
    const onSubmit = vi.fn();
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText('Category'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Work' }));
    await userEvent.click(screen.getByLabelText('Remove reminder 2'));
    await userEvent.click(screen.getByText('Save'));

    expect(onSubmit.mock.calls[0][0].reminders).toEqual([{ value: 1, unit: 'hours' }]);
  });

  it('does not re-apply defaults when opening an event that already has the category', () => {
    render(
      <EventForm
        initial={{ ...baseInitial, type: 'Work', reminders: [] }}
        submitLabel="Save"
        onSubmit={() => {}}
      />,
    );
    expect(screen.queryByText('1 hour before')).not.toBeInTheDocument();
  });
});

describe('EventForm category-locked visibility toggles', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      categories: {
        Work: { type: 'color', value: '#0a84ff', hideFromMinimap: true },
        Personal: { type: 'color', value: '#30d158' },
      },
    });
  });

  afterEach(() => {
    useSettingsStore.setState({ categories: {} });
  });

  it('locks the toggle the category overrides and leaves the other one editable', () => {
    render(
      <EventForm initial={{ ...baseInitial, type: 'Work' }} submitLabel="Save" onSubmit={() => {}} />,
    );

    expect(screen.getByLabelText('On map (set by the Work category)')).toBeDisabled();
    expect(screen.getByLabelText('On map (set by the Work category)')).not.toBeChecked();
    // Only the minimap is hidden by this category — Upcoming stays the event's own call.
    expect(screen.getByText('In upcoming').closest('label')).toBeInTheDocument();
  });

  it('leaves both toggles editable when the category overrides neither', () => {
    render(
      <EventForm initial={{ ...baseInitial, type: 'Personal' }} submitLabel="Save" onSubmit={() => {}} />,
    );
    expect(screen.queryByLabelText(/set by the/)).not.toBeInTheDocument();
  });

  it('explains the lock on hover and links into the category editor', async () => {
    render(
      <EventForm initial={{ ...baseInitial, type: 'Work' }} submitLabel="Save" onSubmit={() => {}} />,
    );

    await userEvent.hover(screen.getByLabelText('Why "On map" can\'t be changed'));
    expect(await screen.findByText(/is set by the/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit category' }));
    // The category editor opens over the still-open event form.
    expect(await screen.findByLabelText('Hide from minimap')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('opens the category editor from the pencil next to the category field', async () => {
    render(
      <EventForm initial={{ ...baseInitial, type: 'Work' }} submitLabel="Save" onSubmit={() => {}} />,
    );

    await userEvent.click(screen.getByLabelText('Edit category Work'));
    expect(await screen.findByLabelText('Hide from minimap')).toBeInTheDocument();
  });

  it('has no category pencil until a category is chosen', () => {
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={() => {}} />);
    expect(screen.queryByTitle('Edit category')).not.toBeInTheDocument();
  });
});

describe('EventForm calendars', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      caldav: {
        serverUrl: 'https://caldav.icloud.com',
        username: 'me@icloud.example',
        calendars: [
          { url: 'a1', displayName: 'Main', enabled: true, writeDefault: true },
          { url: 'a2', displayName: 'Arbeit', enabled: true, writeDefault: false },
        ],
      },
      google: {
        serverUrl: 'https://apidata.googleusercontent.com',
        username: 'me@gmail.example',
        calendars: [{ url: 'g1', displayName: 'Personal', enabled: true, writeDefault: true }],
      },
    });
  });

  it('groups calendars under their account email', () => {
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={() => {}} />);

    const fieldset = screen.getByRole('group', { name: 'Calendars' });
    expect(within(fieldset).getByText('me@icloud.example')).toBeInTheDocument();
    expect(within(fieldset).getByText('me@gmail.example')).toBeInTheDocument();
    expect(within(fieldset).getByText('Main')).toBeInTheDocument();
    expect(within(fieldset).getByText('Arbeit')).toBeInTheDocument();
    expect(within(fieldset).getByText('Personal')).toBeInTheDocument();
  });

  it('keeps at most one calendar selected per account', async () => {
    const onChange = vi.fn();
    render(<EventForm initial={baseInitial} submitLabel="Save" onSubmit={() => {}} onChange={onChange} />);

    // Selecting "Arbeit" replaces "Main" (same Apple account) but leaves the
    // Google selection intact.
    await userEvent.click(screen.getByText('Arbeit'));

    const last = onChange.mock.calls.at(-1)![0] as EventFormValues;
    expect(last.calendarUrls).toContain('a2');
    expect(last.calendarUrls).not.toContain('a1');
    expect(last.calendarUrls).toContain('g1');
  });
});
