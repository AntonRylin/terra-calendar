export type MonthLabelMode = 'quarters' | 'all' | 'custom';

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const QUARTERS = [1, 4, 7, 10]; // current default — Jan / Apr / Jul / Oct

/** The month numbers (1-12) whose labels show on the year wheel for a mode. */
export function visibleMonths(mode: MonthLabelMode, customMonths: number[]): number[] {
  switch (mode) {
    case 'all':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case 'custom':
      return [...customMonths].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
    case 'quarters':
    default:
      return QUARTERS;
  }
}

export const MONTH_LABEL_OPTIONS: { value: MonthLabelMode; label: string }[] = [
  { value: 'quarters', label: 'Quarters (Jan · Apr · Jul · Oct)' },
  { value: 'all', label: 'All months' },
  { value: 'custom', label: 'Custom…' },
];
