import type { Recurrence } from './types';

const UNIT_SINGULAR: Record<Recurrence['unit'], string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};
const UNIT_PLURAL: Record<Recurrence['unit'], string> = {
  day: 'days',
  week: 'weeks',
  month: 'months',
  year: 'years',
};

/** Human cadence for a recurrence, e.g. "every week", "every 2 weeks". "" when one-time. */
export function describeRecurrence(recurrence: Recurrence | null): string {
  if (!recurrence) return '';
  const { unit, interval } = recurrence;
  return interval === 1
    ? `every ${UNIT_SINGULAR[unit]}`
    : `every ${interval} ${UNIT_PLURAL[unit]}`;
}
