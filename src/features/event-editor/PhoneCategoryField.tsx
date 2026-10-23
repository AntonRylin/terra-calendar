import { forwardRef, useRef, useState } from 'react';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { SheetMenuItem } from '../../ui/SheetParts';
import { CheckIcon } from '../../ui/sheetIcons';
import { useSettingsStore, getCategoryStyle } from '../../app/settingsStore';

interface Props {
  value: string;
  onChange(category: string): void;
  /** Every category the user has (from events and settings), sorted. */
  categories: string[];
  label?: string;
  placeholder?: string;
}

/**
 * Phone category picker. The desktop field is a type-ahead input with a
 * dropdown; on a phone that dropdown would be a sheet covering the input you
 * are typing into. Here the row shows the current category as its chip, and a
 * tap opens a sheet: a "new category" field on top, then every category as a
 * list row with a check on the current one.
 */
export const PhoneCategoryField = forwardRef<HTMLButtonElement, Props>(function PhoneCategoryField(
  { value, onChange, categories, label = 'Category', placeholder = 'Add category' },
  ref,
) {
  const storeCategories = useSettingsStore((s) => s.categories);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const current = value.trim();

  const pick = (next: string) => {
    onChange(next);
    setDraft('');
    setOpen(false);
  };
  const draftName = draft.trim();
  const dot = (cat: string) => (
    <span
      className="phone-cat-dot"
      aria-hidden="true"
      style={{ background: storeCategories[cat]?.value ?? 'var(--color-text-faint)' }}
    />
  );
  const draftExists = categories.some((c) => c.toLowerCase() === draftName.toLowerCase());

  return (
    <>
      <button
        ref={(el) => {
          btnRef.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        type="button"
        className={'phone-cat-trigger' + (current ? '' : ' is-empty')}
        aria-label={current ? `${label}: ${current}` : label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {current ? (
          <>
            {dot(current)}
            <span className="upcoming-type phone-cat-chip" style={getCategoryStyle(storeCategories[current])}>
              {current}
            </span>
          </>
        ) : (
          placeholder
        )}
      </button>
      {open && btnRef.current && (
        <AnchoredPopover anchorEl={btnRef.current} onClose={() => setOpen(false)} className="phone-cat-sheet">
          <div className="sheet-title">{label}</div>
          <form
            className="phone-cat-new"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draftName) return;
              pick(categories.find((c) => c.toLowerCase() === draftName.toLowerCase()) ?? draftName);
            }}
          >
            <input
              className="sheet-field"
              aria-label={`New ${label.toLowerCase()}`}
              placeholder={`New ${label.toLowerCase()}`}
              value={draft}
              enterKeyHint="done"
              onChange={(e) => setDraft(e.target.value)}
            />
            {draftName && !draftExists && (
              <button type="submit" className="sheet-icon-btn phone-cat-add" aria-label={`Create ${draftName}`}>
                <CheckIcon />
              </button>
            )}
          </form>
          <div role="menu" aria-label={label}>
            <SheetMenuItem
              icon={<span className="phone-cat-dot is-none" aria-hidden="true" />}
              label={`No ${label.toLowerCase()}`}
              selected={!current}
              onClick={() => pick('')}
            />
            {categories
              .filter((c) => !draftName || c.toLowerCase().includes(draftName.toLowerCase()))
              .map((cat) => (
                <SheetMenuItem
                  key={cat}
                  icon={dot(cat)}
                  selected={cat === current}
                  onClick={() => pick(cat)}
                  label={
                    <span className="upcoming-type phone-cat-chip" style={getCategoryStyle(storeCategories[cat])}>
                      {cat}
                    </span>
                  }
                />
              ))}
          </div>
        </AnchoredPopover>
      )}
    </>
  );
});
