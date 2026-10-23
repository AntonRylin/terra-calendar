import { describe, it, expect } from 'vitest';
import {
  baseMime,
  classifyMedia,
  evenSize,
  extForMime,
  fitWithin,
  formatBytes,
  MEDIA_EXTENSIONS,
  mimeFromName,
} from './media';

describe('fitWithin', () => {
  it('does not upscale small images', () => {
    expect(fitWithin(100, 80, 512)).toEqual({ w: 100, h: 80 });
  });
  it('scales a wide image so the long edge == max', () => {
    expect(fitWithin(2048, 1024, 512)).toEqual({ w: 512, h: 256 });
  });
  it('scales a tall image so the long edge == max', () => {
    expect(fitWithin(1000, 4000, 512)).toEqual({ w: 128, h: 512 });
  });
});

describe('evenSize', () => {
  it('rounds odd edges down — video codecs reject odd frame sizes', () => {
    expect(evenSize({ w: 481, h: 271 })).toEqual({ w: 480, h: 270 });
  });
  it('never collapses an edge to zero', () => {
    expect(evenSize({ w: 1, h: 1 })).toEqual({ w: 2, h: 2 });
  });
});

describe('baseMime', () => {
  it('drops codec parameters', () => {
    expect(baseMime('video/webm;codecs=vp9')).toBe('video/webm');
  });
  it('is empty for nothing', () => {
    expect(baseMime(undefined)).toBe('');
  });
});

describe('extForMime', () => {
  it('maps every storable type', () => {
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('image/gif')).toBe('gif');
    expect(extForMime('video/webm;codecs=vp9')).toBe('webm');
    expect(extForMime('video/mp4')).toBe('mp4');
  });
  it('falls back to webp, so pre-motion refs keep their bucket path', () => {
    expect(extForMime(undefined)).toBe('webp');
    expect(extForMime('application/octet-stream')).toBe('webp');
  });
  it('has an extension for every type the delete sweep must reach', () => {
    expect([...MEDIA_EXTENSIONS].sort()).toEqual(['gif', 'mp4', 'webm', 'webp']);
  });
});

describe('mimeFromName', () => {
  it('reads the extension of a plain name', () => {
    expect(mimeFromName('clip.mp4')).toBe('video/mp4');
  });
  it('ignores query strings and fragments', () => {
    expect(mimeFromName('https://cdn.example/a/b.webm?token=xyz#t=2')).toBe('video/webm');
  });
  it('is empty when the extension says nothing', () => {
    expect(mimeFromName('https://example.com/photo')).toBe('');
  });
});

describe('classifyMedia', () => {
  it('splits video, gif and still images', () => {
    expect(classifyMedia('video/quicktime')).toBe('video');
    expect(classifyMedia('image/gif')).toBe('gif');
    expect(classifyMedia('image/png')).toBe('image');
    expect(classifyMedia('application/pdf')).toBe('other');
  });
  it('falls back to the file name when the OS gives no type', () => {
    expect(classifyMedia('', 'holiday.MP4')).toBe('video');
    expect(classifyMedia(undefined, 'loop.gif')).toBe('gif');
  });
});

describe('formatBytes', () => {
  it('scales the unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(184 * 1024)).toBe('184 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
