/**
 * How wide a string comes out at a given size and weight, without putting it
 * on the page. The week view needs this to decide how much room a block asks
 * for before it lays any out — measuring rendered blocks instead would mean
 * laying out, reading, and laying out again on every change.
 */

let ctx: CanvasRenderingContext2D | null | undefined;
let stack = '';
const cache = new Map<string, number>();
/** Titles are finite but a long-lived tab shouldn't hoard every one it saw. */
const CACHE_MAX = 4000;

/** The app's own font stack, read once off the page. */
function fontStack(): string {
  if (stack) return stack;
  stack =
    (typeof getComputedStyle === 'function' && document.body
      ? getComputedStyle(document.body).fontFamily
      : '') || 'sans-serif';
  return stack;
}

/**
 * Width of `text` in px at `sizePx`/`weight`. Falls back to a rough estimate
 * where there is no canvas to measure with (jsdom, and any browser that
 * refuses a 2D context) — callers use this for sizing, never for correctness.
 */
export function textWidth(text: string, sizePx: number, weight = 400): number {
  if (!text) return 0;
  const key = `${sizePx}|${weight}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  if (ctx === undefined) {
    ctx = document.createElement('canvas').getContext('2d');
  }
  let width: number;
  if (ctx) {
    ctx.font = `${weight} ${sizePx}px ${fontStack()}`;
    width = ctx.measureText(text).width;
  } else {
    width = text.length * sizePx * 0.55;
  }

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, width);
  return width;
}
