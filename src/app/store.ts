import { create } from 'zustand';
import { defaultEndTime } from '../core/timeOfDay';
import { mergeCategoryReminders } from '../core/categoryReminders';
import type { CalendarEvent, EventReminder, Recurrence } from '../core/types';
import type { EventRepository } from '../data/repository';
import { useSettingsStore } from './settingsStore';
import { useConnectionStore } from './connectionStore';
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  onHistoryChange,
  record as recordHistory,
  redoStep,
  registerHistoryDomain,
  resetHistory,
  undoStep,
} from './history';

export interface NewEventInput {
  date: string;
  endDate?: string;
  type?: string;
  title: string;
  time?: string;
  endTime?: string;
  description?: string;
  recurrence?: Recurrence | null;
  color?: string;
  cosmetic?: string;
  tz?: string;
  showOnMinimap?: boolean;
  showInUpcoming?: boolean;
  calendarUrls?: string[];
  isTask?: true;
  reminders?: EventReminder[];
  shareInclude?: string[];
  shareExclude?: string[];
}

export interface EventPatch {
  title?: string;
  description?: string;
  date?: string;
  endDate?: string;
  type?: string;
  time?: string;
  endTime?: string;
  recurrence?: Recurrence | null;
  exdates?: string[];
  dayOverrides?: Record<string, import('../core/types').DayOverride>;
  color?: string;
  cosmetic?: string;
  tz?: string;
  showOnMinimap?: boolean;
  showInUpcoming?: boolean;
  calendarUrls?: string[];
  isTask?: true;
  reminders?: EventReminder[];
  shareInclude?: string[];
  shareExclude?: string[];
}

interface CalendarState {
  events: CalendarEvent[];
  toast: string | null;
  ready: boolean;
  canUndo: boolean;
  canRedo: boolean;
  init(repo: EventRepository): Promise<void>;
  addEvent(input: NewEventInput): Promise<void>;
  updateEvent(id: string, patch: EventPatch): Promise<void>;
  updateEvents(ids: string[], patch: EventPatch): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  deleteEvents(ids: string[]): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  notify(message: string): void;
  dismissToast(): void;
  addEventInMemory(event: CalendarEvent): void;
  updateEventInMemory(id: string, patch: EventPatch): void;
  renameCategory(oldName: string, newName: string): Promise<void>;
  /** Retroactively apply a category-reminder change to that category's events:
   *  `added` reminders are merged in (deduped), `removed` ones taken out.
   *  Events that end up unchanged keep their updatedAt. */
  syncCategoryReminders(
    category: string,
    added: EventReminder[],
    removed: EventReminder[],
  ): Promise<void>;
  commitCurrentState(): Promise<void>;
  /** Re-load events from the repository (e.g. another device's changes on focus).
   *  Resets the undo baseline to the loaded state. */
  refresh(): Promise<void>;
  /** Seed an empty backend with the given events (first Cloud activation). Does
   *  not record an undo step. */
  seedFrom(events: CalendarEvent[]): Promise<void>;
}

let repository: EventRepository | null = null;

// Startup fires two inits: a provisional local-only one for the first paint and
// the full reconciling repository right behind it (see App). Later account or
// subscription changes fire more. Each call takes a ticket; a pass whose read
// finishes after a newer pass has already applied is dropped, so a slow local
// read can never overwrite the reconciled result.
let initTicket = 0;
let appliedInitTicket = 0;

// Undo/redo is tracked at the persistence boundary: each recorded step is a full
// snapshot of the events as they were last saved. Snapshots are the immutable
// arrays already produced by every mutation, so storing references is safe.
// The stacks themselves live in ./history, shared with day styling so one Ctrl+Z
// always takes back the most recent change whichever store made it.
const EVENTS_DOMAIN = 'events';
let lastPersisted: CalendarEvent[] = [];

/** The category's default reminders, if it has any configured. */
function categoryReminders(type: string | undefined): EventReminder[] | undefined {
  return type ? useSettingsStore.getState().categories[type]?.reminders : undefined;
}

