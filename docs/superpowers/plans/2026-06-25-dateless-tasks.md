# Dateless Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click empty space in the Upcoming panel to create an event or a *task* (an event with no date) that lives in a dedicated "Tasks" section, never syncs to iCloud/Google, and promotes to a real event when given a date.

**Architecture:** A task is a `CalendarEvent` with `isTask: true` and `date: ''` (approach A). A single guard in `expandOccurrences` (return `[]` for a task) plus the existing `isSpan(e) === false` keeps tasks out of every date-based view. A `TaskAwareRepository` decorator keeps tasks in a local `tasks.json` when the backend can't sync them (CalDAV / local file) and passes them through when it can (Supabase, via a `handlesTasks` flag). Creation/edit use a small dedicated `TaskForm` (the shared `EventForm` hard-requires a date); setting a date in it promotes the task.

**Tech Stack:** React 18, Zustand, TypeScript, Tauri FS / localStorage, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/core/types.ts` — add `isTask?: true`.
- **Create** `src/core/tasks.ts` — `isTaskEvent` predicate. **Test** `src/core/tasks.test.ts`.
- **Modify** `src/core/occurrences.ts` — `expandOccurrences` returns `[]` for tasks (the single exclusion choke point).
- **Modify** `src/features/upcoming-stack/upcoming.ts` — add `buildTasks`. **Test** `src/features/upcoming-stack/upcoming.test.ts`.
- **Modify** `src/app/store.ts` — `NewEventInput.isTask` / `EventPatch.isTask`; `addEvent` task branch. **Test** in `src/app/store.test.ts`.
- **Modify** `src/data/repository.ts` — add optional `handlesTasks`.
- **Modify** `src/data/supabaseRepository.ts` — `handlesTasks = true`.
- **Create** `src/data/taskStore.ts` — local task persistence (Tauri file + localStorage).
- **Create** `src/data/taskAwareRepository.ts` — the decorator. **Test** `src/data/taskAwareRepository.test.ts`.
- **Modify** `src/data/createRepository.ts` — wrap repos with `TaskAwareRepository`.
- **Create** `src/features/task-editor/TaskForm.tsx` — minimal task form.
- **Create** `src/features/task-editor/TaskEditorHost.tsx` — create/edit popover host.
- **Modify** `src/app/uiStore.ts` — `taskEditor` target + open/close.
- **Modify** `src/App.tsx` — mount `<TaskEditorHost />`.
- **Modify** `src/features/upcoming-stack/UpcomingStack.tsx` — empty-space context menu + Tasks section.

---

## Task 1: `isTask` field + predicate + occurrence guard

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/tasks.ts`
- Modify: `src/core/occurrences.ts`
- Test: `src/core/tasks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/tasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isTaskEvent } from './tasks';
import { expandOccurrences } from './occurrences';
import { isSpan } from './spans';
import type { CalendarEvent } from './types';

const task: CalendarEvent = {
  id: 't1', title: 'Buy milk', date: '', isTask: true, recurrence: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const event: CalendarEvent = {
  id: 'e1', title: 'Dentist', date: '2026-02-10', recurrence: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

describe('tasks', () => {
  it('isTaskEvent is true only for tasks', () => {
    expect(isTaskEvent(task)).toBe(true);
    expect(isTaskEvent(event)).toBe(false);
  });

  it('a task has no occurrences and is not a span', () => {
    expect(expandOccurrences(task, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(isSpan(task)).toBe(false);
  });

  it('a normal event still expands', () => {
    expect(expandOccurrences(event, '2026-01-01', '2026-12-31')).toEqual(['2026-02-10']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/tasks.test.ts`
Expected: FAIL — `./tasks` does not exist.

- [ ] **Step 3: Add the field** in `src/core/types.ts`

Inside the `CalendarEvent` interface, after the `cosmetic?: string;` line, add:

```ts
  /** True for a dateless "task". Tasks carry date: '' and are excluded from all
   *  date-based views and from CalDAV sync. Absent on normal events. */
  isTask?: true;
```

- [ ] **Step 4: Create `src/core/tasks.ts`**

