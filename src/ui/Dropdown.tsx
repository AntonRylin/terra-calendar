import { useEffect, useState, useRef } from 'react';
import { AnchoredPopover } from './AnchoredPopover';
import { ToolbarButton } from './ToolbarButton';
import { SheetMenuItem } from './SheetParts';
import { useIsMobile } from './useMediaQuery';
import './dropdown.css';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface Props<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange(value: T): void;
  ariaLabel?: string;
}

/** Notion-style labeled selector: the trigger names the current value; the menu
 *  lists options with a leading checkmark and an optional keyboard hint. */
export function Dropdown<T extends string>({ value, options, onChange, ariaLabel }: Props<T>) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  const isMobile = useIsMobile();

  // The menu shows hint keys (kbd) — honor them while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = options.find((o) => o.hint && o.hint.toLowerCase() === e.key.toLowerCase());
      if (!hit) return;
      e.preventDefault();
      onChange(hit.value);
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, options, onChange]);
  return (
    <>
      <ToolbarButton
        ref={anchor}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? value}
        <svg className="dd-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </ToolbarButton>
      {open && anchor.current && (
        <AnchoredPopover anchorEl={anchor.current} onClose={() => setOpen(false)} placement="bottom-end" className="popover--dropdown">
          {isMobile ? (
            // Phone: a menu sheet — title, 56px rows, a check on the current one.
            <div className="dd-menu" role="menu" aria-label={ariaLabel}>
              {ariaLabel && <div className="sheet-title">{ariaLabel}</div>}
              {options.map((o) => (
                <SheetMenuItem
                  key={o.value}
                  label={o.label}
                  selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ) : (
          <div className="dd-menu" role="menu">
            {options.map((o) => (
              <button
                key={o.value}
                role="menuitem"
                aria-checked={o.value === value}
                className="dd-item"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="dd-check">
                  {o.value === value && (
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className="dd-label">{o.label}</span>
                {o.hint && <kbd className="dd-hint">{o.hint}</kbd>}
              </button>
            ))}
          </div>
          )}
        </AnchoredPopover>
      )}
    </>
  );
}
