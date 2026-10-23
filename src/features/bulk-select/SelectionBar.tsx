import { useSelectionStore } from '../../app/selectionStore';
import { useCalendarStore } from '../../app/store';
import { confirmDialog } from '../../ui/confirmStore';
import { useAndroidBack } from '../../app/androidBack';
import './selectionBar.css';

/** Floating bulk-action bar, shown while a selection is active. Rendered inside
 *  the Upcoming panel (selections are always started from there) so the action
 *  sits right next to the list. */
export function SelectionBar() {
  const active = useSelectionStore((s) => s.active);
  const selected = useSelectionStore((s) => s.selected);
  const exit = useSelectionStore((s) => s.exit);
  const selectMany = useSelectionStore((s) => s.selectMany);
  const events = useCalendarStore((s) => s.events);
  const deleteEvents = useCalendarStore((s) => s.deleteEvents);
  const notify = useCalendarStore((s) => s.notify);
  // Android back leaves selection mode, like any Android multi-select.
  useAndroidBack(active, exit);

  if (!active) return null;

  const count = selected.size;
  const allIds = events.map((e) => e.id);
  const allSelected = count > 0 && count === allIds.length;

  async function confirmAndDelete() {
    const ids = [...selected];
    const ok = await confirmDialog({
      title: 'Delete events',
      message: `Are you sure you want to permanently delete ${ids.length} event${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      danger: true,
    });
    if (!ok) return;
    await deleteEvents(ids);
    notify(`Deleted ${ids.length} event${ids.length === 1 ? '' : 's'}.`);
    exit();
  }

  return (
    <div className="selection-bar" role="toolbar" aria-label="Bulk actions">
      <span className="selection-count" title={`${count} selected`}>{count}</span>
      <button
        className="selection-icon"
        title={allSelected ? 'Clear all' : 'Select all'}
        aria-label={allSelected ? 'Clear all' : 'Select all'}
        onClick={() => selectMany(allSelected ? [] : allIds)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        className="selection-icon selection-icon-danger"
        title="Delete selected"
        aria-label="Delete selected"
        disabled={count === 0}
        onClick={() => void confirmAndDelete()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
      <button className="selection-icon" title="Cancel" aria-label="Cancel" onClick={exit}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
