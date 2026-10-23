import { describe, it, expect, beforeEach } from 'vitest';
import {
  useHabitEntriesStore,
  normalizeEntries,
  mergeHabitEntries,
  MAX_TEXT_ENTRY_LENGTH,
  type HabitEntries,
} from './habitEntriesStore';

const STORAGE_KEY = 'open-calendar.habit-entries';

beforeEach(() => {
  localStorage.clear();
  useHabitEntriesStore.setState({ entries: {} });
});

describe('habitEntriesStore basics', () => {
  it('sets a boolean entry and persists it to localStorage', () => {
    useHabitEntriesStore.getState().setEntry('gym', '2026-07-12', true);
    const entry = useHabitEntriesStore.getState().entries['gym']['2026-07-12'];
    expect(entry.v).toBe(true);
    expect(entry.updatedAt).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.gym['2026-07-12'].v).toBe(true);
  });

  it('sets text and number entries', () => {
    useHabitEntriesStore.getState().setEntry('diary', '2026-07-12', 'good day');
    useHabitEntriesStore.getState().setEntry('money', '2026-07-12', 42.5);
    expect(useHabitEntriesStore.getState().entries['diary']['2026-07-12'].v).toBe('good day');
    expect(useHabitEntriesStore.getState().entries['money']['2026-07-12'].v).toBe(42.5);
  });

  it('caps text entries and rejects non-finite numbers', () => {
    useHabitEntriesStore.getState().setEntry('diary', '2026-07-12', 'x'.repeat(MAX_TEXT_ENTRY_LENGTH + 100));
    expect((useHabitEntriesStore.getState().entries['diary']['2026-07-12'].v as string).length).toBe(
      MAX_TEXT_ENTRY_LENGTH,
    );
    useHabitEntriesStore.getState().setEntry('money', '2026-07-12', Infinity);
    expect(useHabitEntriesStore.getState().entries['money']).toBeUndefined();
  });

  it('clearEntry leaves a tombstone instead of deleting the day', () => {
    useHabitEntriesStore.getState().setEntry('gym', '2026-07-12', true);
    useHabitEntriesStore.getState().clearEntry('gym', '2026-07-12');
    const entry = useHabitEntriesStore.getState().entries['gym']['2026-07-12'];
    expect(entry.v).toBeNull();
    expect(entry.updatedAt).toBeTruthy();
    // Clearing an unrecorded day is a no-op (no tombstone spam).
    useHabitEntriesStore.getState().clearEntry('gym', '2026-01-01');
    expect(useHabitEntriesStore.getState().entries['gym']['2026-01-01']).toBeUndefined();
  });

  it('deleteTabEntries drops the whole subtree', () => {
    useHabitEntriesStore.getState().setEntry('gym', '2026-07-12', true);
    useHabitEntriesStore.getState().setEntry('diary', '2026-07-12', 'kept');
    useHabitEntriesStore.getState().deleteTabEntries('gym');
    expect(useHabitEntriesStore.getState().entries['gym']).toBeUndefined();
    expect(useHabitEntriesStore.getState().entries['diary']).toBeDefined();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.gym).toBeUndefined();
  });

  it('init round-trips through localStorage', () => {
    useHabitEntriesStore.getState().setEntry('gym', '2026-07-12', true);
    useHabitEntriesStore.setState({ entries: {} });
    useHabitEntriesStore.getState().init();
    expect(useHabitEntriesStore.getState().entries['gym']['2026-07-12'].v).toBe(true);
  });

  it('init survives corrupt localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    useHabitEntriesStore.getState().init();
    expect(useHabitEntriesStore.getState().entries).toEqual({});
  });
});

describe('normalizeEntries', () => {
  it('drops malformed tabs, dates, and values', () => {
    const out = normalizeEntries({
      good: {
        '2026-07-12': { v: true, updatedAt: '2026-07-12T10:00:00Z' },
        'not-a-date': { v: true, updatedAt: '' },
        '2026-07-13': { v: { nested: 'object' }, updatedAt: '' },
        '2026-07-14': { v: NaN, updatedAt: '' },
        '2026-07-15': 'junk',
      },
      badDays: 'junk',
      alsoBad: ['array'],
      emptyAfterFilter: { 'nope': { v: undefined } },
    });
    expect(out).toEqual({
      good: { '2026-07-12': { v: true, updatedAt: '2026-07-12T10:00:00Z' } },
    });
  });

  it('keeps tombstones and coerces missing updatedAt to empty string', () => {
    const out = normalizeEntries({ t: { '2026-01-01': { v: null } } });
    expect(out).toEqual({ t: { '2026-01-01': { v: null, updatedAt: '' } } });
  });

  it('returns empty for non-object roots', () => {
    expect(normalizeEntries(null)).toEqual({});
    expect(normalizeEntries([1, 2])).toEqual({});
    expect(normalizeEntries('x')).toEqual({});
  });

  it('truncates over-long text values', () => {
    const out = normalizeEntries({ t: { '2026-01-01': { v: 'y'.repeat(9999), updatedAt: '' } } });
    expect((out.t['2026-01-01'].v as string).length).toBe(MAX_TEXT_ENTRY_LENGTH);
  });
});

describe('mergeHabitEntries', () => {
  const at = (h: number) => `2026-07-12T${String(h).padStart(2, '0')}:00:00.000Z`;

  it('unions tabs and dates from both sides', () => {
    const local: HabitEntries = { a: { '2026-01-01': { v: true, updatedAt: at(1) } } };
    const cloud: HabitEntries = { b: { '2026-01-02': { v: 'hi', updatedAt: at(1) } } };
    const merged = mergeHabitEntries(local, cloud);
    expect(merged.a['2026-01-01'].v).toBe(true);
    expect(merged.b['2026-01-02'].v).toBe('hi');
  });

  it('keeps the newer entry per (tab, date)', () => {
    const l: HabitEntries = { a: { '2026-01-01': { v: 1, updatedAt: at(2) } } };
    const c: HabitEntries = { a: { '2026-01-01': { v: 2, updatedAt: at(1) } } };
    expect(mergeHabitEntries(l, c).a['2026-01-01'].v).toBe(1); // local newer
    expect(mergeHabitEntries(c, l).a['2026-01-01'].v).toBe(1); // still newer as cloud
  });

  it('favors cloud on updatedAt ties', () => {
    const l: HabitEntries = { a: { '2026-01-01': { v: 'local', updatedAt: at(1) } } };
    const c: HabitEntries = { a: { '2026-01-01': { v: 'cloud', updatedAt: at(1) } } };
    expect(mergeHabitEntries(l, c).a['2026-01-01'].v).toBe('cloud');
  });

  it('lets a newer tombstone win over an older value', () => {
    const l: HabitEntries = { a: { '2026-01-01': { v: true, updatedAt: at(1) } } };
    const c: HabitEntries = { a: { '2026-01-01': { v: null, updatedAt: at(2) } } };
    expect(mergeHabitEntries(l, c).a['2026-01-01'].v).toBeNull();
  });

  it('does not mutate its inputs', () => {
    const l: HabitEntries = { a: { '2026-01-01': { v: 1, updatedAt: at(1) } } };
    const c: HabitEntries = { a: { '2026-01-02': { v: 2, updatedAt: at(1) } } };
    mergeHabitEntries(l, c);
    expect(Object.keys(l.a)).toEqual(['2026-01-01']);
  });
});
