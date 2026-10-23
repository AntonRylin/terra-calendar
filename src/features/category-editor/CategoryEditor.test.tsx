import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryEditor } from './CategoryEditor';
import { useSettingsStore } from '../../app/settingsStore';
import { useEntitlementStore } from '../../app/entitlementStore';
import { useCalendarStore } from '../../app/store';
import { useConfirmStore } from '../../ui/confirmStore';
import type { CalendarEvent } from '../../core/types';

function makeEvent(title: string, type?: string): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    title,
    date: '2026-07-12',
    type,
    recurrence: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  useCalendarStore.setState({ events: [] });
  useConfirmStore.setState({ request: null });
  useSettingsStore.setState({
    categories: {
      Work: {
        type: 'gradient',
        value: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)',
        color1: '#00c6ff',
        color2: '#0072ff',
        matchEvents: true,
      },
    },
    customGradients: [],
  });
});

describe('CategoryEditor', () => {
  it('selecting a free swatch saves immediately and updates the store', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Forest Vine gradient' }));
    expect(useSettingsStore.getState().categories.Work.color1).toBe('#11998e');
  });

  it('selecting a locked premium swatch previews but does not persist', async () => {
    useEntitlementStore.setState({ cosmeticsUnlocked: false } as never);
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: /see all designs/i }));
    await userEvent.click(screen.getByRole('button', { name: /Neon Rush.*premium/i }));
    expect(useSettingsStore.getState().categories.Work.color1).toBe('#00c6ff'); // unchanged
    expect(screen.getByTestId('event-preview-pill')).toHaveStyle({
      backgroundImage: 'linear-gradient(90deg, #ff007f, #7f77dd, #ff007f)',
    });
  });

  it('saving a custom gradient adds it to the library and applies it', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'New custom gradient' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save gradient' }));
    expect(useSettingsStore.getState().customGradients).toHaveLength(1);
    expect(useSettingsStore.getState().categories.Work.color1).toBe(useSettingsStore.getState().customGradients[0].color1);
  });

  it('match toggle persists matchEvents', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('switch', { name: /events match category/i }));
    expect(useSettingsStore.getState().categories.Work.matchEvents).toBe(false);
  });

  it('the animated styles selector is always visible and picking one saves it', async () => {
    render(<CategoryEditor category="Work" />);
    expect(document.querySelector('.cosmetic-swatch')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Aurora' }));
    expect(useSettingsStore.getState().categories.Work.cosmetic).toBe('aurora');
    expect(screen.getByTestId('event-preview-pill').className).toContain('cosmetic-aurora');
  });

  it('adding default reminders persists them on the category config', async () => {
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add category reminder' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '1 hour before' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add category reminder' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '1 day before' }));
    expect(useSettingsStore.getState().categories.Work.reminders).toEqual([
      { value: 1, unit: 'hours' },
      { value: 1, unit: 'days' },
    ]);
  });

  it('adding a reminder offers a retroactive update, applied on confirm', async () => {
    useCalendarStore.setState({
      events: [
        makeEvent('Family dinner', 'Work'),
        makeEvent('Event 2', 'Work'),
        makeEvent('W3', 'Work'),
        makeEvent('W4', 'Work'),
        makeEvent('W5', 'Work'),
        makeEvent('Relax', 'Hobby'),
      ],
    });
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add category reminder' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '1 hour before' }));

    const request = useConfirmStore.getState().request;
    expect(request?.message).toContain('"Family dinner", "Event 2" and 3 others');
    act(() => useConfirmStore.getState().resolve('update'));

    await waitFor(() => {
      const events = useCalendarStore.getState().events;
      expect(events.filter((e) => e.type === 'Work').every(
        (e) => JSON.stringify(e.reminders) === JSON.stringify([{ value: 1, unit: 'hours' }]),
      )).toBe(true);
      expect(events.find((e) => e.type === 'Hobby')?.reminders).toBeUndefined();
    });
  });

  it('declining the retroactive update leaves existing events untouched', async () => {
    useCalendarStore.setState({ events: [makeEvent('Family dinner', 'Work')] });
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add category reminder' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '1 hour before' }));

    expect(useConfirmStore.getState().request).toBeTruthy();
    act(() => useConfirmStore.getState().resolve(null));

    expect(useCalendarStore.getState().events[0].reminders).toBeUndefined();
    // The category itself still keeps the reminder for future events.
    expect(useSettingsStore.getState().categories.Work.reminders).toEqual([{ value: 1, unit: 'hours' }]);
  });

  it('does not prompt when the category has no events', async () => {
    useCalendarStore.setState({ events: [makeEvent('Relax', 'Hobby')] });
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Add category reminder' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '1 hour before' }));
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('removing the last default reminder clears the field', async () => {
    useSettingsStore.setState({
      categories: {
        Work: { type: 'color', value: '#0a84ff', reminders: [{ value: 1, unit: 'hours' }] },
      },
      customGradients: [],
    });
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove category reminder 1' }));
    expect(useSettingsStore.getState().categories.Work.reminders).toBeUndefined();
  });

  it('picking a plain swatch clears the animated style', async () => {
    useSettingsStore.setState({
      categories: { Work: { type: 'gradient', value: 'linear-gradient(90deg, #00c6ff, #0072ff, #00c6ff)', color1: '#00c6ff', color2: '#0072ff', matchEvents: true, cosmetic: 'aurora' } },
      customGradients: [],
    });
    render(<CategoryEditor category="Work" />);
    await userEvent.click(screen.getByRole('button', { name: 'Forest Vine gradient' }));
    expect(useSettingsStore.getState().categories.Work.cosmetic).toBeUndefined();
  });
});
