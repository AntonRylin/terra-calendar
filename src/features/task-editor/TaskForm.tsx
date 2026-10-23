import { useMemo, useState } from 'react';
import { PaletteSelector } from '../../ui/PaletteSelector';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
import { DateField } from '../../ui/DateField';
import { useIsMobile } from '../../ui/useMediaQuery';
import { SheetHeader, SheetRow } from '../../ui/SheetParts';
import { CalendarIcon, NotesIcon, PaletteIcon, SparkleIcon, TagIcon } from '../../ui/sheetIcons';
import { PhoneCategoryField } from '../event-editor/PhoneCategoryField';
import { useCalendarStore } from '../../app/store';
import { useSettingsStore } from '../../app/settingsStore';
import '../event-editor/eventEditor.css';

export interface TaskFormValues {
  title: string;
  description?: string;
  type?: string;
  color?: string;
  cosmetic?: string;
  /** When set, the caller promotes the task into a dated event. */
  date?: string;
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

interface Props {
  initial: TaskFormValues;
  submitLabel: string;
  onSubmit(values: TaskFormValues): void;
  onDelete?(): void;
  /** Focus the date field on open (used by "Set date…"). */
  focusDate?: boolean;
}

/** Minimal form for a dateless task. Setting the date promotes it to an event. */
export function TaskForm({ initial, submitLabel, onSubmit, onDelete, focusDate }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? '');
  const [category, setCategory] = useState(initial.type ?? '');
  const [color, setColor] = useState(initial.color ?? '');
  const [cosmetic, setCosmetic] = useState(initial.cosmetic ?? '');
  const [date, setDate] = useState(initial.date ?? '');
  const canSave = title.trim().length > 0;
  const isMobile = useIsMobile();
  const events = useCalendarStore((s) => s.events);
  const storeCategories = useSettingsStore((s) => s.categories);
  const categories = useMemo(() => {
    const set = new Set<string>(Object.keys(storeCategories));
    events.forEach((e) => e.type && set.add(e.type));
    return Array.from(set).sort();
  }, [events, storeCategories]);

  function submit() {
    if (!canSave) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      type: category.trim() || undefined,
      color: color || undefined,
      cosmetic: cosmetic || undefined,
      date: date || undefined,
    });
  }

  // Phones: the same sheet layout as the event editor.
  if (isMobile) {
    return (
      <div className="event-editor event-editor--phone">
        <SheetHeader
          title={onDelete ? 'Edit task' : 'New task'}
          action={{ label: 'Save', onClick: submit, disabled: !canSave }}
        />
        <input
          className="editor-title ee-title"
          aria-label="Title"
          placeholder="Add task"
          value={title}
          enterKeyHint="done"
          autoFocus={!focusDate}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <div className="sheet-divider" />
        <SheetRow icon={<CalendarIcon />}>
          <div className="ee-when">
            <DateField value={date} onChange={setDate} ariaLabel="Date" clearable />
          </div>
        </SheetRow>
        <p className="ee-hint">Setting a date turns this task into a calendar event.</p>
        <SheetRow icon={<TagIcon />}>
          <PhoneCategoryField value={category} onChange={setCategory} categories={categories} />
        </SheetRow>
        <SheetRow icon={<PaletteIcon />} className="ee-swatch-row">
          <div className="ee-swatch-scroll" aria-label="Color">
            <PaletteSelector value={color} onChange={setColor} presets={PRESET_COLORS} allowCustom={true} />
          </div>
        </SheetRow>
        <SheetRow icon={<SparkleIcon />} className="ee-swatch-row">
          <div className="ee-swatch-scroll" aria-label="Style">
            <CosmeticSelector value={cosmetic} onChange={setCosmetic} color={color || undefined} />
          </div>
        </SheetRow>
        <div className="sheet-divider" />
        <SheetRow icon={<NotesIcon />} align="start">
          <textarea
            className="ee-notes"
            aria-label="Description"
            placeholder="Add description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </SheetRow>
        {onDelete && (
          <div className="ee-delete-row">
            <button type="button" className="sheet-text-btn is-danger" onClick={onDelete}>
              Delete task
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="event-editor">
      <input
        className="editor-title"
        aria-label="Title"
        placeholder="Task"
        value={title}
        autoFocus={!focusDate}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      <textarea
        aria-label="Description"
        placeholder="Description"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="editor-row">
        <label className="editor-label" style={{ width: '100%' }}>
          Category
          <input
            type="text"
            aria-label="Category"
            placeholder="e.g. Work, Personal"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
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
      <div className="editor-row">
        <label className="editor-label" style={{ width: '100%' }}>
          Set date (turns this task into a calendar event)
          <DateField
            value={date}
            onChange={setDate}
            ariaLabel="Date"
            autoFocus={focusDate}
            clearable
          />
        </label>
      </div>
      <div className="editor-actions">
        {onDelete ? (
          <button className="editor-delete tb tb-text" onClick={onDelete}>Delete</button>
        ) : (
          <span />
        )}
        <button className="editor-save tb tb-text tb-primary" onClick={submit} disabled={!canSave}>{submitLabel}</button>
      </div>
    </div>
  );
}