```ts
import type { CalendarEvent } from './types';

/** A "task" is a dateless event (date: '', isTask: true). It never appears in
 *  date-based views and is never synced to a calendar. */
export function isTaskEvent(event: Pick<CalendarEvent, 'isTask'>): boolean {
  return event.isTask === true;
}
```

- [ ] **Step 5: Guard `expandOccurrences`** in `src/core/occurrences.ts`

Add the import at the top:

```ts
import { isTaskEvent } from './tasks';
```

Then, as the very first line inside `expandOccurrences` (before `if (rangeEnd < rangeStart)`):

```ts
  // Dateless tasks never occur on any day — this single guard keeps them out of
  // the month grid, minimap dots, and the upcoming list at once.
  if (isTaskEvent(event)) return [];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/core/tasks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/tasks.ts src/core/occurrences.ts src/core/tasks.test.ts
git commit -m "feat(tasks): isTask field, predicate, and occurrence exclusion"
```

---

## Task 2: `buildTasks` for the Tasks section

**Files:**
- Modify: `src/features/upcoming-stack/upcoming.ts`
- Test: `src/features/upcoming-stack/upcoming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/upcoming-stack/upcoming.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTasks, buildUpcoming, buildOngoing } from './upcoming';
import type { CalendarEvent } from '../../core/types';

const base = { recurrence: null, createdAt: '2026-01-01T00:00:00Z' };
const taskA: CalendarEvent = { ...base, id: 'a', title: 'A', date: '', isTask: true, updatedAt: '2026-01-02T00:00:00Z' };
const taskB: CalendarEvent = { ...base, id: 'b', title: 'B', date: '', isTask: true, updatedAt: '2026-01-05T00:00:00Z' };
const ev: CalendarEvent = { ...base, id: 'e', title: 'E', date: '2026-06-01', updatedAt: '2026-01-01T00:00:00Z' };

describe('buildTasks', () => {
  it('returns only tasks, most-recently-edited first', () => {
    expect(buildTasks([taskA, ev, taskB]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('tasks never appear in the dated upcoming or ongoing lists', () => {
    expect(buildUpcoming([taskA, ev], '2026-01-01', 'UTC').some((i) => i.event.isTask)).toBe(false);
    expect(buildOngoing([taskA, ev], '2026-01-01').some((i) => i.event.isTask)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/upcoming-stack/upcoming.test.ts`
Expected: FAIL — `buildTasks` is not exported.

- [ ] **Step 3: Add `buildTasks`** in `src/features/upcoming-stack/upcoming.ts`

Add the import at the top (after the existing `import type { CalendarEvent } ...`):

```ts
import { isTaskEvent } from '../../core/tasks';
```

Add this function directly after `buildOngoing`:

```ts
/** Dateless tasks, most-recently-edited first (there is no date to sort on).
 *  Shown in the Upcoming panel's dedicated "Tasks" section. */
export function buildTasks(events: CalendarEvent[]): CalendarEvent[] {
  return events
    .filter(isTaskEvent)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/upcoming-stack/upcoming.test.ts`
