import { describe, it, expect, beforeEach } from 'vitest';
import { useSelectionStore } from './selectionStore';

beforeEach(() => useSelectionStore.getState().exit());

describe('selectionStore', () => {
  it('starts inactive and empty', () => {
    const s = useSelectionStore.getState();
    expect(s.active).toBe(false);
    expect(s.selected.size).toBe(0);
  });

  it('enter activates with an empty selection in tap mode', () => {
    useSelectionStore.getState().enter();
    expect(useSelectionStore.getState().active).toBe(true);
    expect(useSelectionStore.getState().source).toBe('tap');
    expect(useSelectionStore.getState().selected.size).toBe(0);
  });

  it('enterQuick activates in quick mode', () => {
    useSelectionStore.getState().enterQuick();
    expect(useSelectionStore.getState().active).toBe(true);
    expect(useSelectionStore.getState().source).toBe('quick');
    expect(useSelectionStore.getState().selected.size).toBe(0);
  });

  it('exit resets the source', () => {
    useSelectionStore.getState().enterQuick();
    useSelectionStore.getState().exit();
    expect(useSelectionStore.getState().source).toBeNull();
  });

  it('toggle adds then removes an id', () => {
    const { enter, toggle } = useSelectionStore.getState();
    enter();
    toggle('a');
    expect(useSelectionStore.getState().selected.has('a')).toBe(true);
    toggle('a');
    expect(useSelectionStore.getState().selected.has('a')).toBe(false);
  });

  it('selectMany replaces the selection', () => {
    useSelectionStore.getState().enter();
    useSelectionStore.getState().selectMany(['a', 'b', 'c']);
    expect([...useSelectionStore.getState().selected].sort()).toEqual(['a', 'b', 'c']);
  });

  it('exit clears and deactivates', () => {
    const { enter, toggle, exit } = useSelectionStore.getState();
    enter();
    toggle('a');
    exit();
    expect(useSelectionStore.getState().active).toBe(false);
    expect(useSelectionStore.getState().selected.size).toBe(0);
  });
});
