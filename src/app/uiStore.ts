import { create } from 'zustand';
import { todayISO } from '../core/dates';

export interface QuickEntryTarget {
  date: string;
  anchorEl: Element;
  /** Prefilled start/end for a slot picked in the week view. A time typed in
   *  the entry text still wins over these. */
  time?: string;
  endTime?: string;
  value?: string;
}

export interface EditorTarget {
  eventId: string;
  anchorEl: Element;
  occurrenceDate?: string;
}

/** The multi-day span modal. `eventId` present = editing an existing span;
 *  absent = creating a new one from a drag-selected range. */
export interface SpanEditorTarget {
  eventId?: string;
  start: string;
  end: string;
  anchorEl: Element;
}

/** Per-day flow for one day of a span: first a chooser ("This day" / "Whole
 *  holiday"), then — if "This day" — the per-day editor. */
export interface SpanDayTarget {
  eventId: string;
  date: string;
  anchorEl: Element;
  mode: 'choose' | 'edit';
}

export interface SpecialDayEditorTarget {
  date: string;
  anchorEl: Element;
}

export interface CategoryEditorTarget {
  category: string;
  anchorEl: Element;
}

export interface DayBackgroundTarget {
  date: string;
}

export interface CreateTarget {
  anchorEl: Element;
  eventId: string;
}

export interface TaskEditorTarget {
  anchorEl: Element;
  /** null = create a new task; an id = edit that task. */
  eventId: string | null;
  /** Focus the date field (used by "Set date…"). */
  focusDate?: boolean;
}

interface UiState {
  quickEntry: QuickEntryTarget | null;
  editor: EditorTarget | null;
  /** Manual "add event" popover, anchored to the trigger (e.g. Upcoming's +). */
  create: CreateTarget | null;
  /** Create/edit popover for a dateless task. */
  taskEditor: TaskEditorTarget | null;
  /** Multi-day span create/edit modal. */
  span: SpanEditorTarget | null;
  /** Per-day chooser/editor for one day of a span. */
  spanDay: SpanDayTarget | null;
  specialDayEditor: SpecialDayEditorTarget | null;
  categoryEditor: CategoryEditorTarget | null;
  dayBackground: DayBackgroundTarget | null;
  highlightedEvent: { id: string; date: string } | null;
  /** Representative date of the week at the top of the calendar viewport. */
  viewedDate: string | null;
  selectedDate: string;
  /** The day the pointer is over in the calendar, mirrored by the minimap. */
  hoveredDate: string | null;
  /** First of the seven days Week view is showing — it rolls, so this is not
   *  always a Monday. null whenever Week view isn't on screen. */
  weekWindowStart: string | null;
  /** One-shot date to center when opening Week from a day tile. */
  weekFocusDate: string | null;
  /** Selected habit tab id in the month-grid switcher; null = Events (session-only). */
  activeHabitTab: string | null;
  openQuickEntry(date: string, anchorEl: Element, slot?: { time?: string; endTime?: string }): void;
  openEditor(eventId: string, anchorEl: Element, occurrenceDate?: string): void;
  openCreate(anchorEl: Element): void;
  openTaskCreate(anchorEl: Element): void;
  openTaskEdit(eventId: string, anchorEl: Element, focusDate?: boolean): void;
  openSpanCreate(start: string, end: string, anchorEl: Element): void;
  openSpanEdit(eventId: string, start: string, end: string, anchorEl: Element): void;
  openSpanDayChooser(eventId: string, date: string, anchorEl: Element): void;
  openSpanDayEdit(eventId: string, date: string, anchorEl: Element): void;
  openSpecialDayEditor(date: string, anchorEl: Element): void;
  openCategoryEditor(category: string, anchorEl: Element): void;
  openDayBackground(date: string): void;
  setHighlightedEvent(highlighted: { id: string; date: string } | null): void;
  closeOverlays(): void;
  setViewedDate(date: string): void;
  setSelectedDate(date: string): void;
  setHoveredDate(date: string | null): void;
  setWeekWindowStart(date: string | null): void;
  setActiveHabitTab(tabId: string | null): void;
}

export const useUiStore = create<UiState>((set) => ({
  quickEntry: null,
  editor: null,
  create: null,
  taskEditor: null,
  span: null,
  spanDay: null,
  specialDayEditor: null,
  categoryEditor: null,
  dayBackground: null,
  highlightedEvent: null,
  viewedDate: null,
  selectedDate: todayISO(),
  hoveredDate: null,
  weekWindowStart: null,
  weekFocusDate: null,
  activeHabitTab: null,
  openQuickEntry: (date, anchorEl, slot) => set({ quickEntry: { date, anchorEl, ...slot }, taskEditor: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openEditor: (eventId, anchorEl, occurrenceDate) => set({ editor: { eventId, anchorEl, occurrenceDate }, taskEditor: null, quickEntry: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null }),
  openCreate: (anchorEl) => set({ create: { anchorEl, eventId: crypto.randomUUID() }, taskEditor: null, quickEntry: null, editor: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openTaskCreate: (anchorEl) => set({ taskEditor: { anchorEl, eventId: null }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openTaskEdit: (eventId, anchorEl, focusDate) => set({ taskEditor: { anchorEl, eventId, focusDate }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openSpanCreate: (start, end, anchorEl) => set({ span: { start, end, anchorEl }, quickEntry: null, editor: null, create: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openSpanEdit: (eventId, start, end, anchorEl) => set({ span: { eventId, start, end, anchorEl }, quickEntry: null, editor: null, create: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null }),
  openSpanDayChooser: (eventId, date, anchorEl) => set({ spanDay: { eventId, date, anchorEl, mode: 'choose' }, quickEntry: null, editor: null, create: null, span: null, specialDayEditor: null, categoryEditor: null, dayBackground: null }),
  openSpanDayEdit: (eventId, date, anchorEl) => set({ spanDay: { eventId, date, anchorEl, mode: 'edit' }, quickEntry: null, editor: null, create: null, span: null, specialDayEditor: null, categoryEditor: null, dayBackground: null }),
  openSpecialDayEditor: (date, anchorEl) => set({ specialDayEditor: { date, anchorEl }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openCategoryEditor: (category, anchorEl) => set({ categoryEditor: { category, anchorEl }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, dayBackground: null, highlightedEvent: null }),
  setHighlightedEvent: (highlighted) =>
    set(() => {
      const nextState: Partial<UiState> = { highlightedEvent: highlighted };
      if (highlighted) {
        nextState.selectedDate = highlighted.date;
      }
      return nextState;
    }),
  openDayBackground: (date) => set({ dayBackground: { date }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, highlightedEvent: null }),
  closeOverlays: () => set({ quickEntry: null, editor: null, create: null, taskEditor: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  setViewedDate: (date) => set({ viewedDate: date }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  // Set on every day the pointer crosses in the grid, so it skips no-op writes.
  setHoveredDate: (date) => set((s) => (s.hoveredDate === date ? s : { hoveredDate: date })),
  setWeekWindowStart: (date) =>
    set((s) => (s.weekWindowStart === date ? s : { weekWindowStart: date })),
  setActiveHabitTab: (activeHabitTab) => set({ activeHabitTab }),
}));