/**
 * When a patch moves an event into a category that has default reminders and
 * doesn't bring its own reminder list (the event form always does — its list
 * is authoritative, including deliberate removals), fold the category's
 * reminders into the patch. The previous category is read from the last
 * persisted snapshot because live editing may already have applied the new
 * type to the in-memory event.
 */
function withCategoryReminders(e: CalendarEvent, patch: EventPatch): EventPatch {
  if (patch.type === undefined || patch.reminders !== undefined) return patch;
  if (lastPersisted.find((p) => p.id === e.id)?.type === patch.type) return patch;
  const merged = mergeCategoryReminders(e.reminders, categoryReminders(patch.type));
  return merged === e.reminders ? patch : { ...patch, reminders: merged };
}

export const useCalendarStore = create<CalendarState>((set, get) => {
  /**
   * Optimistically sets state, persists, rolls back + toasts on failure.
   * When `record` is true a successful save pushes the previously persisted
   * snapshot onto the undo stack (and clears the redo stack), so the change can
   * be reverted. Undo/redo themselves replay snapshots with `record: false`.
   * Returns whether the save succeeded.
   */
  async function save(events: CalendarEvent[], record = true): Promise<boolean> {
    const previous = get().events;
    set({ events });
    try {
      await repository?.saveAll(events);
      if (record) recordHistory(EVENTS_DOMAIN, lastPersisted);
      lastPersisted = events;
      set({ canUndo: historyCanUndo(), canRedo: historyCanRedo() });
      return true;
    } catch (err) {
      console.error('Save failed:', err);
      set({ events: previous, toast: `Saving failed — ${(err as Error).message}` });
      return false;
    }
  }

  const persist = (events: CalendarEvent[]) => save(events);

  // Undo/redo of an events step replays a snapshot through the same save path,
  // without recording a step of its own.
  registerHistoryDomain<CalendarEvent[]>(EVENTS_DOMAIN, {
    read: () => lastPersisted,
    apply: (snapshot) => save(snapshot, false),
  });

  // Any store's push/undo/redo refreshes the shared flags.
  onHistoryChange(() => set({ canUndo: historyCanUndo(), canRedo: historyCanRedo() }));

  return {
    events: [],
    toast: null,
    ready: false,
    canUndo: false,
    canRedo: false,

    async init(repo) {
      const ticket = ++initTicket;
      repository = repo;
      const { events, warning } = await repo.load();
      // Superseded: a later init already applied its result. Drop this one
      // rather than rewinding the store to an older snapshot.
      if (ticket < appliedInitTicket) return;
      appliedInitTicket = ticket;
      repository = repo;
      // A fresh load is a clean slate — history from a previous account/repo no
      // longer applies.
      resetHistory();
      lastPersisted = events;
      set({ events, ready: true, toast: warning ?? null, canUndo: false, canRedo: false });
    },

    async addEvent(input) {
      if (input.isTask) {
        const ts = new Date().toISOString();
        const task: CalendarEvent = {
          id: crypto.randomUUID(),
          title: input.title,
          date: '',
          isTask: true,
          type: input.type,
          description: input.description,
          recurrence: null,
          color: input.color,
          cosmetic: input.cosmetic,
          createdAt: ts,
          updatedAt: ts,
        };
        await persist([...get().events, task]);
        return;
      }
      const now = new Date().toISOString();
      const conn = useConnectionStore.getState();
      // New events go to the explicitly chosen calendars, else the user's
      // configured default write targets (only relevant when connected).
      const defaults = conn.isConnected() ? conn.defaultCalendarUrls() : [];
      const calendarUrls = input.calendarUrls ?? (defaults.length > 0 ? defaults : undefined);

      const event: CalendarEvent = {
        id: crypto.randomUUID(),
        title: input.title,
        date: input.date,
        endDate: input.endDate,
        type: input.type,
        time: input.time,
        // Timed events always get an end; 1 hour unless the caller chose one.
        endTime: input.time ? input.endTime ?? defaultEndTime(input.time) : undefined,
        // Timed events anchor to a timezone (the one set when created) so they
        // can be converted when the display timezone changes. All-day events
        // stay floating.
        tz: input.time ? input.tz ?? useSettingsStore.getState().displayTimeZone : undefined,
        description: input.description,
        recurrence: input.recurrence ?? null,
        color: input.color,
        cosmetic: input.cosmetic,
        showOnMinimap: input.showOnMinimap,
        showInUpcoming: input.showInUpcoming,
        calendarUrls,
        reminders: mergeCategoryReminders(input.reminders, categoryReminders(input.type)),
        shareInclude: input.shareInclude,
        shareExclude: input.shareExclude,
        createdAt: now,
        updatedAt: now,
      };
      await persist([...get().events, event]);
    },

    async updateEvent(id, patch) {
      await persist(
        get().events.map((e) =>
          e.id === id ? { ...e, ...withCategoryReminders(e, patch), updatedAt: new Date().toISOString() } : e,
        ),
      );
    },

    async updateEvents(ids, patch) {
      const now = new Date().toISOString();
      await persist(
        get().events.map((e) =>
          ids.includes(e.id) ? { ...e, ...withCategoryReminders(e, patch), updatedAt: now } : e,
        ),
      );
    },

    async deleteEvent(id) {
      await persist(get().events.filter((e) => e.id !== id));
    },

    async deleteEvents(ids) {
      const remove = new Set(ids);
      await persist(get().events.filter((e) => !remove.has(e.id)));
    },

    async undo() {
      if (!historyCanUndo()) {
        set({ toast: 'Nothing to undo' });
        return;
      }
      // The step may belong to any registered store; history restores the
      // stacks itself if applying failed.
      if (await undoStep()) set({ toast: 'Undid last change' });
      set({ canUndo: historyCanUndo(), canRedo: historyCanRedo() });
    },

    async redo() {
      if (!historyCanRedo()) {
        set({ toast: 'Nothing to redo' });
        return;
      }
      if (await redoStep()) set({ toast: 'Redid change' });
      set({ canUndo: historyCanUndo(), canRedo: historyCanRedo() });
    },

    addEventInMemory(event) {
      set({ events: [...get().events, event] });
    },

    updateEventInMemory(id, patch) {
      set({
        events: get().events.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
        ),
      });
    },

    async syncCategoryReminders(category, added, removed) {
      const removedKeys = new Set(removed.map((r) => `${r.value}-${r.unit}`));
      const now = new Date().toISOString();
      let changed = false;
      const next = get().events.map((e) => {
        if (e.type !== category || e.isTask) return e;
        const before = e.reminders ?? [];
        const kept = before.filter((r) => !removedKeys.has(`${r.value}-${r.unit}`));
        const merged = mergeCategoryReminders(kept, added) ?? kept;
        // merge returns its input untouched when every `added` is present.
        if (kept.length === before.length && merged === kept) return e;
        changed = true;
        return { ...e, reminders: merged.length > 0 ? merged : undefined, updatedAt: now };
      });
      if (changed) await persist(next);
    },

    async renameCategory(oldName, newName) {
      const trimmedOld = oldName.trim();
      const trimmedNew = newName.trim();
      if (!trimmedNew) return;
      await persist(
        get().events.map((e) =>
          e.type === trimmedOld ? { ...e, type: trimmedNew, updatedAt: new Date().toISOString() } : e,
        ),
      );
    },

    async commitCurrentState() {
      await persist(get().events);
    },

    async refresh() {
      if (!repository) return;
      const { events } = await repository.load();
      const sig = (l: CalendarEvent[]) => l.map((e) => `${e.id}:${e.updatedAt}`).sort().join('|');
      if (sig(events) === sig(get().events)) return;
      resetHistory();
      lastPersisted = events;
      set({ events, canUndo: false, canRedo: false });
    },

    async seedFrom(events) {
      set({ events });
      await save(events, false);
      resetHistory();
      set({ canUndo: false, canRedo: false });
    },

    notify(message) {
      set({ toast: message });
    },

    dismissToast() {
      set({ toast: null });
    },
  };
});
