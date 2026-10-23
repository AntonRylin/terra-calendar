import { describe, it, expect } from 'vitest';
import { hiddenFromMinimapByCategory, hiddenFromUpcomingByCategory } from './categoryVisibility';
import type { CategoryConfig } from '../app/settingsStore';

const cats: Record<string, CategoryConfig> = {
  Work: { type: 'color', value: '#0a84ff', hideFromMinimap: true },
  Chores: { type: 'color', value: '#30d158', hideFromUpcoming: true },
  Fun: { type: 'color', value: '#ff9f0a' },
};

describe('hiddenFromMinimapByCategory', () => {
  it('hides only events of a category with hideFromMinimap', () => {
    expect(hiddenFromMinimapByCategory({ type: 'Work' }, cats)).toBe(true);
    expect(hiddenFromMinimapByCategory({ type: 'Chores' }, cats)).toBe(false);
    expect(hiddenFromMinimapByCategory({ type: 'Fun' }, cats)).toBe(false);
  });

  it('never hides uncategorized events or unknown categories', () => {
    expect(hiddenFromMinimapByCategory({ type: undefined }, cats)).toBe(false);
    expect(hiddenFromMinimapByCategory({ type: 'Missing' }, cats)).toBe(false);
  });
});

describe('hiddenFromUpcomingByCategory', () => {
  it('hides only events of a category with hideFromUpcoming', () => {
    expect(hiddenFromUpcomingByCategory({ type: 'Chores' }, cats)).toBe(true);
    expect(hiddenFromUpcomingByCategory({ type: 'Work' }, cats)).toBe(false);
    expect(hiddenFromUpcomingByCategory({ type: 'Fun' }, cats)).toBe(false);
  });

  it('never hides uncategorized events or unknown categories', () => {
    expect(hiddenFromUpcomingByCategory({ type: undefined }, cats)).toBe(false);
    expect(hiddenFromUpcomingByCategory({ type: 'Missing' }, cats)).toBe(false);
  });
});
