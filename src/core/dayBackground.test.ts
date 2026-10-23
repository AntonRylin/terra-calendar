import { describe, it, expect } from 'vitest';
import { resolveDayBackground, dayScopeClass } from './dayBackground';

const base = { id: 'rec1', cosmetic: '', animations: [] as string[] };

describe('resolveDayBackground', () => {
  it('returns none when nothing set', () => {
    expect(resolveDayBackground(base)).toEqual({ kind: 'none' });
  });
  it('returns cosmetic when only cosmetic set', () => {
    expect(resolveDayBackground({ ...base, cosmetic: 'aurora' })).toEqual({ kind: 'cosmetic', id: 'aurora' });
  });
  it('prefers customStyle over cosmetic', () => {
    const style = { kind: 'raw', source: 'background:red;' } as const;
    expect(resolveDayBackground({ ...base, cosmetic: 'aurora', customStyle: style }))
      .toEqual({ kind: 'css', style, scopeClass: 'cd-rec1' });
  });
  it('prefers image over everything', () => {
    const ref = { kind: 'upload' as const, id: 'img1', w: 10, h: 10 };
    const got = resolveDayBackground({ ...base, cosmetic: 'aurora', image: ref });
    expect(got).toEqual({ kind: 'image', ref });
  });
  it('dayScopeClass is stable per record id', () => {
    expect(dayScopeClass('abc')).toBe('cd-abc');
  });
});