Expected: PASS (2 tests). (Exclusion passes because Task 1's guard makes tasks yield no occurrences, and `isSpan` is false for tasks.)

- [ ] **Step 5: Commit**

```bash
git add src/features/upcoming-stack/upcoming.ts src/features/upcoming-stack/upcoming.test.ts
git commit -m "feat(tasks): buildTasks for the Tasks section"
```

---

## Task 3: `addEvent` task branch

**Files:**
- Modify: `src/app/store.ts`
- Test: `src/app/store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/app/store.test.ts` (inside the existing top-level `describe`; if the file imports differ, match its existing setup — it already constructs the store with a repository):

```ts
  it('addEvent with isTask creates a dateless, calendar-less task', async () => {
    await useCalendarStore.getState().addEvent({ title: 'Buy milk', isTask: true });
    const task = useCalendarStore.getState().events.find((e) => e.title === 'Buy milk');
    expect(task).toBeTruthy();
    expect(task!.isTask).toBe(true);
    expect(task!.date).toBe('');
    expect(task!.calendarUrls).toBeUndefined();
    expect(task!.recurrence).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/store.test.ts`
Expected: FAIL — `isTask` is not accepted by `addEvent` / not set on the event.

- [ ] **Step 3: Add `isTask` to the input/patch types** in `src/app/store.ts`

In `NewEventInput`, after `cosmetic?: string;`, add:

```ts
  isTask?: true;
```

In `EventPatch`, after `cosmetic?: string;`, add:

```ts
  isTask?: true;
  date?: string;
```

(`date?` may already be present in `EventPatch` — if so, leave it; do not duplicate.)

- [ ] **Step 4: Branch `addEvent`** in `src/app/store.ts`

At the very start of the `addEvent` method body (before `const now = ...`), add:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/store.test.ts`
Expected: PASS (all prior store tests + the new one).

- [ ] **Step 6: Commit**

```bash
git add src/app/store.ts src/app/store.test.ts
git commit -m "feat(tasks): addEvent creates dateless tasks"
```

---

## Task 4: Repository `handlesTasks` capability

**Files:**
- Modify: `src/data/repository.ts`
- Modify: `src/data/supabaseRepository.ts`

- [ ] **Step 1: Add the optional flag** in `src/data/repository.ts`

Inside the `EventRepository` interface, after `saveAll(...)`, add:

```ts
  /** True if this backend can persist dateless tasks itself (Supabase). When
   *  false/absent (CalDAV, local JSON file), tasks are kept in a local store. */
  handlesTasks?: boolean;
```

- [ ] **Step 2: Mark Supabase as task-capable** in `src/data/supabaseRepository.ts`

Inside the `SupabaseRepository` class, add as the first class member (above `async load()`):

```ts
  readonly handlesTasks = true;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/data/repository.ts src/data/supabaseRepository.ts
git commit -m "feat(tasks): handlesTasks repository capability"
```

---

## Task 5: Local task store

**Files:**
- Create: `src/data/taskStore.ts`

(No automated test: this is Tauri-FS / localStorage I/O, mirroring `jsonFileRepository.ts` / `settingsFile.ts`, which are likewise not unit-tested. Its consumer — the decorator in Task 6 — is tested with this module mocked.)

- [ ] **Step 1: Create `src/data/taskStore.ts`**

```ts
import type { CalendarEvent } from '../core/types';

// Local-only persistence for dateless tasks. On desktop, a tasks.json next to
// events.json in the app-data dir; on the web build, localStorage. Used by
// TaskAwareRepository when the active backend can't sync tasks (CalDAV/local).
const FILE = 'tasks.json';
const LS_KEY = 'open-calendar.tasks';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function loadTasks(): Promise<CalendarEvent[]> {
  if (isTauri()) {
    try {
      const { BaseDirectory, exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      const opts = { baseDir: BaseDirectory.AppData };
      if (!(await exists(FILE, opts))) return [];
      const parsed = JSON.parse(await readTextFile(FILE, opts));
      return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
    } catch {
      return [];
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: CalendarEvent[]): Promise<void> {
  const json = JSON.stringify(tasks);
  if (isTauri()) {
    try {
      const { BaseDirectory, exists, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
      const opts = { baseDir: BaseDirectory.AppData };
      if (!(await exists('', opts))) await mkdir('', { ...opts, recursive: true });
      await writeTextFile(FILE, json, opts);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    // ignore — best effort
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/taskStore.ts
git commit -m "feat(tasks): local task store (tasks.json / localStorage)"
```

---

## Task 6: `TaskAwareRepository` decorator

**Files:**
- Create: `src/data/taskAwareRepository.ts`
- Test: `src/data/taskAwareRepository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/taskAwareRepository.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '../core/types';
import type { EventRepository } from './repository';

const loadTasks = vi.fn();
const saveTasks = vi.fn(async () => {});
vi.mock('./taskStore', () => ({
  loadTasks: () => loadTasks(),
  saveTasks: (t: CalendarEvent[]) => saveTasks(t),
}));

import { TaskAwareRepository } from './taskAwareRepository';

const ev: CalendarEvent = { id: 'e', title: 'E', date: '2026-06-01', recurrence: null, createdAt: '', updatedAt: '' };
const task: CalendarEvent = { id: 't', title: 'T', date: '', isTask: true, recurrence: null, createdAt: '', updatedAt: '' };

function fakeInner(handlesTasks = false): EventRepository & { saved: CalendarEvent[] } {
  return {
    handlesTasks,
    saved: [],
    async load() { return { events: [ev] }; },
    async saveAll(events) { (this as { saved: CalendarEvent[] }).saved = events; },
  };
}

describe('TaskAwareRepository', () => {
  beforeEach(() => {
    loadTasks.mockReset();
    saveTasks.mockClear();
  });

  it('merges local tasks into load() when the backend cannot sync them', async () => {
    loadTasks.mockResolvedValue([task]);
    const repo = new TaskAwareRepository(fakeInner(false));
    const { events } = await repo.load();
    expect(events.map((e) => e.id).sort()).toEqual(['e', 't']);
  });

  it('routes tasks to the local store and the rest to the inner repo on save', async () => {
    const inner = fakeInner(false);
    const repo = new TaskAwareRepository(inner);
    await repo.saveAll([ev, task]);
    expect(saveTasks).toHaveBeenCalledWith([task]);
    expect(inner.saved.map((e) => e.id)).toEqual(['e']);
  });

  it('passes everything through when the backend handles tasks', async () => {
    loadTasks.mockResolvedValue([{ id: 'should-not-be-used' } as CalendarEvent]);
    const inner = fakeInner(true);
    const repo = new TaskAwareRepository(inner);
    await repo.saveAll([ev, task]);
    expect(saveTasks).not.toHaveBeenCalled();
    expect(inner.saved.map((e) => e.id)).toEqual(['e', 't']);
    const { events } = await repo.load();
    expect(events.map((e) => e.id)).toEqual(['e']); // no local tasks merged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/taskAwareRepository.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/data/taskAwareRepository.ts`**

```ts
import type { EventRepository, LoadResult } from './repository';
import type { CalendarEvent } from '../core/types';
import { isTaskEvent } from '../core/tasks';
import { loadTasks, saveTasks } from './taskStore';

/**
 * Wraps a repository so dateless tasks persist locally when the underlying
 * backend can't sync them (CalDAV / local file). When the underlying repo
 * `handlesTasks` (Supabase), tasks pass straight through. Promotion falls out
 * for free: once a task gets a date it's no longer a task, so the next saveAll
 * routes it to the inner repo and drops it from the local store.
 */
export class TaskAwareRepository implements EventRepository {
  constructor(private readonly inner: EventRepository) {}

  async load(): Promise<LoadResult> {
    const result = await this.inner.load();
    if (this.inner.handlesTasks) return result;
    const tasks = await loadTasks();
    return { ...result, events: [...result.events, ...tasks] };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    if (this.inner.handlesTasks) {
      await this.inner.saveAll(events);
      return;
    }
    await saveTasks(events.filter(isTaskEvent));
    await this.inner.saveAll(events.filter((e) => !isTaskEvent(e)));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/taskAwareRepository.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/taskAwareRepository.ts src/data/taskAwareRepository.test.ts
git commit -m "feat(tasks): TaskAwareRepository decorator"
```

---

## Task 7: Wire the decorator into repository selection

**Files:**
- Modify: `src/data/createRepository.ts`

- [ ] **Step 1: Import the decorator**

At the top of `src/data/createRepository.ts`, add:

```ts
import { TaskAwareRepository } from './taskAwareRepository';
```

- [ ] **Step 2: Wrap every returned repository**

In `createRepository`, change the body to wrap both returns:

```ts
export function createRepository(): EventRepository {
  if (getBackend() === 'supabase') return new TaskAwareRepository(new SupabaseRepository());
  return new TaskAwareRepository(isTauri() ? new JsonFileRepository() : new HttpRepository());
}
```

In `createRepositoryAsync`, wrap each `return` that yields a repository:
- `return new SupabaseRepository();` → `return new TaskAwareRepository(new SupabaseRepository());`
- `return new CompositeRepository(accounts, () => useConnectionStore.getState().defaultCalendarUrls());` → wrap: `return new TaskAwareRepository(new CompositeRepository(accounts, () => useConnectionStore.getState().defaultCalendarUrls()));`
- the final `return isTauri() ? new JsonFileRepository() : new HttpRepository();` → `return new TaskAwareRepository(isTauri() ? new JsonFileRepository() : new HttpRepository());`

(The Supabase wrap is a harmless pass-through since `SupabaseRepository.handlesTasks` is true.)

- [ ] **Step 3: Verify the data layer end-to-end**

Run: `npx vitest run` → expected: all pass (prior + Tasks 1–6 tests).
Run: `npx tsc --noEmit` → expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/data/createRepository.ts
git commit -m "feat(tasks): persist tasks locally via TaskAwareRepository"
```

---

## Task 8: `TaskForm` component

**Files:**
- Create: `src/features/task-editor/TaskForm.tsx`

(No unit test: presentational form, mirroring how `EventForm` is exercised via its hosts; the create/edit/promote behavior is verified manually in Task 11's smoke step and through the store tests.)

- [ ] **Step 1: Create `src/features/task-editor/TaskForm.tsx`**

```tsx
import { useState } from 'react';
import { PaletteSelector } from '../../ui/PaletteSelector';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
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
          <input
            type="date"
            aria-label="Date"
            value={date}
            autoFocus={focusDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <div className="editor-actions">
        {onDelete ? (
          <button className="editor-delete" onClick={onDelete}>Delete</button>
        ) : (
          <span />
        )}
        <button className="editor-save" onClick={submit} disabled={!canSave}>{submitLabel}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/task-editor/TaskForm.tsx
git commit -m "feat(tasks): minimal TaskForm"
```

---

## Task 9: Task editor host + uiStore wiring + App mount

**Files:**
- Modify: `src/app/uiStore.ts`
- Create: `src/features/task-editor/TaskEditorHost.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the `taskEditor` target** in `src/app/uiStore.ts`

Add an interface above `interface UiState` (next to the other `*Target` interfaces):

```ts
export interface TaskEditorTarget {
  anchorEl: Element;
  /** null = create a new task; an id = edit that task. */
  eventId: string | null;
  /** Focus the date field (used by "Set date…"). */
  focusDate?: boolean;
}
```

In `interface UiState`, add a field (next to `create: CreateTarget | null;`):

```ts
  taskEditor: TaskEditorTarget | null;
```

and two methods (next to `openCreate`):

```ts
  openTaskCreate(anchorEl: Element): void;
  openTaskEdit(eventId: string, anchorEl: Element, focusDate?: boolean): void;
```

In the store object, add `taskEditor: null,` to the initial state (next to `create: null,`), add `taskEditor: null` to EVERY existing `set({ ... })` reset list in the other `open*`/`closeOverlays` methods (so opening another overlay closes the task editor — match the existing pattern that lists every overlay), and add the two implementations next to `openCreate`:

```ts
  openTaskCreate: (anchorEl) => set({ taskEditor: { anchorEl, eventId: null }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
  openTaskEdit: (eventId, anchorEl, focusDate) => set({ taskEditor: { anchorEl, eventId, focusDate }, quickEntry: null, editor: null, create: null, span: null, spanDay: null, specialDayEditor: null, categoryEditor: null, dayBackground: null, highlightedEvent: null }),
```

Also add `taskEditor: null` into the `set({...})` of `openCreate`, `openQuickEntry`, `openEditor`, `openSpanCreate`, `openSpanEdit`, `openSpanDayChooser`, `openSpanDayEdit`, `openSpecialDayEditor`, `openCategoryEditor`, `openDayBackground`, and `closeOverlays`.

- [ ] **Step 2: Create `src/features/task-editor/TaskEditorHost.tsx`**

```tsx
import { useCallback } from 'react';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { TaskForm, type TaskFormValues } from './TaskForm';

/** Create/edit popover for tasks. Setting a date promotes the task to an event. */
export function TaskEditorHost() {
  const target = useUiStore((s) => s.taskEditor);
  const close = useUiStore((s) => s.closeOverlays);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const existing = useCalendarStore((s) =>
    target?.eventId ? s.events.find((e) => e.id === target.eventId) ?? null : null,
  );

  const handleSubmit = useCallback(
    (values: TaskFormValues) => {
      const promoting = !!values.date;
      if (target?.eventId) {
        updateEvent(target.eventId, {
          title: values.title,
          description: values.description,
          type: values.type,
          color: values.color,
          cosmetic: values.cosmetic,
          // Promotion: give it a date and drop the task flag.
          ...(promoting ? { date: values.date, isTask: undefined as unknown as undefined } : {}),
        });
      } else if (promoting) {
        void addEvent({
          title: values.title, date: values.date!, description: values.description,
          type: values.type, color: values.color, cosmetic: values.cosmetic,
        });
      } else {
        void addEvent({
          title: values.title, isTask: true, description: values.description,
          type: values.type, color: values.color, cosmetic: values.cosmetic,
        });
      }
      close();
    },
    [target, addEvent, updateEvent, close],
  );

  if (!target) return null;
  const initial: TaskFormValues = existing
    ? { title: existing.title, description: existing.description, type: existing.type, color: existing.color, cosmetic: existing.cosmetic, date: '' }
    : { title: '' };

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close}>
      <TaskForm
        initial={initial}
        submitLabel={target.eventId ? 'Save' : 'Add task'}
        focusDate={target.focusDate}
        onSubmit={handleSubmit}
        onDelete={target.eventId ? () => { void deleteEvent(target.eventId!); close(); } : undefined}
      />
    </AnchoredPopover>
  );
}
```

Note: `isTask: undefined` in the patch removes the flag on serialize. `EventPatch` already gained `isTask?: true` and `date?` in Task 3; the `as unknown as undefined` cast satisfies the `true`-typed field while writing `undefined`.

- [ ] **Step 3: Mount the host** in `src/App.tsx`

Add the import (next to the other host imports):

```ts
import { TaskEditorHost } from './features/task-editor/TaskEditorHost';
```

In the `Shell` component's fragment, add `<TaskEditorHost />` right after `<EventCreateHost />`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/uiStore.ts src/features/task-editor/TaskEditorHost.tsx src/App.tsx
git commit -m "feat(tasks): task create/edit host with date-promotion"
```

---

## Task 10: Upcoming panel — empty-space menu + Tasks section

**Files:**
- Modify: `src/features/upcoming-stack/UpcomingStack.tsx`

- [ ] **Step 1: Import `buildTasks` and the task-editor openers**

In `src/features/upcoming-stack/UpcomingStack.tsx`, update the `./upcoming` import to include `buildTasks`:

```ts
import { buildOngoing, buildUpcoming, buildTasks, DEFAULT_UPCOMING_VIEW, UpcomingView, viewOngoing, viewUpcoming, type UpcomingItem, clampDensity, DENSITY_MIN, DENSITY_MAX, DENSITY_STEP } from './upcoming';
```

The component already pulls `openCreate` from `useUiStore`. Add two more selectors next to it:

```ts
  const openTaskCreate = useUiStore((s) => s.openTaskCreate);
  const openTaskEdit = useUiStore((s) => s.openTaskEdit);
```

- [ ] **Step 2: Compute tasks**

After the existing `const ongoing = useMemo(...)` line, add:

```ts
  const tasks = useMemo(() => buildTasks(events), [events]);
```

- [ ] **Step 3: Empty-space context menu handler**

Add this handler next to `openCardMenu`:

```ts
  /** Right-click on empty space in the list → create event/task. Ignored when
   *  the click landed on a card (those open their own menu). */
  const openEmptySpaceMenu = (e: React.MouseEvent) => {
    if (selectionActive) return;
    if ((e.target as HTMLElement).closest('.upcoming-card')) return;
    e.preventDefault();
    const anchor = e.currentTarget as Element;
    setMenu({
      anchor: pointAnchor(e.clientX, e.clientY),
      items: [
        { label: 'New event', onClick: () => openCreate(anchor) },
        { label: 'New task', onClick: () => openTaskCreate(anchor) },
      ],
    });
  };
```

- [ ] **Step 4: Attach the handler to the list**

Change the upcoming list container to add `onContextMenu`:

```tsx
      <div className="upcoming-list" ref={listRef} onPointerDown={onListPointerDown} onContextMenu={openEmptySpaceMenu} style={{ zoom: density } as React.CSSProperties}>
```

- [ ] **Step 5: Render the Tasks section**

Directly AFTER the closing `</div>` of the `upcoming-list` block (before the `{marquee && (...)}` block), add:

```tsx
      {tasks.length > 0 && (
        <div className="tasks-section" style={{ zoom: density } as React.CSSProperties}>
          <span className="panel-sublabel">Tasks</span>
          {tasks.map((event) => (
            <div
              key={event.id}
              id={`upcoming-card-${event.id}`}
              data-event-id={event.id}
              className={'upcoming-card task-card' + (compactMode ? ' is-compact' : '') + (selectionActive && selectedIds.has(event.id) ? ' is-selected' : '')}
              role="button"
              tabIndex={0}
              onClick={() => openTaskEdit(event.id, document.getElementById(`upcoming-card-${event.id}`) as Element)}
              onContextMenu={(e) =>
                openCardMenu(e, [
                  { label: 'Modify', onClick: () => openTaskEdit(event.id, e.currentTarget as Element) },
                  { label: 'Set date…', onClick: () => openTaskEdit(event.id, e.currentTarget as Element, true) },
                  { label: 'Delete', danger: true, onClick: () => void confirmDelete(event) },
                ])
              }
            >
              <span className="upcoming-card-body">
                <div className="upcoming-title">{event.title}</div>
                {showCategory && event.type && (
                  <div className="upcoming-date">
                    <span className="upcoming-type" style={getCategoryStyle(storeCategories[event.type])}>{event.type}</span>
                  </div>
                )}
              </span>
              <button
                className={'upcoming-delete-btn' + (selectionActive ? ' is-suppressed' : '')}
                onClick={(e) => handleDelete(e, event)}
                disabled={selectionActive}
                title="Delete task"
                aria-label="Delete task"
              >
                <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 6: Update the empty-state condition**

The list shows "No upcoming events found." only when there's nothing at all. Change that condition to also account for tasks:

```tsx
        {items.length === 0 && ongoing.length === 0 && tasks.length === 0 && (
          <div className="upcoming-empty">No upcoming events found.</div>
        )}
```

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit` → expected: no errors.
Run: `npx vitest run` → expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/upcoming-stack/UpcomingStack.tsx
git commit -m "feat(tasks): right-click New event/New task + Tasks section"
```

---

## Task 11: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all pass (prior 357 + new task tests).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Manual smoke (`npm run tauri dev` or `npm run dev`)**

Verify:
- Right-click empty space in the Upcoming panel → menu with **New event** and **New task**.
- **New task** → TaskForm → adding a title creates a card under a **Tasks** section at the bottom; no date shown.
- The task does **not** appear in the calendar grid or minimap, and (when connected to iCloud/Google) is **not** pushed to a calendar.
- Right-click a task → **Set date…** → pick a date → it leaves the Tasks section and appears as a normal dated event (and syncs if connected).
- Reload: tasks persist.

No commit — smoke only.

---

## Self-Review

**Spec coverage (against `2026-06-25-dateless-tasks-design.md`):**
- Data model A (`isTask` + `date: ''` + `isTaskEvent`) → Task 1. ✓
- Persistence: capability-aware `TaskAwareRepository`, local `tasks.json`, Supabase pass-through → Tasks 4–7. ✓
- Creation via right-click empty space (New event/New task) → Task 10. ✓
- Dedicated Tasks section at the bottom, `updatedAt`-desc → Tasks 2 + 10. ✓
- Promotion by assigning a date → Tasks 9 (host) + 10 (Set date…). ✓
- Exclusion invariant (grid/minimap/Ongoing/dated-Upcoming, never ICS) → Task 1 guard + `isSpan`=false; asserted in Tasks 1–2. ✓
- Supabase task-sync deferred to P3 → `handlesTasks` plumbed (Task 4); the events-table nullable `date` + `is_task` column ships with P3, as the spec states. ✓ (no gap by design)

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `isTaskEvent` (Task 1) used in Tasks 2, 6. `TaskFormValues` (Task 8) consumed by Task 9. `taskEditor`/`openTaskCreate`/`openTaskEdit` defined in Task 9, used in Task 10. `handlesTasks` defined in Task 4, used in Task 6. `buildTasks` defined in Task 2, used in Task 10. Column/field names consistent throughout.
