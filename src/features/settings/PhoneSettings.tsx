import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnchoredPopover, useSheet } from '../../ui/AnchoredPopover';
import '../../ui/dropdown.css';
import './phoneSettings.css';

/*
 * Phone-only building blocks for Settings (rendered only under useIsMobile()):
 * a Material top app bar, grouped list cards, navigation / switch / select /
 * action rows. Desktop never renders these.
 */

export function PhoneAppBar({
  title,
  onBack,
  backLabel,
  raised,
}: {
  title: string;
  onBack(): void;
  backLabel: string;
  /** Content is scrolled underneath: tint the bar like Material does. */
  raised?: boolean;
}) {
  return (
    <header className={`ps-appbar${raised ? ' is-raised' : ''}`}>
      <button type="button" className="ps-appbar-back" onClick={onBack} aria-label={backLabel}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="20" y1="12" x2="4" y2="12" />
          <polyline points="10 18 4 12 10 6" />
        </svg>
      </button>
      <h2 className="ps-appbar-title">{title}</h2>
    </header>
  );
}

/** A rounded card of rows, optionally under an accent subhead. */
export function PhoneGroup({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="ps-group">
      {title && <h3 className="ps-subhead">{title}</h3>}
      <div className="ps-card">{children}</div>
      {footer && <p className="ps-footnote">{footer}</p>}
    </div>
  );
}

/** Accent subhead + free-form body (for controls that aren't rows). */
export function PhoneBlock({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="ps-group">
      {title && <h3 className="ps-subhead">{title}</h3>}
      <div className="ps-card ps-card-pad">{children}</div>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="ps-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function RowText({ title, summary }: { title: ReactNode; summary?: ReactNode }) {
  return (
    <span className="ps-row-text">
      <span className="ps-row-title">{title}</span>
      {summary && <span className="ps-row-summary">{summary}</span>}
    </span>
  );
}

/** Opens a page (chevron at the end). */
export function PhoneNavRow({
  icon,
  title,
  summary,
  onClick,
}: {
  icon?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  onClick(): void;
}) {
  return (
    <button type="button" className="ps-row" onClick={onClick}>
      {icon && <span className="ps-icon">{icon}</span>}
      <RowText title={title} summary={summary} />
      <Chevron />
    </button>
  );
}

/** Runs an action (or opens a link) — no chevron. */
export function PhoneActionRow({
  icon,
  title,
  summary,
  onClick,
  href,
  danger,
  disabled,
  trailing,
}: {
  icon?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  onClick?(): void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const cls = `ps-row${danger ? ' is-danger' : ''}`;
  const body = (
    <>
      {icon && <span className="ps-icon">{icon}</span>}
      <RowText title={title} summary={summary} />
      {trailing}
    </>
  );
  if (href) {
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}

/** Whole row toggles; Material switch at the end. */
export function PhoneSwitchRow({
  title,
  summary,
  checked,
  disabled,
  onChange,
}: {
  title: ReactNode;
  summary?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className={`ps-row${disabled ? ' is-disabled' : ''}`}>
      <RowText title={title} summary={summary} />
      <PhoneSwitch checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}

export function PhoneSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  label?: string;
}) {
  return (
    <span className={`ps-switch${checked ? ' is-on' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ps-switch-thumb" aria-hidden="true" />
    </span>
  );
}

export interface PhoneOption<T extends string> {
  value: T;
  label: string;
}

/** A row showing the current value; tapping opens the shared bottom sheet. */
export function PhoneSelectRow<T extends string>({
  title,
  value,
  options,
  onChange,
  sheetTitle,
}: {
  title: string;
  value: T;
  options: PhoneOption<T>[];
  onChange(value: T): void;
  sheetTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  // Long lists (time zones): start the sheet at the current choice.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="ps-row"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <RowText title={title} summary={current?.label ?? value} />
        <svg className="ps-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && anchor.current && (
        <AnchoredPopover anchorEl={anchor.current} onClose={() => setOpen(false)} className="popover--dropdown ps-sheet">
          <div className="ps-sheet-title">{sheetTitle ?? title}</div>
          <SelectSheetList listRef={listRef} value={value} options={options} onPick={(v) => onChange(v)} onDone={() => setOpen(false)} />
        </AnchoredPopover>
      )}
    </>
  );
}

/** The options inside the sheet. Closes through the sheet so it slides away. */
function SelectSheetList<T extends string>({
  listRef,
  value,
  options,
  onPick,
  onDone,
}: {
  listRef: React.RefObject<HTMLDivElement>;
  value: T;
  options: PhoneOption<T>[];
  onPick(value: T): void;
  onDone(): void;
}) {
  const sheet = useSheet();
  return (
    <div className="dd-menu" role="menu" ref={listRef}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="menuitemradio"
          aria-checked={o.value === value}
          className="dd-item"
          onClick={() => {
            onPick(o.value);
            if (sheet) sheet.close();
            else onDone();
          }}
        >
          <span className="dd-check">
            {o.value === value && (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <span className="dd-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
