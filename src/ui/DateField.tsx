import { useEffect, useMemo, useRef, useState } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { useIsMobile } from './useMediaQuery';
import { PhoneDateField } from './PhonePickers';
import {
  addDays,
  formatDMY,
  pad2,
  parseLooseDate,
  todayISO,
} from '../core/dates';
import { mondayOf } from '../features/month-grid/weeks';
import './dateField.css';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface DateFieldProps {
  /** Current value as "YYYY-MM-DD" (may be ""). */
  value: string;
  onChange(iso: string): void;
  /** Optional inclusive lower bound; earlier days can't be picked. */
  min?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Show a Clear button and allow committing an empty value (no date). */
  clearable?: boolean;
}

/** First-of-month "YYYY-MM-01" for the month `iso` falls in. */
function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Move a "YYYY-MM-01" view by whole months / years. */
function shiftMonth(view: string, deltaMonths: number): string {
  const [y, m] = view.split('-').map(Number);
  const total = y * 12 + (m - 1) + deltaMonths;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}-01`;
}

/**
 * A date field you can just type into — "30.12.2027", "12052025", or "15" — with
 * a fast, keyboard-navigable calendar dropdown. Replaces the native, clunky
 * `<input type="date">`.
 */
function DesktopDateField({ value, onChange, min, ariaLabel = 'Date', autoFocus, clearable }: DateFieldProps) {
  const today = useMemo(() => todayISO(), []);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (value ? formatDMY(value) : ''));
  const [view, setView] = useState(() => firstOfMonth(value || today));
  const [overview, setOverview] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Set when a key press should move focus onto a day button after re-render
  // (survives the remount when navigation crosses a month boundary).
  const wantFocus = useRef(false);

  const [vy, vm] = view.split('-').map(Number);
  const viewRef = { year: vy, month: vm };

  const canPick = (iso: string) => !(min && iso < min);

  // While the field is closed, mirror the outside value (e.g. a span clamping
  // its end to its start); while open, leave what the user is typing alone.
  useEffect(() => {
    if (open) return;
    setText(value ? formatDMY(value) : '');
  }, [value, open]);

  // The date the grid highlights: what's being typed if it parses, else `value`.
  const parsed = parseLooseDate(text, viewRef);
  const selected = parsed ?? value;

  // Commit as you type: every complete, in-range date the text resolves to is
  // pushed up live (like the rest of the form), and the grid flies to it — but
  // the text itself is left exactly as typed, so the caret never jumps. The
  // canonical "DD.MM.YYYY" form is only written back on close (see handleClose).
  useEffect(() => {
    const p = parseLooseDate(text, { year: vy, month: vm });
    if (!p) return;
    if (firstOfMonth(p) !== view) setView(firstOfMonth(p));
    if (p !== value && canPick(p)) onChange(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Roving focus for keyboard grid navigation.
  const [focusDate, setFocusDate] = useState(selected || today);
  useEffect(() => {
    if (!open) return;
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-date="${focusDate}"]`)
      ?.focus();
  }, [focusDate, view, open]);

  function openPicker() {
    setOverview(false);
    setView(firstOfMonth(value || today));
    setFocusDate(value || today);
    setOpen(true);
  }

  // Pick a specific day (grid click / Today) — commit and normalise the text.
  function selectDay(iso: string) {
    if (!canPick(iso)) return;
    onChange(iso);
    setText(formatDMY(iso));
    setView(firstOfMonth(iso));
    setOpen(false);
  }

  // Closing (outside click / Enter / Escape): snap the text to the committed
  // value's canonical form — dropping any half-typed or out-of-range input.
  function handleClose() {
    // A cleared clearable field commits "no date".
    if (clearable && text.trim() === '') {
      if (value) onChange('');
      setText('');
      setOpen(false);
      return;
    }
    const p = parseLooseDate(text, viewRef);
    const commitable = p && canPick(p) ? p : value;
    setText(commitable ? formatDMY(commitable) : '');
    setOpen(false);
  }

  function clear() {
    onChange('');
    setText('');
    setOpen(false);
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      let next = addDays(focusDate, step[e.key]);
      if (min && next < min) next = min;
      wantFocus.current = true;
      setFocusDate(next);
      if (next.slice(0, 7) !== view.slice(0, 7)) setView(firstOfMonth(next));
    }
  }

  // 6 fixed weeks (42 cells) so the calendar never changes height between months.
  const gridStart = mondayOf(view);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const iso = addDays(gridStart, i);
    return {
      iso,
      day: Number(iso.slice(8, 10)),
      inMonth: iso.slice(0, 7) === view.slice(0, 7),
      isToday: iso === today,
      isSelected: iso === selected,
      isWeekend: i % 7 >= 5,
      disabled: !!min && iso < min,
    };
  });

  const todayDisabled = !!min && today < min;

  return (
    <div className="date-field">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="date-field-input"
        aria-label={ariaLabel}
        placeholder="dd.mm.yyyy"
        value={text}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        onFocus={(e) => {
          if (!open) {
            openPicker();
            e.currentTarget.select();
          }
        }}
        onClick={() => {
          // Re-open after an Enter/Escape that kept focus in the field; a click
          // while already open is left alone so the caret can be placed.
          if (!open) openPicker();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Stop the key here so the surrounding editor's dismiss/submit
            // handlers (which listen on the document) don't also react.
            e.preventDefault();
            e.stopPropagation();
            handleClose();
          } else if (e.key === 'Escape' && open) {
            // Close just the calendar, not the whole editor popover.
            e.preventDefault();
            e.stopPropagation();
            setText(value ? formatDMY(value) : '');
            setOpen(false);
          } else if (e.key === 'ArrowDown' && open) {
            // Jump from the text field into the grid.
            e.preventDefault();
            wantFocus.current = true;
            setFocusDate(selected || view);
          }
        }}
      />
      <button
        type="button"
        className="date-field-icon"
        tabIndex={-1}
        aria-label="Open calendar"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            handleClose();
          } else {
            openPicker();
            inputRef.current?.focus();
          }
        }}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
          <path d="M2.5 6.25h11M5.25 1.75v2.5M10.75 1.75v2.5" />
        </svg>
      </button>

      {open && inputRef.current && (
        <AnchoredPopover
          anchorEl={inputRef.current}
          onClose={handleClose}
          placement="bottom-start"
          className="date-popover"
        >
          {overview ? (
            <div className="dp">
              <div className="dp-head">
                <button type="button" className="dp-nav" aria-label="Previous year" onClick={() => setView(shiftMonth(view, -12))}>
                  <Chevron dir="left" />
                </button>
                <div className="dp-title-static">{vy}</div>
                <button type="button" className="dp-nav" aria-label="Next year" onClick={() => setView(shiftMonth(view, 12))}>
                  <Chevron dir="right" />
                </button>
              </div>
              <div className="dp-months">
                {MONTHS_SHORT.map((name, idx) => (
                  <button
                    type="button"
                    key={name}
                    className={`dp-month${idx + 1 === vm ? ' selected' : ''}${vy === Number(today.slice(0, 4)) && idx + 1 === Number(today.slice(5, 7)) ? ' today' : ''}`}
                    onClick={() => {
                      setView(`${vy}-${pad2(idx + 1)}-01`);
                      setOverview(false);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="dp">
              <div className="dp-head">
                <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => setView(shiftMonth(view, -1))}>
                  <Chevron dir="left" />
                </button>
                <button type="button" className="dp-title" onClick={() => setOverview(true)}>
                  {MONTHS_LONG[vm - 1]} {vy}
                </button>
                <button type="button" className="dp-nav" aria-label="Next month" onClick={() => setView(shiftMonth(view, 1))}>
                  <Chevron dir="right" />
                </button>
              </div>

              <div className="dp-weekdays" aria-hidden="true">
                {WEEKDAYS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="dp-grid" ref={gridRef} onKeyDown={onGridKeyDown} role="grid">
                {cells.map((c) => {
                  const cls = [
                    'dp-day',
                    c.inMonth ? '' : 'out',
                    c.isSelected ? 'selected' : '',
                    c.isToday ? 'today' : '',
                    c.isWeekend ? 'weekend' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      type="button"
                      key={c.iso}
                      data-date={c.iso}
                      className={cls}
                      role="gridcell"
                      aria-selected={c.isSelected}
                      aria-current={c.isToday ? 'date' : undefined}
                      disabled={c.disabled}
                      tabIndex={c.iso === focusDate ? 0 : -1}
                      onClick={() => selectDay(c.iso)}
                    >
                      {c.day}
                    </button>
                  );
                })}
              </div>

              <div className={`dp-foot${clearable && value ? ' dp-foot-split' : ''}`}>
                {clearable && value && (
                  <button type="button" className="dp-clear-btn" onClick={clear}>
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  className="dp-today-btn"
                  disabled={todayDisabled}
                  onClick={() => selectDay(today)}
                >
                  Today
                </button>
              </div>
            </div>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <path d="M10 3l-5 5 5 5" /> : <path d="M6 3l5 5-5 5" />}
    </svg>
  );
}

/** Typed field with a calendar dropdown on desktop; on phones a tap opens
 *  Android's own date picker (see PhonePickers). */
export function DateField(props: DateFieldProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <PhoneDateField
        value={props.value}
        onChange={props.onChange}
        min={props.min}
        ariaLabel={props.ariaLabel}
        clearable={props.clearable}
      />
    );
  }
  return <DesktopDateField {...props} />;
}
