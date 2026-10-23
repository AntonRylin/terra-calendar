import { useEffect, useMemo, useRef, useState } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { useIsMobile } from './useMediaQuery';
import { PhoneTimeField } from './PhonePickers';
import {
  formatDuration,
  minutesToTime,
  parseLooseTime,
  timeToMinutes,
} from '../core/timeOfDay';
import './timeField.css';

const STEP_MIN = 15;
const DAY_MIN = 24 * 60;

interface TimeFieldProps {
  /** Current value as "HH:mm" (may be ""). */
  value: string;
  onChange(time: string): void;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Show a Clear button and allow committing an empty value (all-day). */
  clearable?: boolean;
  /** For an end time: the start time. The list then only offers later times,
   *  each annotated with the resulting duration. */
  relativeTo?: string;
}

interface TimeOption {
  value: string;
  hint?: string;
}

/**
 * A time field you can just type into — "1430", "9:30", "9pm" — with a quick
 * scrollable list of times. Replaces the native `<input type="time">`.
 */
function DesktopTimeField({
  value,
  onChange,
  ariaLabel = 'Time',
  autoFocus,
  clearable,
  relativeTo,
}: TimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo<TimeOption[]>(() => {
    const startMin = relativeTo ? timeToMinutes(relativeTo) : null;
    const out: TimeOption[] = [];
    for (let mins = 0; mins < DAY_MIN; mins += STEP_MIN) {
      if (startMin !== null && mins <= startMin) continue;
      out.push({
        value: minutesToTime(mins),
        hint: startMin !== null ? formatDuration(mins - startMin) : undefined,
      });
    }
    return out;
  }, [relativeTo]);

  // Keep the text mirroring the value while closed; leave typing alone while open.
  useEffect(() => {
    if (open) return;
    setText(value);
  }, [value, open]);

  const parsed = parseLooseTime(text);
  const selected = parsed ?? value;

  // Commit as you type (live, like the rest of the form); text left as typed.
  useEffect(() => {
    const p = parseLooseTime(text);
    if (p && p !== value) onChange(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Scroll the highlighted time into view (centred) whenever it changes.
  useEffect(() => {
    if (!open) return;
    const c = listRef.current;
    if (!c) return;
    const target = selected || '09:00';
    const el = c.querySelector<HTMLElement>(`[data-time="${target}"]`);
    if (!el) return;
    c.scrollTop = el.offsetTop - c.clientHeight / 2 + el.offsetHeight / 2;
  }, [open, selected]);

  function openPicker() {
    setOpen(true);
  }

  function pick(time: string) {
    onChange(time);
    setText(time);
    setOpen(false);
  }

  function handleClose() {
    const p = parseLooseTime(text);
    setText(p ?? value);
    setOpen(false);
  }

  // Arrow keys step through the list, filling the field with the next/prev slot.
  function step(dir: 1 | -1) {
    const cur = selected ? timeToMinutes(selected) : dir > 0 ? -1 : DAY_MIN;
    let target: TimeOption | undefined;
    if (dir > 0) {
      target = options.find((o) => timeToMinutes(o.value) > cur) ?? options[options.length - 1];
    } else {
      const earlier = options.filter((o) => timeToMinutes(o.value) < cur);
      target = earlier[earlier.length - 1] ?? options[0];
    }
    if (target) setText(target.value);
  }

  return (
    <div className="time-field">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="time-field-input"
        aria-label={ariaLabel}
        placeholder="--:--"
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
          if (!open) openPicker();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleClose();
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setText(value);
            setOpen(false);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) openPicker();
            else step(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (open) step(-1);
          }
        }}
      />
      <button
        type="button"
        className="time-field-icon"
        tabIndex={-1}
        aria-label="Choose time"
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
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
      </button>

      {open && inputRef.current && (
        <AnchoredPopover
          anchorEl={inputRef.current}
          onClose={handleClose}
          placement="bottom-start"
          className="time-popover"
        >
          <div className="tp">
            <div className="tp-list" ref={listRef} role="listbox">
              {options.length === 0 && <div className="tp-empty">No later time</div>}
              {options.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  data-time={o.value}
                  role="option"
                  aria-selected={o.value === selected}
                  className={`tp-option${o.value === selected ? ' selected' : ''}`}
                  onClick={() => pick(o.value)}
                >
                  <span className="tp-time">{o.value}</span>
                  {o.hint && <span className="tp-hint">{o.hint}</span>}
                </button>
              ))}
            </div>
            {clearable && value && (
              <div className="tp-foot">
                <button
                  type="button"
                  className="tp-clear-btn"
                  onClick={() => pick('')}
                >
                  Clear (all-day)
                </button>
              </div>
            )}
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}

/** Typed field with a time list on desktop; on phones a tap opens Android's
 *  own time picker (see PhonePickers). */
export function TimeField(props: TimeFieldProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    const { value, relativeTo } = props;
    const dur =
      relativeTo && value ? timeToMinutes(value) - timeToMinutes(relativeTo) : 0;
    return (
      <PhoneTimeField
        value={value}
        onChange={props.onChange}
        ariaLabel={props.ariaLabel}
        clearable={props.clearable}
        suffix={dur > 0 ? formatDuration(dur) : undefined}
      />
    );
  }
  return <DesktopTimeField {...props} />;
}
