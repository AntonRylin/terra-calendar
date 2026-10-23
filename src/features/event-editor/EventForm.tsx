import { useState, useEffect, useMemo, useRef } from 'react';
import type { Recurrence, EventReminder } from '../../core/types';
import { addMinutesToTime, defaultEndTime, durationMinutes, DEFAULT_DURATION_MIN } from '../../core/timeOfDay';
import { PaletteSelector } from '../../ui/PaletteSelector';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
import { ProviderLogo } from '../../ui/brandLogos';
import { useConnectionStore } from '../../app/connectionStore';
import type { ConnectedCalendar, Provider } from '../../app/connectionStore';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore, getCategoryStyle } from '../../app/settingsStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { HoverTip } from '../../ui/HoverTip';
import { useNestedEscape } from '../../ui/useNestedEscape';
import { DateField } from '../../ui/DateField';
import { TimeField } from '../../ui/TimeField';
import { CategoryEditor } from '../category-editor/CategoryEditor';
import { REMINDER_PRESETS, PRESET_KEYS, reminderLabel, type ReminderUnit } from './reminderPresets';
import { EventSharePicker } from '../sharing/EventSharePicker';
import './eventEditor.css';

interface FormReminder {
  value: number;
  unit: ReminderUnit;
  isCustom?: boolean;
}

/** Group enabled calendars by their owning account, preserving first-seen order. */
function groupByAccount(
  calendars: ConnectedCalendar[],
): { account: string; provider: Provider; calendars: ConnectedCalendar[] }[] {
  const groups: { account: string; provider: Provider; calendars: ConnectedCalendar[] }[] = [];
  for (const cal of calendars) {
    const key = `${cal.provider}:${cal.account}`;
    let group = groups.find((g) => `${g.provider}:${g.account}` === key);
    if (!group) {
      group = { account: cal.account, provider: cal.provider, calendars: [] };
      groups.push(group);
    }
    group.calendars.push(cal);
  }
  return groups;
}

type RecurrenceUnit = Recurrence['unit'] | 'never';

const UNIT_LABELS: Record<Exclude<RecurrenceUnit, 'never'>, string> = {
  day: 'days',
  week: 'weeks',
  month: 'months',
  year: 'years',
};

export interface EventFormValues {
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  description?: string;
  recurrence: Recurrence | null;
  color?: string;
  cosmetic?: string;
  showOnMinimap?: boolean;
  showInUpcoming?: boolean;
  calendarUrls?: string[];
  type?: string;
  reminders?: EventReminder[];
  shareInclude?: string[];
  shareExclude?: string[];
}

