/**
 * Building blocks for phone bottom sheets (rendered only on phones): the sticky
 * sheet header, leading-icon rows, the Material switch and list rows for
 * menu sheets. Styles live in sheetParts.css; they all read the --m-* tokens
 * from mobile.css so every sheet looks like the same app.
 */
import type { ReactNode } from 'react';
import { useSheet } from './AnchoredPopover';
import { BackIcon, CheckIcon, CloseIcon } from './sheetIcons';
import './sheetParts.css';

interface SheetHeaderProps {
  title: ReactNode;
  /** Leading button. Defaults to closing the sheet it sits in. */
  onClose?(): void;
  /** Runs before the default (animated) close, e.g. to discard a live preview. */
  onBeforeClose?(): void;
  /** 'close' (✕, default) or 'back' (←, for a sub-page inside a sheet). */
  leading?: 'close' | 'back' | 'none';
  closeLabel?: string;
  /** Trailing filled pill (Save / Done). Without onClick it closes the sheet. */
  action?: { label: string; onClick?(): void; disabled?: boolean };
}

/** ✕ · Title · [Save] — sticks under the drag handle while the body scrolls. */
export function SheetHeader({ title, onClose, onBeforeClose, leading = 'close', closeLabel, action }: SheetHeaderProps) {
  const sheet = useSheet();
  const close =
    onClose ??
    (sheet
      ? () => {
          onBeforeClose?.();
          sheet.close();
        }
      : undefined);
  return (
    <div className="sheet-header">
      {leading !== 'none' && close ? (
        <button
          type="button"
          className="sheet-icon-btn"
          aria-label={closeLabel ?? (leading === 'back' ? 'Back' : 'Close')}
          onClick={close}
        >
          {leading === 'back' ? <BackIcon /> : <CloseIcon />}
        </button>
      ) : (
        <span className="sheet-header-gap" />
      )}
      <h2 className="sheet-header-title">{title}</h2>
      {action && (
        <button
          type="button"
          className="sheet-pill"
          onClick={action.onClick ?? (() => sheet?.close())}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** A form row with a leading 24px icon and the control(s) beside it. */
export function SheetRow({
  icon,
  children,
  className,
  align = 'center',
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'start' for multi-line bodies (description, reminders). */
  align?: 'center' | 'start';
}) {
  return (
    <div className={'sheet-row' + (align === 'start' ? ' is-top' : '') + (className ? ` ${className}` : '')}>
      <span className="sheet-row-icon">{icon}</span>
      <div className="sheet-row-body">{children}</div>
    </div>
  );
}

/** Material 3 switch (accent track, thumb grows when on). */
export function SheetSwitch({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
  /** Secondary line under the label. */
  hint?: ReactNode;
}) {
  return (
    <label className={'sheet-switch-row' + (disabled ? ' is-disabled' : '')}>
      <span className="sheet-switch-text">
        <span className="sheet-switch-label">{label}</span>
        {hint && <span className="sheet-switch-hint">{hint}</span>}
      </span>
      <span className="sheet-switch">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="sheet-switch-track" aria-hidden="true">
          <span className="sheet-switch-thumb">
            <CheckIcon size={14} />
          </span>
        </span>
      </span>
    </label>
  );
}

/** A 56px list row for menu sheets: optional leading icon, label, check when selected. */
export function SheetMenuItem({
  icon,
  label,
  selected,
  danger,
  disabled,
  onClick,
}: {
  icon?: ReactNode;
  label: ReactNode;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-checked={selected}
      className={'sheet-menu-item' + (danger ? ' is-danger' : '') + (selected ? ' is-selected' : '')}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <span className="sheet-menu-icon">{icon}</span>}
      <span className="sheet-menu-label">{label}</span>
      {selected && (
        <span className="sheet-menu-check">
          <CheckIcon />
        </span>
      )}
    </button>
  );
}
