/**
 * Minimal GIF header reader — frame count and total loop duration.
 *
 * Re-encoding a GIF to video means recording it for exactly one loop: too short
 * and the clip cuts mid-animation, too long and it stutters at the wrap. The
 * frame delays are right there in the file, so read them instead of guessing.
 *
 * Only the block structure is walked (no pixel decoding): header → logical
 * screen descriptor → a stream of extension / image blocks until the trailer.
 */

export interface GifMeta {
  /** Number of image frames. 1 means the GIF is effectively a still. */
  frames: number;
  /** Sum of the frame delays, in seconds. */
  durationSec: number;
}

/** Browsers clamp delays below 2 centiseconds to 10 (the de-facto standard for
 *  GIFs authored with a 0 delay), so the recorder has to do the same. */
function normalizeDelay(centis: number): number {
  return centis < 2 ? 10 : centis;
}

/** Skip a chain of length-prefixed sub-blocks; returns the offset past its
 *  terminating zero byte. */
function skipSubBlocks(b: Uint8Array, at: number): number {
  let i = at;
  while (i < b.length) {
    const size = b[i];
    if (size === 0) return i + 1;
    i += size + 1;
  }
  return b.length;
}

/** Parse `bytes` as a GIF, or null if it isn't one (or is truncated). */
export function readGifMeta(bytes: Uint8Array): GifMeta | null {
  if (bytes.length < 13) return null;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (magic !== 'GIF87a' && magic !== 'GIF89a') return null;

  let i = 10; // past header + logical screen width/height
  const packed = bytes[i];
  i += 3; // packed + background colour index + pixel aspect ratio
  if (packed & 0x80) i += 3 * (1 << ((packed & 0x07) + 1)); // global colour table

  let frames = 0;
  let centis = 0;
  let pendingDelay = 0;

  while (i < bytes.length) {
    const block = bytes[i];
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      // Extension: label, then sub-blocks.
      const label = bytes[i + 1];
      if (label === 0xf9 && bytes[i + 2] >= 4) {
        // Graphic control extension: [size][packed][delay lo][delay hi][transparent]
        pendingDelay = bytes[i + 4] | (bytes[i + 5] << 8);
      }
      i = skipSubBlocks(bytes, i + 2); // sub-block chain starts at the size byte
      continue;
    }
    if (block === 0x2c) {
      // Image descriptor: 9 bytes, then an optional local colour table.
      const localPacked = bytes[i + 9];
      i += 10;
      if (localPacked & 0x80) i += 3 * (1 << ((localPacked & 0x07) + 1));
      i += 1; // LZW minimum code size
      i = skipSubBlocks(bytes, i);
      frames += 1;
      centis += normalizeDelay(pendingDelay);
      pendingDelay = 0;
      continue;
    }
    return frames > 0 ? { frames, durationSec: centis / 100 } : null; // unknown block
  }

  if (frames === 0) return null;
  return { frames, durationSec: centis / 100 };
}
