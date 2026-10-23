import { describe, it, expect } from 'vitest';
import { rectsIntersect } from './useMarqueeSelect';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('rectsIntersect', () => {
  it('detects overlapping boxes', () => {
    expect(rectsIntersect(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(true);
  });

  it('detects containment', () => {
    expect(rectsIntersect(box(0, 0, 100, 100), box(40, 40, 60, 60))).toBe(true);
  });

  it('returns false for fully disjoint boxes', () => {
    expect(rectsIntersect(box(0, 0, 10, 10), box(20, 20, 30, 30))).toBe(false);
  });

  it('treats edge-touching as non-overlapping', () => {
    // a.right === b.left — they share an edge but do not overlap.
    expect(rectsIntersect(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false);
  });

  it('returns false when only one axis overlaps', () => {
    expect(rectsIntersect(box(0, 0, 10, 10), box(5, 50, 15, 60))).toBe(false);
  });
});
