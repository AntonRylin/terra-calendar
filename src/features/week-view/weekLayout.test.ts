import { describe, it, expect } from 'vitest';
import {
  layoutDayBlocks,
  packLanes,
  contiguousRuns,
  snapMinutes,
  peakConcurrency,
  dayWeight,
  busyGaps,
  DAY_WEIGHT_MAX,
} from './weekLayout';

describe('snapMinutes', () => {
  it('snaps to 5-minute steps by default', () => {
    expect(snapMinutes(0)).toBe(0);
    expect(snapMinutes(justOver(5))).toBe(5);
    expect(snapMinutes(62)).toBe(60);
    expect(snapMinutes(63)).toBe(65);
  });
});

function justOver(n: number) {
  return n + 0.4;
}

/** Blocks never sit on each other: no two that run at the same minute may
 *  share any horizontal space. */
function assertNoOverlap(out: { startMin: number; endMin: number; leftPct: number; widthPct: number }[]) {
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      const sameTime = a.startMin < b.endMin && b.startMin < a.endMin;
      if (!sameTime) continue;
      const apart =
        a.leftPct + a.widthPct <= b.leftPct + 0.001 || b.leftPct + b.widthPct <= a.leftPct + 0.001;
      expect(apart).toBe(true);
    }
  }
}

describe('layoutDayBlocks', () => {
  it('gives a lone block the full width', () => {
    const [b] = layoutDayBlocks([{ startMin: 540, endMin: 600 }]);
    expect(b).toMatchObject({ leftPct: 0, widthPct: 100, z: 1 });
  });

  it('keeps non-overlapping blocks full width in separate clusters', () => {
    const out = layoutDayBlocks([
      { startMin: 540, endMin: 600 },
      { startMin: 600, endMin: 660 },
    ]);
    expect(out.every((b) => b.leftPct === 0 && b.widthPct === 100 && b.z === 1)).toBe(true);
  });

  it('stands overlapping blocks side by side, never on top', () => {
    const out = layoutDayBlocks([
      { startMin: 540, endMin: 660 },
      { startMin: 600, endMin: 720 },
    ]);
    assertNoOverlap(out);
    expect(out.map((b) => b.leftPct).sort((x, y) => x - y)).toEqual([0, 50]);
    expect(out.every((b) => b.widthPct === 50 && b.z === 1)).toBe(true);
  });

  it('gives each column the width its widest block asked for', () => {
    // Three at once wanting 40, 120 and 40 px: 20% / 60% / 20% of the day.
    const out = layoutDayBlocks([
      { startMin: 600, endMin: 660, wantWidthPx: 40 },
      { startMin: 600, endMin: 660, wantWidthPx: 120 },
      { startMin: 600, endMin: 660, wantWidthPx: 40 },
    ]);
    assertNoOverlap(out);
    expect(out.map((b) => b.widthPct)).toEqual([20, 60, 20]);
    expect(out.map((b) => b.leftPct)).toEqual([0, 20, 80]);
  });

  it('a column is as wide as the widest block sharing it', () => {
    // A runs all morning next to two that follow each other in one column;
    // that column takes the wider of the two.
    const out = layoutDayBlocks([
      { startMin: 540, endMin: 720, wantWidthPx: 100 },
      { startMin: 540, endMin: 600, wantWidthPx: 60 },
      { startMin: 600, endMin: 660, wantWidthPx: 300 },
    ]);
    assertNoOverlap(out);
    const a = out.find((b) => b.wantWidthPx === 100)!;
    expect(a.widthPct).toBeCloseTo(25); // 100 of 400
    expect(out.find((b) => b.wantWidthPx === 60)!.leftPct).toBeCloseTo(25);
    expect(out.find((b) => b.wantWidthPx === 300)!.widthPct).toBeCloseTo(75);
  });

  it('shares evenly when nothing has been measured', () => {
    const out = layoutDayBlocks(
      Array.from({ length: 4 }, () => ({ startMin: 600, endMin: 660 })),
    );
    assertNoOverlap(out);
    expect(out.every((b) => b.widthPct === 25)).toBe(true);
    expect(out.map((b) => b.leftPct)).toEqual([0, 25, 50, 75]);
  });

  it('reuses a freed column instead of adding one', () => {
    // A 9:00-12:00, B 9:01-9:20, C 9:25-11:00 — C fits back into B's column,
    // so the cluster is two columns wide, not three.
    const out = layoutDayBlocks([
      { startMin: 540, endMin: 720 },
      { startMin: 541, endMin: 560 },
      { startMin: 565, endMin: 660 },
    ]);
    assertNoOverlap(out);
    expect(out.every((b) => b.widthPct === 50)).toBe(true);
    expect(out.find((x) => x.startMin === 541)!.leftPct).toBe(50);
    expect(out.find((x) => x.startMin === 565)!.leftPct).toBe(50);
  });

  it('keeps a staggered pile-up clear of itself', () => {
    // Four events like a busy afternoon — each starts while the rest run.
    const out = layoutDayBlocks([
      { startMin: 570, endMin: 960, wantWidthPx: 80 },
      { startMin: 650, endMin: 780, wantWidthPx: 80 },
      { startMin: 720, endMin: 780, wantWidthPx: 80 },
      { startMin: 745, endMin: 780, wantWidthPx: 80 },
    ]);
    assertNoOverlap(out);
    expect(out.every((b) => b.widthPct === 25)).toBe(true);
    expect(out.map((b) => b.leftPct).sort((x, y) => x - y)).toEqual([0, 25, 50, 75]);
  });
});

