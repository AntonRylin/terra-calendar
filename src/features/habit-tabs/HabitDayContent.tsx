import { useState } from 'react';
import type { HabitTab } from '../../app/settingsStore';
import { MAX_TEXT_ENTRY_LENGTH, type HabitEntry } from '../../app/habitEntriesStore';
import './habitTabs.css';

/** Compact display formatting for number entries (money, counts, …). */
function formatNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
}

/**
 * What a day tile shows for the active habit tab: a large checkmark (check
 * tabs), the value (number tabs), or a clamped note snippet (text tabs).
 * Cleared/unrecorded days render nothing.
 */
export function HabitDayContent({ tab, entry }: { tab: HabitTab; entry?: HabitEntry }) {
  const v = entry?.v ?? null;
  if (v === null) return null;

  if (tab.kind === 'check') {
    if (v !== true) return null;
    return (
      <div className="habit-day-content habit-day-content-check">
        <svg
          className="habit-day-check"
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }

  if (tab.kind === 'number') {
    if (typeof v !== 'number') return null;
    return (
      <div className="habit-day-content habit-day-content-number">
        <span className="habit-day-number">{formatNumber(v)}</span>
      </div>
    );
  }

  const text = typeof v === 'string' ? v : String(v);
  if (!text.trim()) return null;
  return (
    <div className="habit-day-content habit-day-content-text">
      <span className="habit-day-text">{text}</span>
    </div>
  );
}

interface HabitEntryEditorProps {
  tab: HabitTab;
  date: string;
  value: HabitEntry['v'];
  onSave(v: string | number): void;
  onClear(): void;
  onClose(): void;
}

/**
 * Popover body for editing a text or number entry (check tabs toggle directly
 * on the tile and never open this). Enter saves (Shift+Enter for a newline in
 * text tabs); Escape is handled by the surrounding AnchoredPopover.
 */
export function HabitEntryEditor({ tab, date, value, onSave, onClear, onClose }: HabitEntryEditorProps) {
  const [draft, setDraft] = useState(value === null || typeof value === 'boolean' ? '' : String(value));
  const hadValue = value !== null;

  function save() {
    if (tab.kind === 'number') {
      const trimmed = draft.trim();
      if (trimmed === '') {
        if (hadValue) onClear();
        else onClose();
        return;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return;
      onSave(n);
    } else {
      if (draft.trim() === '') {
        if (hadValue) onClear();
        else onClose();
        return;
      }
      onSave(draft);
    }
  }

  return (
    <div className="habit-entry-editor">
      <div className="habit-entry-editor-title">
        {tab.name} — {date}
      </div>
      {tab.kind === 'number' ? (
        <input
          type="number"
          inputMode="decimal"
          step="any"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          aria-label={`${tab.name} value`}
        />
      ) : (
        <textarea
          autoFocus
          maxLength={MAX_TEXT_ENTRY_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          aria-label={`${tab.name} note`}
        />
      )}
      <div className="habit-entry-editor-actions">
        {hadValue && (
          <button className="tb tb-text" onClick={onClear}>
            Clear
          </button>
        )}
        <button className="tb tb-text tb-primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
