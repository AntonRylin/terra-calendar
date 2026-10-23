import { visibleMonths } from './monthLabels';

describe('visibleMonths', () => {
  it('quarters → Jan/Apr/Jul/Oct', () => {
    expect(visibleMonths('quarters', [])).toEqual([1, 4, 7, 10]);
  });

  it('all → every month', () => {
    expect(visibleMonths('all', [])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('custom → the chosen months, sorted and range-filtered', () => {
    expect(visibleMonths('custom', [5, 1, 12])).toEqual([1, 5, 12]);
    expect(visibleMonths('custom', [0, 13, 6])).toEqual([6]);
    expect(visibleMonths('custom', [])).toEqual([]);
  });
});