describe('peakConcurrency / dayWeight', () => {
  it('counts the busiest simultaneous moment, not total events', () => {
    expect(peakConcurrency([])).toBe(0);
    expect(peakConcurrency([{ startMin: 540, endMin: 600 }])).toBe(1);
    // Touching blocks don't overlap.
    expect(
      peakConcurrency([
        { startMin: 540, endMin: 600 },
        { startMin: 600, endMin: 660 },
      ]),
    ).toBe(1);
    expect(
      peakConcurrency([
        { startMin: 540, endMin: 700 },
        { startMin: 560, endMin: 700 },
        { startMin: 580, endMin: 700 },
      ]),
    ).toBe(3);
  });

  it('widens a day to the room its overlaps asked for, up to the cap', () => {
    const base = 150;
    expect(dayWeight([], base)).toBe(1);
    // Nothing overlapping — however much a lone block wants, the day stays put.
    expect(dayWeight([{ startMin: 540, endMin: 600, wantWidthPx: 400 }], base)).toBe(1);
    // Two at once wanting 150 and 75: 225px of wishes over a 150px day.
    expect(
      dayWeight(
        [
          { startMin: 540, endMin: 700, wantWidthPx: 150 },
          { startMin: 560, endMin: 700, wantWidthPx: 75 },
        ],
        base,
      ),
    ).toBeCloseTo(1.5);
    // Two narrow ones still fit a normal day, so it doesn't widen.
    expect(
      dayWeight(
        [
          { startMin: 540, endMin: 700, wantWidthPx: 50 },
          { startMin: 560, endMin: 700, wantWidthPx: 50 },
        ],
        base,
      ),
    ).toBe(1);
    // Six full-width events at once run past the cap.
    const six = Array.from({ length: 6 }, () => ({
      startMin: 600,
      endMin: 700,
      wantWidthPx: base,
    }));
    expect(dayWeight(six, base)).toBe(DAY_WEIGHT_MAX);
  });
});

describe('packLanes', () => {
  it('stacks overlapping bars into separate lanes', () => {
    const out = packLanes([
      { startIdx: 0, endIdx: 6 },
      { startIdx: 2, endIdx: 3 },
    ]);
    expect(out.map((s) => s.lane).sort()).toEqual([0, 1]);
  });

  it('reuses a lane once a bar has ended', () => {
    const out = packLanes([
      { startIdx: 0, endIdx: 1 },
      { startIdx: 2, endIdx: 4 },
      { startIdx: 5, endIdx: 6 },
    ]);
    expect(out.every((s) => s.lane === 0)).toBe(true);
  });
});

describe('busyGaps', () => {
  it('finds the opening between two events when it is within the threshold', () => {
    const gaps = busyGaps(
      [
        { startMin: 13 * 60, endMin: 13 * 60 + 30 },
        { startMin: 14 * 60, endMin: 17 * 60 },
      ],
      60,
    );
    expect(gaps).toEqual([{ startMin: 13 * 60 + 30, endMin: 14 * 60 }]);
  });

  it('skips openings longer than the threshold', () => {
    const gaps = busyGaps(
      [
        { startMin: 8 * 60, endMin: 9 * 60 },
        { startMin: 12 * 60, endMin: 13 * 60 },
      ],
      60,
    );
    expect(gaps).toEqual([]);
  });

  it('treats overlapping events as one busy stretch', () => {
    const gaps = busyGaps(
      [
        { startMin: 9 * 60, endMin: 10 * 60 },
        { startMin: 9 * 60 + 30, endMin: 11 * 60 },
        { startMin: 11 * 60 + 15, endMin: 12 * 60 },
      ],
      60,
    );
    expect(gaps).toEqual([{ startMin: 11 * 60, endMin: 11 * 60 + 15 }]);
  });

  it('ignores a contained event that ends before the stretch does', () => {
    const gaps = busyGaps(
      [
        { startMin: 9 * 60, endMin: 12 * 60 },
        { startMin: 10 * 60, endMin: 10 * 60 + 30 },
        { startMin: 12 * 60 + 20, endMin: 13 * 60 },
      ],
      60,
    );
    expect(gaps).toEqual([{ startMin: 12 * 60, endMin: 12 * 60 + 20 }]);
  });

  it('reports nothing for back-to-back events or a threshold of zero', () => {
    const touching = [
      { startMin: 9 * 60, endMin: 10 * 60 },
      { startMin: 10 * 60, endMin: 11 * 60 },
    ];
    expect(busyGaps(touching, 60)).toEqual([]);
    const apart = [
      { startMin: 9 * 60, endMin: 10 * 60 },
      { startMin: 10 * 60 + 30, endMin: 11 * 60 },
    ];
    expect(busyGaps(apart, 0)).toEqual([]);
  });

  it('finds every qualifying opening across a day, unsorted input included', () => {
    const gaps = busyGaps(
      [
        { startMin: 14 * 60, endMin: 17 * 60 },
        { startMin: 8 * 60, endMin: 9 * 60 },
        { startMin: 9 * 60 + 45, endMin: 13 * 60 + 30 },
      ],
      60,
    );
    expect(gaps).toEqual([
      { startMin: 9 * 60, endMin: 9 * 60 + 45 },
      { startMin: 13 * 60 + 30, endMin: 14 * 60 },
    ]);
  });
});

describe('contiguousRuns', () => {
  it('groups consecutive dates and splits on gaps', () => {
    expect(
      contiguousRuns(['2026-07-06', '2026-07-07', '2026-07-09']),
    ).toEqual([
      { start: '2026-07-06', end: '2026-07-07' },
      { start: '2026-07-09', end: '2026-07-09' },
    ]);
  });

  it('handles a single date and empty input', () => {
    expect(contiguousRuns(['2026-07-06'])).toEqual([{ start: '2026-07-06', end: '2026-07-06' }]);
    expect(contiguousRuns([])).toEqual([]);
  });
});
