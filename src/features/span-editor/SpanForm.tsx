import { useEffect, useState, useMemo, useRef } from 'react';
import { PaletteSelector } from '../../ui/PaletteSelector';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore, getCategoryStyle } from '../../app/settingsStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { DateField } from '../../ui/DateField';
import '../event-editor/eventEditor.css';
import './spanEditor.css';

export interface SpanFormValues {
  title: string;
  type: string;
  start: string;
  end: string;
  color?: string;
  cosmetic?: string;
  showOnMinimap?: boolean;
  showInUpcoming?: boolean;
}

interface SpanFormProps {
  initial: SpanFormValues;
  submitLabel: string;
  onSubmit(values: SpanFormValues): void;
  /** Fires on every edit so the host can live-preview the span. */
  onChange?(values: SpanFormValues): void;
  /** When provided, a Delete button is shown (edit mode). */
  onDelete?(): void;
}

const PRESET_COLORS = [
  { value: '', bg: '#e5e5ea', isDefault: true },
  { value: '#0a84ff', bg: '#0a84ff' },
  { value: '#30d158', bg: '#30d158' },
  { value: '#ff9f0a', bg: '#ff9f0a' },
  { value: '#bf5af2', bg: '#bf5af2' },
  { value: '#ff3b30', bg: '#ff3b30' },
  { value: '#ffd60a', bg: '#ffd60a' },
  { value: '#ff375f', bg: '#ff375f' },
];

/** A common starter set of span types; the field also accepts free text. */
const TYPE_PRESETS = ['holiday', 'vacation', 'trip', 'event'];


/**
 * Create/edit form for multi-day spans (holidays and other typed ranges).
 * All-day in Phase 1: only a start and end date, no time.
 */
