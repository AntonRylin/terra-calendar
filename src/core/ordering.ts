/**
 * Sort key for an event's time-of-day. All-day events (no time) yield "".
 * Since "" sorts before any "HH:mm" string, all-day events come first and
 * timed events follow in chronological order.
 */
export function timeSortKey(time: string | undefined): string {
  return time ?? '';
}

/**
 * Comparator ordering events within a single day: all-day first, then
 * ascending by time. Pass directly to Array.prototype.sort.
 */
export function compareByTime(a: { time?: string }, b: { time?: string }): number {
  return timeSortKey(a.time).localeCompare(timeSortKey(b.time));
}
