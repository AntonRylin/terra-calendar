import { useRef, useState } from 'react';
import './expandingSearch.css';

interface Props {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}

/** Lupa that expands into a search field. Hover expansion is handled purely in
 *  CSS (`.exsearch:hover`) as a preview; clicking the lupa focuses the input and
 *  focus/value keep it expanded via the `is-open` class, so it stays open while
 *  focused or non-empty and collapses on mouse-leave only when empty and
 *  unfocused. Controlled value. */
export function ExpandingSearch({ value, onChange, placeholder = 'Search' }: Props) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Derived: stay open if value is non-empty even without focus
  const isOpen = open || value.length > 0;

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Only collapse if focus leaves the container entirely
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  function handleLupaClick() {
    setOpen(true);
    // Focus fires after state update; requestAnimationFrame ensures DOM is updated
    inputRef.current?.focus();
  }

  function handleClearClick() {
    onChange('');
    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className={`exsearch${isOpen ? ' is-open' : ''}`}
      data-testid="expanding-search"
      onFocus={() => setOpen(true)}
      onBlur={handleContainerBlur}
    >
      <button
        type="button"
        className="exsearch-lupa"
        aria-label={placeholder}
        onClick={handleLupaClick}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="text"
        className="exsearch-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {isOpen && (
        <button
          type="button"
          className="exsearch-clear"
          aria-label="Clear search"
          onClick={handleClearClick}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