export function SpanForm({ initial, submitLabel, onSubmit, onChange, onDelete }: SpanFormProps) {
  const storeCategories = useSettingsStore((s) => s.categories);
  const events = useCalendarStore((s) => s.events);
  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    TYPE_PRESETS.forEach((t) => categories.add(t));
    events.forEach((e) => {
      if (e.type) {
        categories.add(e.type);
      }
    });
    Object.keys(storeCategories).forEach((cat) => categories.add(cat));
    return Array.from(categories).sort();
  }, [events, storeCategories]);

  const initialCategories = useMemo(() => {
    const categories = new Set<string>();
    TYPE_PRESETS.forEach((t) => categories.add(t));
    useCalendarStore.getState().events.forEach((e) => {
      if (e.type) {
        categories.add(e.type);
      }
    });
    Object.keys(useSettingsStore.getState().categories).forEach((cat) => categories.add(cat));
    return categories;
  }, []);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const typeInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initial.title);
  const [type, setType] = useState(initial.type);

  const filteredCategories = useMemo(() => {
    const query = type.trim().toLowerCase();
    if (!query) return existingCategories;
    return existingCategories.filter((cat) => cat.toLowerCase().includes(query));
  }, [existingCategories, type]);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [color, setColor] = useState(initial.color ?? '');
  const [cosmetic, setCosmetic] = useState(initial.cosmetic ?? '');
  const [showOnMinimap, setShowOnMinimap] = useState(initial.showOnMinimap !== false);
  const [showInUpcoming, setShowInUpcoming] = useState(initial.showInUpcoming !== false);

  // Keep start <= end: nudge the other bound when one crosses it.
  useEffect(() => {
    if (end < start) setEnd(start);
  }, [start, end]);

  const values: SpanFormValues = {
    title: title.trim(),
    type: type.trim() || 'holiday',
    start,
    end: end >= start ? end : start,
    color: color || undefined,
    cosmetic: cosmetic || undefined,
    showOnMinimap,
    showInUpcoming,
  };

  // Live-preview every edit (color, on-map, dates, …) in the background UI.
  useEffect(() => {
    onChange?.(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, type, start, end, color, cosmetic, showOnMinimap, showInUpcoming]);

  const canSave = title.trim().length > 0 && start.length > 0 && end.length > 0 && end >= start;

  function submit(finalType?: string) {
    if (!canSave) return;
    const activeType = finalType !== undefined ? finalType : type;
    onSubmit({
      ...values,
      type: activeType.trim() || 'holiday',
    });
  }

  return (
    <div className="event-editor">
      <input
        className="editor-title"
        aria-label="Title"
        placeholder="Holiday name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus={!onDelete}
      />

      <div className="editor-row">
        <label className="editor-label" style={{ width: '100%' }}>
          Type
          <div className="category-select-wrap">
            <input
              ref={typeInputRef}
              type="text"
              className={`category-input-with-chevron ${type && !isInputFocused ? 'hidden-text' : ''}`}
              aria-label="Type"
              placeholder="holiday"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => {
                setIsInputFocused(true);
                setDropdownOpen(true);
              }}
              onBlur={() => {
                setIsInputFocused(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const trimmed = e.currentTarget.value.trim();
                  setType(trimmed);
                  setDropdownOpen(false);
                  submit(trimmed);
                } else if (e.key === 'Escape') {
                  setDropdownOpen(false);
                }
              }}
            />
            {type && !isInputFocused && (
              <span
                className="upcoming-type category-input-overlay"
                style={getCategoryStyle(storeCategories[type])}
              >
                {type}
              </span>
            )}
            <div className={`category-dropdown-arrow ${dropdownOpen ? 'open' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6l4 4 4-4" />
              </svg>
            </div>
            {dropdownOpen && typeInputRef.current && (
              <AnchoredPopover
                anchorEl={typeInputRef.current}
                onClose={() => setDropdownOpen(false)}
                placement="bottom-start"
                className="category-dropdown-popover"
                matchAnchorWidth={true}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {type.trim() && !existingCategories.some(cat => cat.toLowerCase() === type.trim().toLowerCase()) && (
                    <button
                      type="button"
                      role="menuitem"
                      className="category-dropdown-item create-item"
                      onClick={() => {
                        const trimmed = type.trim();
                        setType(trimmed);
                        setDropdownOpen(false);
                      }}
                    >
                      <span className="category-menu-check" aria-hidden="true" style={{ width: 'auto', minWidth: '24px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)', textTransform: 'uppercase' }}>new</span>
                      </span>
                      <span className="upcoming-type" style={getCategoryStyle(storeCategories[type.trim()])}>
                        {type.trim()}
                      </span>
                    </button>
                  )}
                  {filteredCategories.map((cat) => {
                    const isNew = !initialCategories.has(cat);
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className="category-dropdown-item"
                        key={cat}
                        onClick={() => {
                          setType(cat);
                          setDropdownOpen(false);
                        }}
                      >
                        <span className="category-menu-check" aria-hidden="true" style={{ width: isNew ? 'auto' : undefined, minWidth: isNew ? '24px' : undefined }}>
                          {isNew ? (
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)', textTransform: 'uppercase' }}>new</span>
                          ) : (
                            type.trim() === cat && (
                              <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )
                          )}
                        </span>
                        <span
                          className="upcoming-type"
                          style={getCategoryStyle(storeCategories[cat])}
                        >
                          {cat}
                        </span>
                      </button>
                    );
                  })}
                  {filteredCategories.length === 0 && !type.trim() && (
                    <div className="category-dropdown-empty">
                      Type to create a category
                    </div>
                  )}
                </div>
              </AnchoredPopover>
            )}
          </div>
        </label>
      </div>

      <div className="editor-row span-date-row">
        <label className="editor-label">
          From
          <DateField value={start} onChange={setStart} ariaLabel="Start date" />
        </label>
        <label className="editor-label">
          To
          <DateField value={end} min={start} onChange={setEnd} ariaLabel="End date" />
        </label>
      </div>

      <div className="color-selector-row">
        <span className="color-label">Color</span>
        <PaletteSelector value={color} onChange={setColor} presets={PRESET_COLORS} allowCustom={true} />
      </div>

      <div className="color-selector-row style-row">
        <span className="color-label">Style</span>
        <CosmeticSelector value={cosmetic} onChange={setCosmetic} color={color || undefined} />
      </div>

      <div className="minimap-toggle-row">
        <label className="ios-switch-label">
          On map
          <div className="ios-switch">
            <input
              type="checkbox"
              checked={showOnMinimap}
              onChange={(e) => setShowOnMinimap(e.target.checked)}
            />
            <span className="ios-switch-slider" />
          </div>
        </label>
        <label className="ios-switch-label">
          In upcoming
          <div className="ios-switch">
            <input
              type="checkbox"
              checked={showInUpcoming}
              onChange={(e) => setShowInUpcoming(e.target.checked)}
            />
            <span className="ios-switch-slider" />
          </div>
        </label>
      </div>

      <div className="editor-actions">
        {onDelete ? (
          <button className="editor-delete tb tb-text" onClick={onDelete}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="editor-save tb tb-text tb-primary" onClick={() => submit()} disabled={!canSave}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
