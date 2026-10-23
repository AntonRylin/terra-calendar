/**
 * Phone versions of DateField / TimeField. Android has good native date and
 * time dialogs, so on phones the field is a readable label ("Fri, 23 Oct",
 * "09:00") with a transparent native input stretched over it: a tap opens the
 * system picker. Desktop keeps the typed fields with their own dropdowns.
 */
import { useRef } from 'react';
import { CloseIcon } from './sheetIcons';
import './phonePickers.css';

/** "Fri, 23 Oct" (adds the year when it isn't this year). */
export function formatPhoneDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

function openPicker(input: HTMLInputElement | null) {
  try {
    input?.showPicker?.();
  } catch {
    /* Not allowed here (no user gesture) — the tap itself still focuses it. */
  }
}

interface PhoneFieldProps {
  value: string;
  onChange(value: string): void;
  ariaLabel: string;
  clearable?: boolean;
  placeholder: string;
  /** Shown after the value, e.g. the duration of an end time. */
  suffix?: string;
}

function PhonePicker({
  type,
  min,
  value,
  onChange,
  ariaLabel,
  clearable,
  placeholder,
  suffix,
  label,
}: PhoneFieldProps & { type: 'date' | 'time'; min?: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className={'phone-picker' + (value ? '' : ' is-empty') + (clearable && value ? ' has-clear' : '')}>
      <span className="phone-picker-text" aria-hidden="true">
        {value ? label : placeholder}
        {value && suffix && <span className="phone-picker-suffix">{suffix}</span>}
      </span>
      <input
        ref={ref}
        type={type}
        className="phone-picker-native"
        aria-label={ariaLabel}
        value={value}
        min={min}
        onClick={() => openPicker(ref.current)}
        onChange={(e) => {
          const next = e.target.value;
          // Android's dialog has its own "Clear"; only honour it when allowed.
          if (!next && !clearable) return;
          onChange(next);
        }}
      />
      {clearable && value && (
        <button
          type="button"
          className="phone-picker-clear"
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          onClick={() => onChange('')}
        >
          <CloseIcon />
        </button>
      )}
    </span>
  );
}

export function PhoneDateField({
  value,
  onChange,
  min,
  ariaLabel = 'Date',
  clearable,
}: {
  value: string;
  onChange(iso: string): void;
  min?: string;
  ariaLabel?: string;
  clearable?: boolean;
}) {
  return (
    <PhonePicker
      type="date"
      min={min}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      clearable={clearable}
      placeholder="Set date"
      label={value ? formatPhoneDate(value) : ''}
    />
  );
}

export function PhoneTimeField({
  value,
  onChange,
  ariaLabel = 'Time',
  clearable,
  suffix,
}: {
  value: string;
  onChange(time: string): void;
  ariaLabel?: string;
  clearable?: boolean;
  suffix?: string;
}) {
  return (
    <PhonePicker
      type="time"
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      clearable={clearable}
      placeholder="Add time"
      label={value}
      suffix={suffix}
    />
  );
}
