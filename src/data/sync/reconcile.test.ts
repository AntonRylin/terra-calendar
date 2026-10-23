import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '../../core/types';
import { reconcile } from './reconcile';
import type { Baseline, StoreMeta } from './types';

const ev = (id: string, updatedAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: id, date: '2026-01-01', updatedAt, ...extra,
} as CalendarEvent);
const LOCAL: StoreMeta = { id: 'local', kind: 'local' };
const APPLE: StoreMeta = { id: 'apple', kind: 'caldav' };
const SUPA: StoreMeta = { id: 'supabase', kind: 'supabase' };

describe('reconcile', () => {
  it('propagates a new event to every store and the baseline', () => {
    const r = reconcile({}, { local: [ev('a', '2026-01-01T00:00:00Z')], apple: [] }, [LOCAL, APPLE], null);
    expect(r.merged.map((e) => e.id)).toEqual(['a']);
    expect(r.targets.local.map((e) => e.id)).toEqual(['a']);
    expect(r.targets.apple.map((e) => e.id)).toEqual(['a']);
  });

  it('deletes everywhere when a baseline event vanished from an active store', () => {
    const baseline: Baseline = { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'apple'] } };
    // present in local, gone from apple → user deleted it in apple
    const r = reconcile(baseline, { local: [ev('a', '2026-01-01T00:00:00Z')], apple: [] }, [LOCAL, APPLE], null);
    expect(r.merged).toEqual([]);
    expect(r.targets.local).toEqual([]);
    expect(r.targets.apple).toEqual([]);
  });

  it('does NOT delete when the missing store is inactive (disconnected)', () => {
    const baseline: Baseline = { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'apple'] } };
    // apple is not in the active store list this pass → its absence is not a deletion
    const r = reconcile(baseline, { local: [ev('a', '2026-01-01T00:00:00Z')] }, [LOCAL], null);
    expect(r.merged.map((e) => e.id)).toEqual(['a']);
  });

  it('first sync (empty baseline) never infers a deletion', () => {
    const r = reconcile({}, { local: [], apple: [ev('a', '2026-01-01T00:00:00Z')] }, [LOCAL, APPLE], null);
    expect(r.merged.map((e) => e.id)).toEqual(['a']);
    expect(r.targets.local.map((e) => e.id)).toEqual(['a']);
  });

  it('newest updatedAt wins on conflict', () => {
    const r = reconcile(
      { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } },
      { local: [ev('a', '2026-02-01T00:00:00Z', { title: 'newer-local' })],
        supabase: [ev('a', '2026-01-01T00:00:00Z', { title: 'older-supa' })] },
      [LOCAL, SUPA], 'supabase',
    );
    expect(r.merged[0].title).toBe('newer-local');
  });

  it('Supabase breaks an exact updatedAt tie', () => {
    const r = reconcile(
      { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } },
      { local: [ev('a', '2026-01-01T00:00:00Z', { title: 'local' })],
        supabase: [ev('a', '2026-01-01T00:00:00Z', { title: 'supa' })] },
      [LOCAL, SUPA], 'supabase',
    );
    expect(r.merged[0].title).toBe('supa');
  });

  it('never sends tasks to a CalDAV store, but keeps them in local/supabase', () => {
    const r = reconcile({}, { local: [ev('t', '2026-01-01T00:00:00Z', { isTask: true })], apple: [], supabase: [] },
      [LOCAL, APPLE, SUPA], 'supabase');
    expect(r.targets.apple).toEqual([]);
    expect(r.targets.local.map((e) => e.id)).toEqual(['t']);
    expect(r.targets.supabase.map((e) => e.id)).toEqual(['t']);
  });

  it('drops a baseline event that is gone from every active store', () => {
    const baseline: Baseline = { a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local'] } };
    const r = reconcile(baseline, { local: [], apple: [] }, [LOCAL, APPLE], null);
    expect(r.merged).toEqual([]);
  });
});
