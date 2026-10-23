import { describe, it, expect } from 'vitest';
import { readGifMeta } from './gifMeta';

/** A minimal but structurally valid GIF89a with one frame per delay (in
 *  centiseconds). 1×1 pixels, no colour tables — the reader never decodes. */
function gif(delays: number[]): Uint8Array {
  const bytes: number[] = [
    ...[...'GIF89a'].map((c) => c.charCodeAt(0)),
    1, 0, 1, 0, // logical screen 1×1
    0x00, 0x00, 0x00, // packed (no global colour table), background, aspect
  ];
  for (const delay of delays) {
    // Graphic control extension
    bytes.push(0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00);
    // Image descriptor (1×1 at 0,0, no local colour table)
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00);
    // LZW minimum code size, one data sub-block, terminator
    bytes.push(0x02, 0x02, 0x4c, 0x01, 0x00);
  }
  bytes.push(0x3b); // trailer
  return new Uint8Array(bytes);
}

describe('readGifMeta', () => {
  it('sums frame delays into a loop duration', () => {
    expect(readGifMeta(gif([10, 15, 25]))).toEqual({ frames: 3, durationSec: 0.5 });
  });

  it('clamps sub-2cs delays to 10cs, the way browsers do', () => {
    // Authoring tools emit 0 for "as fast as possible"; browsers render 100ms.
    expect(readGifMeta(gif([0, 1]))).toEqual({ frames: 2, durationSec: 0.2 });
  });

  it('reports a single-frame GIF, so callers can treat it as a still', () => {
    expect(readGifMeta(gif([10]))?.frames).toBe(1);
  });

  it('skips a global colour table when the header declares one', () => {
    const withGct = gif([10, 10]);
    withGct[10] = 0x80; // GCT present, size 2^1 = 2 entries (6 bytes)
    const patched = new Uint8Array([...withGct.slice(0, 13), 0, 0, 0, 0, 0, 0, ...withGct.slice(13)]);
    expect(readGifMeta(patched)).toEqual({ frames: 2, durationSec: 0.2 });
  });

  it('returns null for anything that is not a GIF', () => {
    expect(readGifMeta(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(readGifMeta(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
