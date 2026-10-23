import { pad2 } from './dates';

export interface ParsedEntry {
  /** "HH:mm" or null when no valid time prefix was found (= all-day). */
  time: string | null;
  /** "HH:mm" or null when no valid end time was found. */
  endTime: string | null;
  title: string;
}

const SINGLE_TIME = /^(?:(\d{1,2})[ :](\d{2})|(\d{2})(\d{2}))(?!\d)/;

export function parseQuickEntry(raw: string): ParsedEntry {
  const input = raw.trim();

  // 1. Try 8-digit military start+end time prefix (e.g., "05002015 family dinner")
  const eightDigitMatch = input.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)(?:\s*(.*))?$/);
  if (eightDigitMatch) {
    const startH = Number(eightDigitMatch[1]);
    const startM = Number(eightDigitMatch[2]);
    const endH = Number(eightDigitMatch[3]);
    const endM = Number(eightDigitMatch[4]);
    const title = (eightDigitMatch[5] ?? '').trim();
    if (startH <= 23 && startM <= 59 && endH <= 23 && endM <= 59) {
      return {
        time: `${pad2(startH)}:${pad2(startM)}`,
        endTime: `${pad2(endH)}:${pad2(endM)}`,
        title,
      };
    }
  }

  // 2. Try parsing start time and optional end time sequentially
  const firstMatch = input.match(SINGLE_TIME);
  if (firstMatch) {
    const startH = Number(firstMatch[1] ?? firstMatch[3]);
    const startM = Number(firstMatch[2] ?? firstMatch[4]);
    if (startH <= 23 && startM <= 59) {
      const startTimeStr = `${pad2(startH)}:${pad2(startM)}`;
      const afterFirst = input.slice(firstMatch[0].length);

      // Look for a separator followed by another time (e.g. "-", " to ", " ")
      const sepMatch = afterFirst.match(/^(?:\s*-\s*|\s*to\s+|\s+)/i);
      if (sepMatch) {
        const afterSep = afterFirst.slice(sepMatch[0].length);
        const secondMatch = afterSep.match(SINGLE_TIME);
        if (secondMatch) {
          const endH = Number(secondMatch[1] ?? secondMatch[3]);
          const endM = Number(secondMatch[2] ?? secondMatch[4]);
          if (endH <= 23 && endM <= 59) {
            const endTimeStr = `${pad2(endH)}:${pad2(endM)}`;
            const title = afterSep.slice(secondMatch[0].length).trim();
            return {
              time: startTimeStr,
              endTime: endTimeStr,
              title,
            };
          }
        }
      }

      const title = afterFirst.trim();
      return {
        time: startTimeStr,
        endTime: null,
        title,
      };
    }
  }

  return { time: null, endTime: null, title: input };
}

