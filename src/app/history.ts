/**
 * One chronological undo/redo history shared by every undoable store.
 *
 * Events and day styling live in separate stores with separate persistence, but
 * a user pressing Ctrl+Z means "take back the last thing I did" regardless of
 * which store owned it. Two independent stacks would answer that question wrong
 * whenever the two kinds of change interleave, so both register here instead and
 * share a single ordering.
 *
 * Stores register an adapter rather than being imported directly, which keeps
 * this module dependency-free and avoids a cycle (store → history → store).
 */

/** Snapshots are opaque here; each adapter knows how to read and apply its own. */
export interface HistoryAdapter<T = unknown> {
  /** The current committed state, captured when a change is pushed onto redo. */
  read(): T;
  /** Restore a snapshot. Return false if it could not be applied (e.g. a failed
   *  save), and the history will be left untouched so the next attempt sees the
   *  same stacks. */
  apply(snapshot: T): Promise<boolean>;
}

interface Entry {
  domain: string;
  /** The state of `domain` as it was *before* the recorded change. */
  snapshot: unknown;
}

const MAX_HISTORY = 100;

// Mutated in place, never reassigned: a step in progress reads these across an
// await, and swapping in a fresh array mid-flight would strand its push on a
// detached one — silently dropping the entry it was about to record.
const adapters = new Map<string, HistoryAdapter<never>>();
const undoStack: Entry[] = [];
const redoStack: Entry[] = [];
let onChange: (() => void) | null = null;

/** Register a store's snapshot reader/applier under a domain key. */
export function registerHistoryDomain<T>(domain: string, adapter: HistoryAdapter<T>): void {
  adapters.set(domain, adapter as HistoryAdapter<never>);
}

/** Called after every stack change so the UI's canUndo/canRedo flags follow. */
export function onHistoryChange(fn: () => void): void {
  onChange = fn;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

/** Depth of each stack — for diagnostics and tests. */
export function historySizes(): { undo: number; redo: number } {
  return { undo: undoStack.length, redo: redoStack.length };
}

/**
 * Record a completed change: `before` is the domain's state as it was prior to
 * it. Taking a new action invalidates any redo path, same as every editor.
 */
export function record(domain: string, before: unknown): void {
  undoStack.push({ domain, snapshot: before });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  onChange?.();
}

/** Drop all history — a fresh load is a clean slate. */
export function resetHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  onChange?.();
}

async function step(from: Entry[], to: Entry[]): Promise<boolean> {
  const entry = from.pop();
  if (!entry) return false;
  const adapter = adapters.get(entry.domain);
  if (!adapter) return false;

  // Capture where we are now before moving, so the opposite stack can bring us
  // back. Reading through the adapter keeps this correct for any domain.
  const current: Entry = { domain: entry.domain, snapshot: adapter.read() };
  const ok = await adapter.apply(entry.snapshot as never);
  if (!ok) {
    // Nothing moved — put the entry back so the stacks stay consistent.
    from.push(entry);
    onChange?.();
    return false;
  }
  to.push(current);
  if (to.length > MAX_HISTORY) to.shift();
  onChange?.();
  return true;
}

/** Undo the most recent recorded change, whichever store made it. */
export function undoStep(): Promise<boolean> {
  return step(undoStack, redoStack);
}

/** Replay the most recently undone change. */
export function redoStep(): Promise<boolean> {
  return step(redoStack, undoStack);
}

/** Test seam: forget registered adapters as well as the stacks. */
export function __resetHistoryForTests(): void {
  adapters.clear();
  undoStack.length = 0;
  redoStack.length = 0;
  onChange = null;
}
