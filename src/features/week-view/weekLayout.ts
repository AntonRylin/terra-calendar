import { addDays } from '../../core/dates';

/**
 * Pure layout maths for the week planner: side-by-side columns for
 * overlapping timed events, lane packing for the all-day strip, and the
 * pointer→time snapping used by drag/resize.
 */

/** Drag and resize snap to 5-minute steps. */
export const SNAP_MIN = 5;
/** A block can't be resized below 15 minutes (stays grabbable). */
export const MIN_DURATION_MIN = 15;

export function snapMinutes(minutes: number, step = SNAP_MIN): number {
  return Math.round(minutes / step) * step;
}

export interface TimedInterval {
  startMin: number;
  endMin: number;
  /** What this block would like to be, in px: enough for its time or its
   *  title, whichever is wider (the view measures the text — see
   *  blockContentWidth in WeekView). Left out, blocks share evenly. */
  wantWidthPx?: number;
}

export interface BlockPlacement {
  /** Left edge in % of the day column. */
  leftPct: number;
  /** Width in % of the day column. */
  widthPct: number;
  /** Stacking order. Blocks no longer sit on each other, so this is only the
   *  base a hover lifts from. */
  z: number;
}

/** Widest a day column grows to fit its busiest moment, relative to a quiet
 *  day. Past this the events on it share what there is and their titles clip. */
export const DAY_WEIGHT_MAX = 4;

/** Blocks that don't overlap in time can share a column. */
function assignColumns<T extends TimedInterval>(cluster: T[]): { item: T; col: number }[] {
  const colEnds: number[] = [];
  return cluster.map((item) => {
    let col = colEnds.findIndex((end) => end <= item.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(0);
    }
    colEnds[col] = item.endMin;
    return { item, col };
  });
}

/** A run of transitively overlapping blocks, and the width each of its columns
 *  asked for. A lone block is a cluster of one wanting the whole day. */
interface Cluster<T> {
  placed: { item: T; col: number }[];
  colWidths: number[];
}

function clusterWidth(colWidths: number[]): number {
  return colWidths.reduce((a, b) => a + b, 0);
}

/** Split a day into clusters and give each column the widest wish in it. */
function buildClusters<T extends TimedInterval>(blocks: T[]): Cluster<T>[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const clusters: Cluster<T>[] = [];
  let current: T[] = [];
  let end = -1;

  const flush = () => {
    if (current.length === 0) return;
    const placed = assignColumns(current);
    const colWidths: number[] = [];
    for (const { item, col } of placed) {
      colWidths[col] = Math.max(colWidths[col] ?? 0, item.wantWidthPx ?? 0);
    }
    clusters.push({ placed, colWidths });
    current = [];
  };

  for (const b of sorted) {
    if (current.length > 0 && b.startMin >= end) flush();
    current.push(b);
    end = Math.max(end, b.endMin);
  }
  flush();
  return clusters;
}

/**
 * Place one day's blocks so that none of them covers another. Blocks running at
 * the same time stand side by side, each column as wide as the widest thing in
 * it wants to be — its time or its title, whichever is longer. The day column
 * itself grows to hold them (see dayWeight), so widening is what makes the
 * room rather than the blocks overlapping to steal it.
 *
 * Widths come out as percentages of the day column, so a cluster always fills
 * it: one block alone is the full width, as it has always been, and a cluster
 * whose wishes outrun a capped day shrinks to fit in the same proportions.
 */
export function layoutDayBlocks<T extends TimedInterval>(blocks: T[]): (T & BlockPlacement)[] {
  const out: (T & BlockPlacement)[] = [];
  for (const { placed, colWidths } of buildClusters(blocks)) {
    const cols = colWidths.length;
    const total = clusterWidth(colWidths);
    // Nothing measured (or nothing to measure): share the day evenly.
    const even = total <= 0;
    const lefts: number[] = [];
    let run = 0;
    for (let c = 0; c < cols; c++) {
      lefts[c] = even ? (100 / cols) * c : (run / total) * 100;
      run += colWidths[c] ?? 0;
    }
    for (const { item, col } of placed) {
      out.push({
        ...item,
        leftPct: lefts[col],
        widthPct: even ? 100 / cols : ((colWidths[col] ?? 0) / total) * 100,
        z: 1,
      });
    }
  }
  return out;
}

/**
 * Free time worth pointing out: the openings between one busy stretch ending
 * and the next beginning, no longer than `maxGapMin`. Overlapping blocks count
 * as one stretch, so a gap only ever sits over genuinely empty grid.
 */
export function busyGaps(
  blocks: TimedInterval[],
  maxGapMin: number,
): { startMin: number; endMin: number }[] {
  if (maxGapMin <= 0 || blocks.length < 2) return [];
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const gaps: { startMin: number; endMin: number }[] = [];
  let end = sorted[0].endMin;
  for (const b of sorted.slice(1)) {
    if (b.startMin > end && b.startMin - end <= maxGapMin) {
      gaps.push({ startMin: end, endMin: b.startMin });
    }
    end = Math.max(end, b.endMin);
  }
  return gaps;
}

/** Peak number of blocks running at the same minute. */
export function peakConcurrency(blocks: TimedInterval[]): number {
  const points = blocks
    .flatMap((b) => [
      [b.startMin, 1],
      [b.endMin, -1],
    ] as const)
    // Ends sort before starts at the same minute, so touching blocks don't count.
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of points) {
    cur += d;
    if (cur > max) max = cur;
  }
  return max;
}

/**
 * How wide this day's column wants to be, as a multiple of a quiet day. A day
 * whose events never overlap stays at 1 whatever it holds; one with events
 * running together grows to the width its busiest moment asks for, up to the
 * cap — past which the blocks there share what there is.
 */
export function dayWeight(blocks: TimedInterval[], dayBasePx: number): number {
  if (dayBasePx <= 0) return 1;
  let widest = 0;
  for (const cluster of buildClusters(blocks)) {
    if (cluster.colWidths.length < 2) continue; // no overlap, no widening
    widest = Math.max(widest, clusterWidth(cluster.colWidths));
  }
  return Math.min(Math.max(1, widest / dayBasePx), DAY_WEIGHT_MAX);
}

export interface LaneInterval {
  /** First day column the bar covers, 0..6. */
  startIdx: number;
  /** Last day column the bar covers (inclusive), 0..6. */
  endIdx: number;
}

/** Pack all-day bars into horizontal lanes (first lane that has room). */
export function packLanes<T extends LaneInterval>(segments: T[]): (T & { lane: number })[] {
  const sorted = [...segments].sort((a, b) => a.startIdx - b.startIdx || b.endIdx - a.endIdx);
  const laneEnds: number[] = []; // per-lane last occupied day index
  return sorted.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.startIdx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = s.endIdx;
    return { ...s, lane };
  });
}

/** Group sorted ISO dates into runs of consecutive days. */
export function contiguousRuns(dates: string[]): { start: string; end: string }[] {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const runs: { start: string; end: string }[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const d of sorted.slice(1)) {
    if (d !== addDays(prev, 1)) {
      runs.push({ start, end: prev });
      start = d;
    }
    prev = d;
  }
  runs.push({ start, end: prev });
  return runs;
}