interface EventFormProps {
  initial: EventFormValues;
  submitLabel: string;
  onSubmit(values: EventFormValues): void;
  onChange?(values: EventFormValues): void;
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


function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M11.2 2.6a1.4 1.4 0 0 1 2 2L6.4 11.4l-2.6.8.8-2.6 6.6-7z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface VisibilitySwitchProps {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
  /** Category whose setting overrides this toggle, or null when the event owns it. */
  lockedBy: string | null;
  /** What that category does, completing "…which <reason>". */
  lockReason: string;
  onEditCategory(): void;
}

/**
 * One of the two visibility switches. A category can hide all of its events
 * from the minimap / Upcoming (see core/categoryVisibility), and then the
 * per-event flag has no effect at all — so the switch is shown in its effective
 * (off) position, locked, with a hover card naming the category that decides it
 * and a link into the category editor.
 */
function VisibilitySwitch({ label, checked, onChange, lockedBy, lockReason, onEditCategory }: VisibilitySwitchProps) {
  if (!lockedBy) {
    return (
      <label className="ios-switch-label">
        {label}
        <div className="ios-switch">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="ios-switch-slider" />
        </div>
      </label>
    );
  }
  return (
    <span className="ios-switch-label is-locked">
      <span className="switch-label-text">
        {label}
        <HoverTip
          label={`Why "${label}" can't be changed`}
          content={(close) => (
            <>
              <div>
                <strong>{label}</strong> is set by the <strong>{lockedBy}</strong> category, which {lockReason}.
              </div>
              <button
                type="button"
                className="hovertip-link"
                onClick={() => {
                  close();
                  onEditCategory();
                }}
              >
                Edit category
              </button>
            </>
          )}
        >
          <LockIcon />
        </HoverTip>
      </span>
      <div className="ios-switch">
        <input
          type="checkbox"
          checked={false}
          disabled
          readOnly
          aria-label={`${label} (set by the ${lockedBy} category)`}
        />
        <span className="ios-switch-slider" />
      </div>
    </span>
  );
}

/** Shared event form used by both the editor (edit) and the manual-add popover. */
export function EventForm({ initial, submitLabel, onSubmit, onChange, onDelete }: EventFormProps) {
  const caldav = useConnectionStore((s) => s.caldav);
  const google = useConnectionStore((s) => s.google);
  const enabledCalendars = useMemo(
    () => useConnectionStore.getState().enabledCalendars(),
    [caldav, google],
  );
  const defaultUrls = useMemo(
    () => useConnectionStore.getState().defaultCalendarUrls(),
    [caldav, google],
  );
  const isConnected = enabledCalendars.length > 0;
  const calendarGroups = useMemo(() => groupByAccount(enabledCalendars), [enabledCalendars]);

  const storeCategories = useSettingsStore((s) => s.categories);
  const events = useCalendarStore((s) => s.events);
  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
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
    useCalendarStore.getState().events.forEach((e) => {
      if (e.type) {
        categories.add(e.type);
      }
    });
    Object.keys(useSettingsStore.getState().categories).forEach((cat) => categories.add(cat));
    return categories;
  }, []);

  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  /** Category editor opened from this form (the pencil, or a locked toggle's
   *  hover card). Local rather than via uiStore, whose overlays are mutually
   *  exclusive — the event editor has to stay open underneath. */
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const categoryEditBtnRef = useRef<HTMLButtonElement>(null);
  useNestedEscape(categoryEditorOpen, () => setCategoryEditorOpen(false));

  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time ?? '');
  const [endTime, setEndTime] = useState(
    initial.time ? initial.endTime ?? defaultEndTime(initial.time) : '',
  );
  const [description, setDescription] = useState(initial.description ?? '');

  function handleTimeChange(next: string) {
    if (!next) {
      setTime('');
      setEndTime('');
      return;
    }
    // Moving the start keeps the event's duration (1h when there was no valid end).
    const dur = time && endTime ? durationMinutes(time, endTime) : DEFAULT_DURATION_MIN;
    setTime(next);
    setEndTime(addMinutesToTime(next, dur));
  }

  /** End time as saved: only for timed events, always after the start. */
  function outputEndTime(): string | undefined {
    if (!time) return undefined;
    return endTime && endTime > time ? endTime : defaultEndTime(time);
  }
  const [unit, setUnit] = useState<RecurrenceUnit>(initial.recurrence?.unit ?? 'never');
  const [interval, setIntervalValue] = useState(initial.recurrence?.interval ?? 1);
  const [color, setColor] = useState(initial.color ?? '');
  const [cosmetic, setCosmetic] = useState(initial.cosmetic ?? '');
  const [showOnMinimap, setShowOnMinimap] = useState(initial.showOnMinimap !== false);
  const [showInUpcoming, setShowInUpcoming] = useState(initial.showInUpcoming !== false);
  const [calendarUrls, setCalendarUrls] = useState<string[]>(
    initial.calendarUrls && initial.calendarUrls.length > 0 ? initial.calendarUrls : defaultUrls,
  );
  // Per-event sharing overrides. Held as one object so the picker can set both
  // halves at once (adding to one share can clear an exclude on another).
  const [shareOverrides, setShareOverrides] = useState<{
    shareInclude?: string[];
    shareExclude?: string[];
  }>({ shareInclude: initial.shareInclude, shareExclude: initial.shareExclude });
  const [category, setCategory] = useState(initial.type ?? '');

  const filteredCategories = useMemo(() => {
    const query = category.trim().toLowerCase();
    if (!query) return existingCategories;
    return existingCategories.filter((cat) => cat.toLowerCase().includes(query));
  }, [existingCategories, category]);
  const [reminders, setReminders] = useState<FormReminder[]>(() =>
    (initial.reminders ?? []).map((r) => ({
      ...r,
      isCustom: !PRESET_KEYS.has(`${r.value}-${r.unit}`),
    })),
  );
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<number | null>(null);
  const addMenuBtnRef = useRef<HTMLButtonElement>(null);

  /** Last category whose default reminders were offered as pills, so switching
   *  back and forth doesn't re-add ones the user deliberately removed. */
  const appliedCategoryRef = useRef((initial.type ?? '').trim());

  /** The category's default reminders not present in `list` yet. */
  function missingCategoryReminders(cat: string, list: FormReminder[]): FormReminder[] {
    const defaults = useSettingsStore.getState().categories[cat]?.reminders ?? [];
    const have = new Set(list.map((r) => `${r.value}-${r.unit}`));
    return defaults
      .filter((r) => !have.has(`${r.value}-${r.unit}`))
      .map((r) => ({ value: r.value, unit: r.unit, isCustom: !PRESET_KEYS.has(`${r.value}-${r.unit}`) }));
  }

  // Assigning a category pulls in its default reminders as removable pills.
  useEffect(() => {
    const trimmed = category.trim();
    if (trimmed === appliedCategoryRef.current) return;
    appliedCategoryRef.current = trimmed;
    if (!trimmed) return;
    setReminders((prev) => {
      const add = missingCategoryReminders(trimmed, prev);
      return add.length > 0 ? [...prev, ...add] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  function addReminderPreset(value: number, unit: ReminderUnit) {
    setReminders((prev) => [...prev, { value, unit, isCustom: false }]);
    setAddMenuOpen(false);
  }

  function addCustomReminder() {
    setReminders((prev) => {
      setEditingReminder(prev.length);
      return [...prev, { value: 10, unit: 'minutes', isCustom: true }];
    });
    setAddMenuOpen(false);
  }

  function removeReminder(index: number) {
    setReminders((prev) => prev.filter((_, i) => i !== index));
    setEditingReminder((cur) => (cur === index ? null : cur !== null && cur > index ? cur - 1 : cur));
  }

  function handleReminderCustomValueChange(index: number, val: number) {
    setReminders((prev) => prev.map((r, i) => (i === index ? { ...r, value: Math.max(0, val) } : r)));
  }

  function handleReminderCustomUnitChange(index: number, unit: ReminderUnit) {
    setReminders((prev) => prev.map((r, i) => (i === index ? { ...r, unit } : r)));
  }

  const reminderKeys = useMemo(
    () => new Set(reminders.filter((r) => !r.isCustom).map((r) => `${r.value}-${r.unit}`)),
    [reminders],
  );

  const canSave = title.trim().length > 0 && date.length > 0;

  // The event's category can hard-override the two visibility toggles below —
  // when it hides its events from a surface, the per-event flag cannot bring
  // them back (core/categoryVisibility). Read live so flipping it in the
  // category editor opened from here re-locks/unlocks them straight away.
  const categoryName = category.trim();
  const categoryConfig = categoryName ? storeCategories[categoryName] : undefined;
  const minimapLockedBy = categoryConfig?.hideFromMinimap ? categoryName : null;
  const upcomingLockedBy = categoryConfig?.hideFromUpcoming ? categoryName : null;

  function toggleCalendar(url: string): void {
    setCalendarUrls((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      // One calendar per account (iCloud/CalDAV enforce UID uniqueness per
      // account): picking a calendar replaces any other already-selected one
      // from the same account rather than stacking a second.
      const accountOf = (u: string) => {
        const c = enabledCalendars.find((x) => x.url === u);
        return c ? `${c.provider}:${c.account}` : u;
      };
      const target = accountOf(url);
      return [...prev.filter((u) => accountOf(u) !== target), url];
    });
  }

  // Output the chosen calendars (only those still enabled). When connected and
  // the user has cleared the list, fall back to the defaults so the event still
  // syncs somewhere rather than being silently dropped.
  function outputCalendarUrls(): string[] | undefined {
    if (!isConnected) return undefined;
    const known = new Set(enabledCalendars.map((c) => c.url));
    const chosen = calendarUrls.filter((u) => known.has(u));
    return chosen.length > 0 ? chosen : defaultUrls;
  }

  useEffect(() => {
    if (onChange) {
      onChange({
        title: title.trim(),
        date,
        time: time || undefined,
        endTime: outputEndTime(),
        description: description.trim() || undefined,
        recurrence: unit === 'never' ? null : { unit, interval: Math.max(1, Math.floor(interval) || 1) },
        color: color || undefined,
        cosmetic: cosmetic || undefined,
        showOnMinimap,
        showInUpcoming,
        calendarUrls: outputCalendarUrls(),
        type: category.trim() || undefined,
        reminders: reminders.map(({ value, unit }) => ({ value, unit })),
        ...shareOverrides,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, date, time, endTime, description, unit, interval, color, cosmetic, showOnMinimap, showInUpcoming, calendarUrls, category, reminders, shareOverrides, onChange]);

  function submit(finalCategory?: string) {
    if (!canSave) return;
    const cat = finalCategory !== undefined ? finalCategory : category;
    // Enter-to-submit from the category input can outrun the effect above —
    // fold in any category defaults it hasn't offered yet.
    const trimmedCat = cat.trim();
    const finalReminders =
      trimmedCat && trimmedCat !== appliedCategoryRef.current
        ? [...reminders, ...missingCategoryReminders(trimmedCat, reminders)]
        : reminders;
    onSubmit({
      title: title.trim(),
      date,
      time: time || undefined,
      endTime: outputEndTime(),
      description: description.trim() || undefined,
      recurrence: unit === 'never' ? null : { unit, interval: Math.max(1, Math.floor(interval) || 1) },
      color: color || undefined,
      cosmetic: cosmetic || undefined,
      showOnMinimap,
      showInUpcoming,
      calendarUrls: outputCalendarUrls(),
      type: trimmedCat || undefined,
      reminders: finalReminders.map(({ value, unit }) => ({ value, unit })),
      ...shareOverrides,
    });
  }

  return (
    <div className="event-editor">
      <input
        className="editor-title"
        aria-label="Title"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        autoFocus={!onDelete}
      />
      <div className="editor-row">
        <DateField value={date} onChange={setDate} ariaLabel="Date" />
        <TimeField value={time} onChange={handleTimeChange} ariaLabel="Time" clearable />
        {time && (
          <TimeField value={endTime} onChange={setEndTime} ariaLabel="End time" relativeTo={time} />
        )}
      </div>
      <textarea
        aria-label="Description"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />
      
      <div className="editor-row">
        <label className="editor-label category-label">
          Category
          <div className="category-select-wrap">
            <input
              ref={categoryInputRef}
              type="text"
              className={`category-input-with-chevron ${category && !isInputFocused ? 'hidden-text' : ''}`}
              aria-label="Category"
              placeholder="e.g. Work, Personal"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCategoryDropdownOpen(true);
              }}
              onFocus={() => {
                setIsInputFocused(true);
                setCategoryDropdownOpen(true);
              }}
              onBlur={() => {
                setIsInputFocused(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const trimmed = e.currentTarget.value.trim();
                  setCategory(trimmed);
                  setCategoryDropdownOpen(false);
                  submit(trimmed);
                } else if (e.key === 'Escape') {
                  setCategoryDropdownOpen(false);
                }
              }}
            />
            {category && !isInputFocused && (
              <span
                className="upcoming-type category-input-overlay"
                style={getCategoryStyle(storeCategories[category])}
              >
                {category}
              </span>
            )}
            <div className={`category-dropdown-arrow ${categoryDropdownOpen ? 'open' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6l4 4 4-4" />
              </svg>
            </div>
            {categoryDropdownOpen && categoryInputRef.current && (
              <AnchoredPopover
                anchorEl={categoryInputRef.current}
                onClose={() => setCategoryDropdownOpen(false)}
                placement="bottom-start"
                className="category-dropdown-popover"
                matchAnchorWidth={true}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {category.trim() && !existingCategories.some(cat => cat.toLowerCase() === category.trim().toLowerCase()) && (
                    <button
                      type="button"
                      role="menuitem"
                      className="category-dropdown-item create-item"
                      onClick={() => {
                        const trimmed = category.trim();
                        setCategory(trimmed);
                        setCategoryDropdownOpen(false);
                      }}
                    >
                      <span className="category-menu-check" aria-hidden="true" style={{ width: 'auto', minWidth: '24px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)', textTransform: 'uppercase' }}>new</span>
                      </span>
                      <span className="upcoming-type" style={getCategoryStyle(storeCategories[category.trim()])}>
                        {category.trim()}
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
                          setCategory(cat);
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        <span className="category-menu-check" aria-hidden="true" style={{ width: isNew ? 'auto' : undefined, minWidth: isNew ? '24px' : undefined }}>
                          {isNew ? (
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-accent)', textTransform: 'uppercase' }}>new</span>
                          ) : (
                            category.trim() === cat && (
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
                  {filteredCategories.length === 0 && !category.trim() && (
                    <div className="category-dropdown-empty">
                      Type to create a category
                    </div>
                  )}
                </div>
              </AnchoredPopover>
            )}
          </div>
        </label>
        {categoryName && (
          <button
            type="button"
            ref={categoryEditBtnRef}
            className="category-edit-btn"
            title="Edit category"
            aria-label={`Edit category ${categoryName}`}
            aria-expanded={categoryEditorOpen}
            onClick={() => setCategoryEditorOpen((o) => !o)}
          >
            <PencilIcon />
          </button>
        )}
        {categoryEditorOpen && categoryName && categoryEditBtnRef.current && (
          <AnchoredPopover
            anchorEl={categoryEditBtnRef.current}
            onClose={() => setCategoryEditorOpen(false)}
            placement="right"
          >
            <div className="category-editor">
              <CategoryEditor category={categoryName} variant="popover" />
            </div>
          </AnchoredPopover>
        )}
      </div>

      <div className="color-selector-row">
        <span className="color-label">Color</span>
        <PaletteSelector
          value={color}
          onChange={setColor}
          presets={PRESET_COLORS}
          allowCustom={true}
        />
      </div>

      <div className="color-selector-row style-row">
        <span className="color-label">Style</span>
        <CosmeticSelector value={cosmetic} onChange={setCosmetic} color={color || undefined} />
      </div>

      {isConnected && (
        <fieldset className="editor-calendars" aria-label="Calendars">
          <legend>Calendars</legend>
          {calendarGroups.map((group) => (
            <div className="editor-account-group" key={`${group.provider}:${group.account}`}>
              <div className="editor-account-header">
                <span className="editor-account-logo">
                  <ProviderLogo provider={group.provider} size={13} />
                </span>
                <span className="editor-account-email">{group.account}</span>
              </div>
              {group.calendars.map((cal) => {
                const checked = calendarUrls.includes(cal.url);
                return (
                  <label key={cal.url} className="editor-cal-row">
                    <input
                      type="checkbox"
                      className="editor-cal-input"
                      checked={checked}
                      onChange={() => toggleCalendar(cal.url)}
                    />
                    <span className={`editor-cal-check${checked ? ' checked' : ''}`} aria-hidden="true">
                      {checked && (
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                          <path
                            d="M3.5 8.5l3 3 6-7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="editor-cal-name">{cal.displayName}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      )}

      {/* Who this particular event goes to, on top of each share's own scope.
          Renders nothing until the user has actually created a share. */}
      <EventSharePicker
        eventType={category.trim() || undefined}
        shareInclude={shareOverrides.shareInclude}
        shareExclude={shareOverrides.shareExclude}
        onChange={setShareOverrides}
      />

      <div className="editor-row">
        <label className="editor-label">
          Repeats
          <select
            aria-label="Repeats"
            value={unit}
            onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
          >
            <option value="never">no</option>
            <option value="day">daily</option>
            <option value="week">weekly</option>
            <option value="month">monthly</option>
            <option value="year">yearly</option>
          </select>
        </label>
        {unit !== 'never' && (
          <label className="editor-label">
            every
            <input
              type="number"
              aria-label="Interval"
              min={1}
              value={interval}
              onChange={(e) => setIntervalValue(Number(e.target.value))}
            />
            {UNIT_LABELS[unit]}
          </label>
        )}
      </div>

      <div className="editor-reminders-section">
        <div className="editor-reminders-header">
          <span className="color-label reminders-label">
            <svg className="reminders-bell" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path
                d="M8 1.75a3.75 3.75 0 0 0-3.75 3.75c0 3.5-1.25 4.5-1.25 4.5h10s-1.25-1-1.25-4.5A3.75 3.75 0 0 0 8 1.75zM6.5 12.5a1.5 1.5 0 0 0 3 0"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Reminders
          </span>
        </div>
        <div className="reminder-pills">
          {reminders.map((r, index) => {
            const active = editingReminder === index;
            return (
              <span className={`reminder-pill${active ? ' active' : ''}`} key={index}>
                <button
                  type="button"
                  className="reminder-pill-label"
                  onClick={r.isCustom ? () => setEditingReminder(active ? null : index) : undefined}
                  disabled={!r.isCustom}
                >
                  {reminderLabel(r.value, r.unit)}
                </button>
                <button
                  type="button"
                  className="reminder-pill-remove"
                  aria-label={`Remove reminder ${index + 1}`}
                  onClick={() => removeReminder(index)}
                >
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            );
          })}

          <div className="reminder-add-wrap">
            <button
              ref={addMenuBtnRef}
              type="button"
              className="reminder-add-pill"
              aria-label="Add reminder"
              aria-expanded={addMenuOpen}
              onClick={() => setAddMenuOpen((o) => !o)}
            >
              + Add
            </button>
            {addMenuOpen && addMenuBtnRef.current && (
              <AnchoredPopover
                anchorEl={addMenuBtnRef.current}
                onClose={() => setAddMenuOpen(false)}
                placement="bottom-start"
                className="reminder-add-popover"
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {REMINDER_PRESETS.map((p) => {
                    const added = reminderKeys.has(`${p.value}-${p.unit}`);
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className="reminder-menu-item"
                        key={`${p.value}-${p.unit}`}
                        disabled={added}
                        onClick={() => addReminderPreset(p.value, p.unit)}
                      >
                        <span className="reminder-menu-check" aria-hidden="true">
                          {added && (
                            <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        {p.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="menuitem"
                    className="reminder-menu-item custom"
                    onClick={addCustomReminder}
                  >
                    <span className="reminder-menu-check" aria-hidden="true" />
                    Custom…
                  </button>
                </div>
              </AnchoredPopover>
            )}
          </div>
        </div>

        {editingReminder !== null && reminders[editingReminder]?.isCustom && (
          <div className="reminder-custom-editor">
            <input
              type="number"
              className="reminder-custom-value"
              aria-label={`Reminder ${editingReminder + 1} custom value`}
              min={0}
              value={reminders[editingReminder].value}
              autoFocus
              onChange={(e) => handleReminderCustomValueChange(editingReminder, Number(e.target.value))}
            />
            <select
              className="reminder-custom-unit"
              aria-label={`Reminder ${editingReminder + 1} custom unit`}
              value={reminders[editingReminder].unit}
              onChange={(e) => handleReminderCustomUnitChange(editingReminder, e.target.value as ReminderUnit)}
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
            <span className="reminder-custom-suffix">before</span>
            <button
              type="button"
              className="reminder-custom-done"
              onClick={() => setEditingReminder(null)}
            >
              Done
            </button>
          </div>
        )}
      </div>

      <div className="minimap-toggle-row">
        <VisibilitySwitch
          label="On map"
          checked={showOnMinimap}
          onChange={setShowOnMinimap}
          lockedBy={minimapLockedBy}
          lockReason="hides all of its events from the minimap"
          onEditCategory={() => setCategoryEditorOpen(true)}
        />
        <VisibilitySwitch
          label="In upcoming"
          checked={showInUpcoming}
          onChange={setShowInUpcoming}
          lockedBy={upcomingLockedBy}
          lockReason="hides all of its events from the Upcoming list"
          onEditCategory={() => setCategoryEditorOpen(true)}
        />
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
