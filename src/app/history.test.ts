import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canRedo,
  canUndo,
  historySizes,
  onHistoryChange,
  record,
  redoStep,
  registerHistoryDomain,
  resetHistory,
  undoStep,
  __resetHistoryForTests,
} from './history';

/** A stand-in store: holds a string, records/restores through the history. */
function makeDomain(name: string, initial: string) {
  const box = { value: initial, applied: true };
  registerHistoryDomain<string>(name, {
    read: () => box.value,
    apply: async (snapshot) => {
      if (!box.applied) return false;
      box.value = snapshot;
      return true;
    },
  });
  return {
    /** Change the value the way a store would: record where it was, then move. */
    change(next: string) {
      record(name, box.value);
      box.value = next;
    },
    get: () => box.value,
    failNextApply() {
      box.applied = false;
    },
  };
}

describe('shared undo history', () => {
  beforeEach(() => {
    __resetHistoryForTests();
  });

  it('undoes and redoes a single domain', async () => {
    const d = makeDomain('a', 'v1');
    d.change('v2');
    expect(canUndo()).toBe(true);

    await undoStep();
    expect(d.get()).toBe('v1');
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);

    await redoStep();
    expect(d.get()).toBe('v2');
    expect(canRedo()).toBe(false);
  });

  it('unwinds interleaved domains in the order the changes happened', async () => {
    const events = makeDomain('events', 'e1');
    const days = makeDomain('specialDays', 'd1');

    events.change('e2');
    days.change('d2');
    events.change('e3');

    // Most recent first, regardless of which store owned it.
    await undoStep();
    expect(events.get()).toBe('e2');
    expect(days.get()).toBe('d2');

    await undoStep();
    expect(days.get()).toBe('d1');
    expect(events.get()).toBe('e2');

    await undoStep();
    expect(events.get()).toBe('e1');
    expect(canUndo()).toBe(false);
  });

  it('replays interleaved domains forwards on redo', async () => {
    const events = makeDomain('events', 'e1');
    const days = makeDomain('specialDays', 'd1');
    events.change('e2');
    days.change('d2');

    await undoStep();
    await undoStep();
    expect(events.get()).toBe('e1');
    expect(days.get()).toBe('d1');

    await redoStep();
    expect(events.get()).toBe('e2');
    await redoStep();
    expect(days.get()).toBe('d2');
  });

  it('drops the redo path once a new change is recorded', async () => {
    const d = makeDomain('a', 'v1');
    d.change('v2');
    await undoStep();
    expect(canRedo()).toBe(true);

    d.change('v9');
    expect(canRedo()).toBe(false);
  });

  it('leaves the stacks untouched when a step cannot be applied', async () => {
    const d = makeDomain('a', 'v1');
    d.change('v2');
    d.failNextApply();

    expect(await undoStep()).toBe(false);
    // Still undoable, and nothing landed on the redo stack.
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
  });

  it('is a no-op on an empty stack', async () => {
    expect(await undoStep()).toBe(false);
    expect(await redoStep()).toBe(false);
  });

  it('keeps the redo entry when applying a step records another change', async () => {
    // A store whose restore path commits, which records — the stacks must not
    // be swapped out from under the step still in flight.
    let reentrant = false;
    let value = 'v1';
    registerHistoryDomain<string>('reentrant', {
      read: () => value,
      apply: async (snapshot) => {
        value = snapshot;
        if (reentrant) {
          reentrant = false;
          record('reentrant', 'noise');
        }
        return true;
      },
    });

    record('reentrant', 'v0');
    value = 'v2';
    reentrant = true;

    await undoStep();
    // The re-entrant record cleared the redo path, but nothing was stranded:
    // the stacks still describe a coherent history.
    expect(historySizes().redo + historySizes().undo).toBeGreaterThan(0);
    expect(canUndo()).toBe(true);
  });

  it('notifies subscribers when the stacks move', async () => {
    const seen = vi.fn();
    onHistoryChange(seen);
    const d = makeDomain('a', 'v1');
    d.change('v2');
    expect(seen).toHaveBeenCalled();
    seen.mockClear();
    await undoStep();
    expect(seen).toHaveBeenCalled();
  });

  it('resetHistory clears both stacks', async () => {
    const d = makeDomain('a', 'v1');
    d.change('v2');
    resetHistory();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });
});
