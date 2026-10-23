import { describe, it, expect, beforeEach } from 'vitest';
import { loadBaseline, saveBaseline } from './baseline';

describe('sync baseline', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a baseline', () => {
    saveBaseline({ a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } });
    expect(loadBaseline()).toEqual({ a: { updatedAt: '2026-01-01T00:00:00Z', stores: ['local', 'supabase'] } });
  });

  it('returns {} when absent', () => {
    expect(loadBaseline()).toEqual({});
  });

  it('returns {} when corrupt', () => {
    localStorage.setItem('open-calendar.sync.baseline', '{not json');
    expect(loadBaseline()).toEqual({});
  });
});
