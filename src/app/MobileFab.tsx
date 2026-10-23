import { todayISO } from '../core/dates';
import { useUiStore } from './uiStore';
import { useSelectionStore } from './selectionStore';

/**
 * Phone floating action button: adds an event on the selected day (today until
 * another day is tapped) through the usual quick-entry sheet. Hidden while bulk
 * selection owns the bottom of the screen.
 */
export function MobileFab() {
  const selecting = useSelectionStore((s) => s.active);
  const selectedDate = useUiStore((s) => s.selectedDate);
  if (selecting) return null;
  const today = todayISO();
  const label =
    !selectedDate || selectedDate === today
      ? 'New event today'
      : `New event on ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  return (
    <button
      type="button"
      className="m-fab"
      aria-label={label}
      onClick={(e) => useUiStore.getState().openQuickEntry(selectedDate || today, e.currentTarget)}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
