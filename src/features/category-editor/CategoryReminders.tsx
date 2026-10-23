import { useMemo, useRef, useState } from 'react';
import type { EventReminder } from '../../core/types';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { REMINDER_PRESETS, PRESET_KEYS, reminderLabel, type ReminderUnit } from '../event-editor/reminderPresets';
import '../event-editor/eventEditor.css';

interface Props {
  reminders: EventReminder[];
  onChange(next: EventReminder[]): void;
  /** Fired when a batch of edits is committed: a preset added, a pill removed,
   *  or the custom editor closed — not on every keystroke inside it. */
  onSettled?(): void;
}

/** Default-reminder pills for a category, visually identical to the event
 *  editor's reminders row (same presets, custom editor, and styles). */
export function CategoryReminders({ reminders, onChange, onSettled }: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const addMenuBtnRef = useRef<HTMLButtonElement>(null);

  const presetKeys = useMemo(
    () => new Set(reminders.map((r) => `${r.value}-${r.unit}`)),
    [reminders],
  );

  function add(value: number, unit: ReminderUnit, custom: boolean) {
    onChange([...reminders, { value, unit }]);
    if (custom) {
      setEditing(reminders.length);
    } else {
      onSettled?.();
    }
    setAddMenuOpen(false);
  }

  function remove(index: number) {
    onChange(reminders.filter((_, i) => i !== index));
    setEditing((cur) => (cur === index ? null : cur !== null && cur > index ? cur - 1 : cur));
    onSettled?.();
  }

  function closeEditor() {
    setEditing(null);
    onSettled?.();
  }

  function patch(index: number, p: Partial<EventReminder>) {
    onChange(reminders.map((r, i) => (i === index ? { ...r, ...p } : r)));
  }

  return (
    <>
      <div className="reminder-pills">
        {reminders.map((r, index) => {
          const isCustom = !PRESET_KEYS.has(`${r.value}-${r.unit}`) || editing === index;
          const active = editing === index;
          return (
            <span className={`reminder-pill${active ? ' active' : ''}`} key={index}>
              <button
                type="button"
                className="reminder-pill-label"
                onClick={isCustom ? () => (active ? closeEditor() : setEditing(index)) : undefined}
                disabled={!isCustom}
              >
                {reminderLabel(r.value, r.unit)}
              </button>
              <button
                type="button"
                className="reminder-pill-remove"
                aria-label={`Remove category reminder ${index + 1}`}
                onClick={() => remove(index)}
              >
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          );
        })}

        <div className="reminder-add-wrap">
          <button
            ref={addMenuBtnRef}
            type="button"
            className="reminder-add-pill"
            aria-label="Add category reminder"
            aria-expanded={addMenuOpen}
            onClick={() => setAddMenuOpen((o) => !o)}
          >
            + Add
          </button>
          {addMenuOpen && addMenuBtnRef.current && (
            <AnchoredPopover
              anchorEl={addMenuBtnRef.current}
              onClose={() => setAddMenuOpen(false)}
              placement="bottom-start"
              className="reminder-add-popover"
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {REMINDER_PRESETS.map((p) => {
                  const added = presetKeys.has(`${p.value}-${p.unit}`);
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      className="reminder-menu-item"
                      key={`${p.value}-${p.unit}`}
                      disabled={added}
                      onClick={() => add(p.value, p.unit, false)}
                    >
                      <span className="reminder-menu-check" aria-hidden="true">
                        {added && (
                          <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {p.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="menuitem"
                  className="reminder-menu-item custom"
                  onClick={() => add(10, 'minutes', true)}
                >
                  <span className="reminder-menu-check" aria-hidden="true" />
                  Custom…
                </button>
              </div>
            </AnchoredPopover>
          )}
        </div>
      </div>

      {editing !== null && reminders[editing] && (
        <div className="reminder-custom-editor">
          <input
            type="number"
            className="reminder-custom-value"
            aria-label={`Category reminder ${editing + 1} custom value`}
            min={0}
            value={reminders[editing].value}
            autoFocus
            onChange={(e) => patch(editing, { value: Math.max(0, Number(e.target.value)) })}
          />
          <select
            className="reminder-custom-unit"
            aria-label={`Category reminder ${editing + 1} custom unit`}
            value={reminders[editing].unit}
            onChange={(e) => patch(editing, { unit: e.target.value as ReminderUnit })}
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span className="reminder-custom-suffix">before</span>
          <button type="button" className="reminder-custom-done" onClick={closeEditor}>
            Done
          </button>
        </div>
      )}
    </>
  );
}
