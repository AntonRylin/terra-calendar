import { describe, it, expect } from 'vitest';
import { normalizeSpecialDay } from './specialDaysStore';


describe('normalizeSpecialDay', () => {
  it('migrates a legacy single animation string into an array', () => {
    const out = normalizeSpecialDay({ id: '1', date: '2026-06-20', cosmetic: 'aurora', animation: 'snow', emoji: '', recurrence: 'none' });
    expect(out.animations).toEqual(['snow']);
    expect(out.cosmetic).toBe('aurora');
  });

  it("treats legacy animation 'none' as no effects", () => {
    const out = normalizeSpecialDay({ id: '1', date: '2026-06-20', animation: 'none' });
    expect(out.animations).toEqual([]);
  });

  it('keeps a modern animations array, dropping non-strings and "none"', () => {
    const out = normalizeSpecialDay({ id: '1', date: '2026-06-20', animations: ['sparkles', 'none', 5, 'wiggle'] });
    expect(out.animations).toEqual(['sparkles', 'wiggle']);
  });

  it('defaults missing animation fields to an empty array', () => {
    const out = normalizeSpecialDay({ id: '1', date: '2026-06-20', cosmetic: 'glow' });
    expect(out.animations).toEqual([]);
  });
});

describe('normalizeSpecialDay — custom backgrounds', () => {
  it('defaults new fields to undefined/empty on legacy records', () => {
    const sd = normalizeSpecialDay({ date: '2026-06-21', cosmetic: 'aurora', animations: [] });
    expect(sd.image).toBeUndefined();
    expect(sd.customStyle).toBeUndefined();
    expect(sd.updatedAt).toBe('');
  });

  it('carries through an image ref and a raw custom style', () => {
    const sd = normalizeSpecialDay({
      date: '2026-06-21', cosmetic: '', animations: [],
      image: { id: 'img1', w: 512, h: 384 },
      customStyle: { kind: 'raw', source: 'background:red;' },
      updatedAt: '2026-06-21T10:00:00.000Z',
    });
    expect(sd.image).toEqual({ kind: 'upload', id: 'img1', w: 512, h: 384, media: 'image', mime: undefined });
    expect(sd.customStyle).toEqual({ kind: 'raw', source: 'background:red;' });
    expect(sd.updatedAt).toBe('2026-06-21T10:00:00.000Z');
  });

  it('drops a malformed image ref (missing id)', () => {
    const sd = normalizeSpecialDay({ date: '2026-06-21', image: { w: 1, h: 1 } });
    expect(sd.image).toBeUndefined();
  });
});

describe('normalizeSpecialDay — image ref kinds (P3c)', () => {
  it('migrates a legacy {id,w,h} image ref to kind:upload', () => {
    const d = normalizeSpecialDay({ id: 'x', date: '2026-01-01', image: { id: 'i1', w: 400, h: 300 } });
    expect(d.image).toEqual({ kind: 'upload', id: 'i1', w: 400, h: 300, media: 'image', mime: undefined });
  });

  it('keeps an explicit upload ref', () => {
    const d = normalizeSpecialDay({ date: '2026-01-02', image: { kind: 'upload', id: 'i2', w: 1, h: 2 } });
    expect(d.image).toEqual({ kind: 'upload', id: 'i2', w: 1, h: 2, media: 'image', mime: undefined });
  });

  it('keeps a url ref with its src', () => {
    const d = normalizeSpecialDay({ date: '2026-01-03', image: { kind: 'url', id: 'i3', src: 'https://e/x.png', w: 10, h: 20 } });
    expect(d.image).toEqual({ kind: 'url', id: 'i3', src: 'https://e/x.png', w: 10, h: 20, media: 'image', mime: undefined });
  });
});

describe('normalizeSpecialDay — motion refs', () => {
  it('keeps a video ref with its mime', () => {
    const d = normalizeSpecialDay({
      date: '2026-01-04',
      image: { kind: 'upload', id: 'v1', w: 480, h: 270, media: 'video', mime: 'video/webm' },
    });
    expect(d.image).toEqual({ kind: 'upload', id: 'v1', w: 480, h: 270, media: 'video', mime: 'video/webm' });
  });

  it('treats anything but an explicit video as an image', () => {
    // Pre-motion refs carry no `media` at all, and they are all WebP stills.
    const legacy = normalizeSpecialDay({ date: '2026-01-05', image: { kind: 'upload', id: 'i5', w: 1, h: 1 } });
    expect(legacy.image?.media).toBe('image');
    const junk = normalizeSpecialDay({ date: '2026-01-06', image: { kind: 'upload', id: 'i6', w: 1, h: 1, media: 'sound' } });
    expect(junk.image?.media).toBe('image');
  });
});
