# Open Calendar — PC Main Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP PC main screen of Open Calendar: 30/70 split layout with upcoming-events stack, year circle, month grid, quick-entry popover, and event editor, backed by local storage.

**Architecture:** Layered React + TypeScript app: `core/` (pure domain logic, no React), `data/` (EventRepository interface + adapters), `features/` (five self-contained UI modules), `app/` (layout shell + stores), `ui/` (design tokens + primitives). Tauri wraps the web app for desktop at the end; in the browser the app runs against a localStorage adapter.

**Tech Stack:** React 18, TypeScript (strict), Vite, Zustand, @floating-ui/react, Vitest + Testing Library, Tauri 2.

**Spec:** `docs/superpowers/specs/2026-06-12-main-screen-design.md` — read it before starting.

**Conventions for all tasks:**
- Run commands from the repo root (`D:\Projects\Open-Calendar`).
- Test command: `npx vitest run <path>` (or `npm test` for the full suite).
- Dates are local-wall-clock ISO strings (`"2026-06-12"`, `"14:30"`). Never convert to UTC. ISO date strings compare correctly with `<`/`>`.
- Commit after every task with the message given in its final step.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/ui/tokens.css`, `src/test/setup.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "open-calendar",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@floating-ui/react": "^0.27.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "~5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Open Calendar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/ui/tokens.css`** (the design system — every color/space/font in the app comes from here; dark theme later = a second token set)

```css
:root {
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-border: #e3e3e6;
  --color-border-strong: #d9d9de;
  --color-text: #1d1d1f;
  --color-text-secondary: #86868b;
  --color-text-faint: #aeaeb2;
  --color-accent: #0a84ff;
  --color-accent-soft: #eaf3ff;
  --color-muted-bg: #f5f5f7;
  --color-danger: #ff3b30;

  --radius-sm: 6px;
  --radius-md: 10px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;

  --font-stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  --shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.14);
}
```

- [ ] **Step 6: Create `src/index.css`**

```css
@import './ui/tokens.css';

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  font-family: var(--font-stack);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: inherit;
}
```

- [ ] **Step 7: Create `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 8: Create `src/App.tsx`** (placeholder; replaced in Task 13)

```tsx
export default function App() {
  return <div>Open Calendar</div>;
}
```

- [ ] **Step 9: Create `src/test/setup.ts`** (jsdom lacks ResizeObserver, which @floating-ui/react needs)

```ts
import '@testing-library/jest-dom/vitest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
```

- [ ] **Step 10: Install and verify the build**

Run: `npm install`
Then: `npm run build`
Expected: build completes with no TypeScript errors and a `dist/` folder appears.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with design tokens"
```

### Task 2: Core types and date helpers

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/dates.ts`
- Test: `src/core/dates.test.ts`

- [ ] **Step 1: Create `src/core/types.ts`**

```ts
export interface Recurrence {
  unit: 'week' | 'month' | 'year';
  /** 1 = every week/month/year, 2 = every 2nd, ... Always >= 1. */
  interval: number;
}

export interface CalendarEvent {
  id: string; // uuid
  title: string;
  description?: string;
  /** "YYYY-MM-DD", local wall-clock. First/anchor occurrence for recurring events. */
  date: string;
  /** "HH:mm", local wall-clock. Absent = all-day. */
  time?: string;
  recurrence: Recurrence | null;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
```

- [ ] **Step 2: Write failing tests `src/core/dates.test.ts`**

```ts
import {
  addDays,
  dayOfYear,
  daysInMonth,
  daysInYear,
  friendlyDate,
  isLeapYear,
  parseISODate,
  toISODate,
} from './dates';

describe('toISODate / parseISODate', () => {
  it('round-trips a local date', () => {
    expect(toISODate(new Date(2026, 5, 12))).toBe('2026-06-12');
    const d = parseISODate('2026-06-12');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(12);
  });
});

describe('addDays', () => {
  it('adds within a month', () => expect(addDays('2026-06-12', 3)).toBe('2026-06-15'));
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('daysInMonth', () => {
  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
  });
});

describe('leap years', () => {
  it('handles the 4/100/400 rules', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
  it('daysInYear follows leapness', () => {
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
  });
});

describe('dayOfYear', () => {
  it('counts from 1', () => {
    expect(dayOfYear('2026-01-01')).toBe(1);
    expect(dayOfYear('2026-12-31')).toBe(365);
    expect(dayOfYear('2028-12-31')).toBe(366);
  });
});

describe('friendlyDate', () => {
  const today = '2026-06-12';
  it('labels today and tomorrow', () => {
    expect(friendlyDate('2026-06-12', '14:30', today)).toBe('Today · 14:30');
    expect(friendlyDate('2026-06-13', undefined, today)).toBe('Tomorrow');
  });
  it('formats other dates as weekday + day + month', () => {
    expect(friendlyDate('2026-06-19', '09:00', today)).toBe('Fri 19 Jun · 09:00');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/dates.test.ts`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 4: Create `src/core/dates.ts`**

```ts
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses "YYYY-MM-DD" to a Date at local midnight. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** 1-based day of year; immune to DST because it counts calendar days. */
export function dayOfYear(iso: string): number {
  const d = parseISODate(iso);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.round((d.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

export function friendlyDate(iso: string, time: string | undefined, today: string): string {
  let label: string;
  if (iso === today) {
    label = 'Today';
  } else if (iso === addDays(today, 1)) {
    label = 'Tomorrow';
  } else {
    const d = parseISODate(iso);
    label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return time ? `${label} · ${time}` : label;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/dates.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/core
git commit -m "feat: core event types and date helpers"
```

---

### Task 3: Quick-entry time parser

**Files:**
- Create: `src/core/timeParser.ts`
- Test: `src/core/timeParser.test.ts`

- [ ] **Step 1: Write failing tests `src/core/timeParser.test.ts`**

```ts
import { parseQuickEntry } from './timeParser';

describe('parseQuickEntry', () => {
  it('parses leading "HH MM" as time, rest as title', () => {
    expect(parseQuickEntry('14 30 Dentist appointment')).toEqual({
      time: '14:30',
      title: 'Dentist appointment',
    });
  });

  it('parses "H MM" and zero-pads the hour', () => {
    expect(parseQuickEntry('9 00 Standup')).toEqual({ time: '09:00', title: 'Standup' });
  });

  it('parses early-morning times like "04 12"', () => {
    expect(parseQuickEntry('04 12 Call mom')).toEqual({ time: '04:12', title: 'Call mom' });
  });

  it('also accepts a colon separator', () => {
    expect(parseQuickEntry('14:30 Dentist')).toEqual({ time: '14:30', title: 'Dentist' });
  });

  it('treats text without a time as an all-day title', () => {
    expect(parseQuickEntry('Buy flowers')).toEqual({ time: null, title: 'Buy flowers' });
  });

  it('rejects invalid clock values and keeps them in the title', () => {
    expect(parseQuickEntry('25 99 nope')).toEqual({ time: null, title: '25 99 nope' });
  });

  it('requires the minutes to be two digits', () => {
    expect(parseQuickEntry('12 5 groceries')).toEqual({ time: null, title: '12 5 groceries' });
  });

  it('handles time with no title', () => {
    expect(parseQuickEntry('14 30')).toEqual({ time: '14:30', title: '' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseQuickEntry('  14 30  Dentist ')).toEqual({ time: '14:30', title: 'Dentist' });
  });

  it('handles empty input', () => {
    expect(parseQuickEntry('')).toEqual({ time: null, title: '' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/timeParser.test.ts`
Expected: FAIL — cannot resolve `./timeParser`.

- [ ] **Step 3: Create `src/core/timeParser.ts`**

```ts
import { pad2 } from './dates';

export interface ParsedEntry {
  /** "HH:mm" or null when no valid time prefix was found (= all-day). */
  time: string | null;
  title: string;
}

const TIME_PREFIX = /^(\d{1,2})[ :](\d{2})(?:\s+(.*))?$/;

export function parseQuickEntry(raw: string): ParsedEntry {
  const input = raw.trim();
  const match = input.match(TIME_PREFIX);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours <= 23 && minutes <= 59) {
      return { time: `${pad2(hours)}:${pad2(minutes)}`, title: (match[3] ?? '').trim() };
    }
  }
  return { time: null, title: input };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/timeParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/timeParser.ts src/core/timeParser.test.ts
git commit -m "feat: quick-entry time parser"
```

---

### Task 4: Occurrence expander

**Files:**
- Create: `src/core/occurrences.ts`
- Test: `src/core/occurrences.test.ts`

- [ ] **Step 1: Write failing tests `src/core/occurrences.test.ts`**

```ts
import type { CalendarEvent } from './types';
import { expandOccurrences, nextOccurrence } from './occurrences';

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'test-id',
    title: 'Test',
    date: '2026-06-12',
    recurrence: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('expandOccurrences — one-time events', () => {
  it('returns the date when inside the range (inclusive bounds)', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(expandOccurrences(e, '2026-06-12', '2026-06-12')).toEqual(['2026-06-12']);
  });
  it('returns [] when outside the range', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(expandOccurrences(e, '2026-07-01', '2026-07-31')).toEqual([]);
  });
});

describe('expandOccurrences — weekly', () => {
  it('expands every week', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29',
    ]);
  });
  it('expands every 2 weeks', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 2 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-30')).toEqual([
      '2026-06-01', '2026-06-15', '2026-06-29',
    ]);
  });
  it('never yields occurrences before the anchor date', () => {
    const e = makeEvent({ date: '2026-06-15', recurrence: { unit: 'week', interval: 1 } });
    expect(expandOccurrences(e, '2026-06-01', '2026-06-16')).toEqual(['2026-06-15']);
  });
});

describe('expandOccurrences — monthly', () => {
  it('expands every month on the anchor day', () => {
    const e = makeEvent({ date: '2026-01-15', recurrence: { unit: 'month', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15',
    ]);
  });
  it('clamps day 31 to the last day of shorter months', () => {
    const e = makeEvent({ date: '2026-01-31', recurrence: { unit: 'month', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });
  it('handles every 3 months across a year boundary', () => {
    const e = makeEvent({ date: '2026-11-10', recurrence: { unit: 'month', interval: 3 } });
    expect(expandOccurrences(e, '2026-11-01', '2027-05-31')).toEqual([
      '2026-11-10', '2027-02-10', '2027-05-10',
    ]);
  });
});

describe('expandOccurrences — yearly', () => {
  it('expands every year', () => {
    const e = makeEvent({ date: '2026-03-05', recurrence: { unit: 'year', interval: 1 } });
    expect(expandOccurrences(e, '2026-01-01', '2028-12-31')).toEqual([
      '2026-03-05', '2027-03-05', '2028-03-05',
    ]);
  });
  it('clamps Feb 29 anchors to Feb 28 in non-leap years', () => {
    const e = makeEvent({ date: '2028-02-29', recurrence: { unit: 'year', interval: 1 } });
    expect(expandOccurrences(e, '2028-01-01', '2030-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28',
    ]);
  });
  it('handles every 2 years', () => {
    const e = makeEvent({ date: '2026-07-01', recurrence: { unit: 'year', interval: 2 } });
    expect(expandOccurrences(e, '2026-01-01', '2031-12-31')).toEqual([
      '2026-07-01', '2028-07-01', '2030-07-01',
    ]);
  });
});

describe('expandOccurrences — degenerate ranges', () => {
  it('returns [] when rangeEnd < rangeStart', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(expandOccurrences(e, '2026-06-30', '2026-06-01')).toEqual([]);
  });
});

describe('nextOccurrence', () => {
  it('returns the date itself for a future one-time event', () => {
    const e = makeEvent({ date: '2026-06-20' });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2026-06-20');
  });
  it('returns null for a past one-time event', () => {
    const e = makeEvent({ date: '2026-06-01' });
    expect(nextOccurrence(e, '2026-06-12')).toBeNull();
  });
  it('returns today when today is an occurrence', () => {
    const e = makeEvent({ date: '2026-06-12' });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2026-06-12');
  });
  it('finds the next weekly occurrence', () => {
    const e = makeEvent({ date: '2026-06-01', recurrence: { unit: 'week', interval: 2 } });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2026-06-15');
  });
  it('finds the next yearly occurrence', () => {
    const e = makeEvent({ date: '2026-03-05', recurrence: { unit: 'year', interval: 1 } });
    expect(nextOccurrence(e, '2026-06-12')).toBe('2027-03-05');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/occurrences.test.ts`
Expected: FAIL — cannot resolve `./occurrences`.

- [ ] **Step 3: Create `src/core/occurrences.ts`**

```ts
import type { CalendarEvent, Recurrence } from './types';
import { addDays, daysInMonth, pad2 } from './dates';

/**
 * The k-th occurrence (k >= 0) of a recurrence anchored at `anchor`.
 * Monotonically increasing in k. Days 29-31 clamp to shorter months;
 * Feb 29 anchors clamp to Feb 28 in non-leap years.
 */
function occurrenceAt(anchor: string, unit: Recurrence['unit'], monthsOrWeeksOrYears: number): string {
  if (unit === 'week') {
    return addDays(anchor, 7 * monthsOrWeeksOrYears);
  }
  const [y, m, d] = anchor.split('-').map(Number);
  if (unit === 'month') {
    const totalMonths = m - 1 + monthsOrWeeksOrYears;
    const year = y + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return `${year}-${pad2(month)}-${pad2(Math.min(d, daysInMonth(year, month)))}`;
  }
  const year = y + monthsOrWeeksOrYears;
  return `${year}-${pad2(m)}-${pad2(Math.min(d, daysInMonth(year, m)))}`;
}

/**
 * Concrete dates the event occurs on within [rangeStart, rangeEnd], inclusive.
 * All panels consume occurrences — never raw recurrence rules.
 */
export function expandOccurrences(
  event: CalendarEvent,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  if (rangeEnd < rangeStart) return [];
  if (!event.recurrence) {
    return event.date >= rangeStart && event.date <= rangeEnd ? [event.date] : [];
  }
  const { unit, interval } = event.recurrence;
  const result: string[] = [];
  for (let k = 0; ; k++) {
    const occ = occurrenceAt(event.date, unit, interval * k);
    if (occ > rangeEnd) break;
    if (occ >= rangeStart) result.push(occ);
  }
  return result;
}

/** First occurrence on or after `from`, or null (one-time events in the past). */
export function nextOccurrence(event: CalendarEvent, from: string): string | null {
  if (!event.recurrence) {
    return event.date >= from ? event.date : null;
  }
  const { unit, interval } = event.recurrence;
  for (let k = 0; ; k++) {
    const occ = occurrenceAt(event.date, unit, interval * k);
    if (occ >= from) return occ;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/occurrences.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/occurrences.ts src/core/occurrences.test.ts
git commit -m "feat: recurrence occurrence expander with month/leap clamping"
```

### Task 5: Storage — store file format, repository interface, adapters

Note: the spec names IndexedDB as the browser dev adapter; we implement the browser adapter on localStorage instead (same `EventRepository` interface, ~20 lines vs ~100, identical behavior for our needs). Step 6 updates the spec to match.

**Files:**
- Create: `src/data/storeFile.ts`, `src/data/repository.ts`, `src/data/memoryRepository.ts`, `src/data/localStorageRepository.ts`
- Modify: `docs/superpowers/specs/2026-06-12-main-screen-design.md` (one line)
- Test: `src/data/storeFile.test.ts`, `src/data/localStorageRepository.test.ts`

- [ ] **Step 1: Write failing tests `src/data/storeFile.test.ts`**

```ts
import type { CalendarEvent } from '../core/types';
import { parseStore, serializeStore } from './storeFile';

const event: CalendarEvent = {
  id: 'abc',
  title: 'Dentist',
  date: '2026-06-12',
  time: '14:30',
  recurrence: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

describe('serializeStore / parseStore', () => {
  it('round-trips events with a version field', () => {
    const text = serializeStore([event]);
    expect(JSON.parse(text).version).toBe(1);
    const result = parseStore(text);
    expect(result).toEqual({ ok: true, events: [event] });
  });

  it('rejects invalid JSON', () => {
    expect(parseStore('{oops').ok).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(parseStore('"hello"').ok).toBe(false);
    expect(parseStore('null').ok).toBe(false);
  });

  it('rejects unknown versions', () => {
    expect(parseStore('{"version":99,"events":[]}').ok).toBe(false);
  });

  it('rejects a missing events array', () => {
    expect(parseStore('{"version":1}').ok).toBe(false);
    expect(parseStore('{"version":1,"events":"nope"}').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/storeFile.test.ts`
Expected: FAIL — cannot resolve `./storeFile`.

- [ ] **Step 3: Create `src/data/storeFile.ts`**

```ts
import type { CalendarEvent } from '../core/types';

export const STORE_VERSION = 1;

export type ParseResult =
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; error: string };

export function serializeStore(events: CalendarEvent[]): string {
  return JSON.stringify({ version: STORE_VERSION, events }, null, 2);
}

export function parseStore(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'not an object' };
  }
  const store = data as { version?: unknown; events?: unknown };
  if (store.version !== STORE_VERSION) {
    return { ok: false, error: `unsupported version ${String(store.version)}` };
  }
  if (!Array.isArray(store.events)) {
    return { ok: false, error: 'events is not an array' };
  }
  return { ok: true, events: store.events as CalendarEvent[] };
}
```

- [ ] **Step 4: Create `src/data/repository.ts` and `src/data/memoryRepository.ts`**

`src/data/repository.ts`:

```ts
import type { CalendarEvent } from '../core/types';

export interface LoadResult {
  events: CalendarEvent[];
  /** Set when stored data was corrupt: a backup was made and we started fresh. */
  warning?: string;
}

/**
 * The persistence boundary. The store holds canonical state in memory and
 * persists the full list on every change — simple and plenty fast for a
 * personal calendar. Future adapters (SQLite, Google sync) implement this
 * same interface without touching any UI code.
 */
export interface EventRepository {
  load(): Promise<LoadResult>;
  saveAll(events: CalendarEvent[]): Promise<void>;
}
```

`src/data/memoryRepository.ts` (for tests):

```ts
import type { CalendarEvent } from '../core/types';
import type { EventRepository, LoadResult } from './repository';

export class MemoryRepository implements EventRepository {
  constructor(private events: CalendarEvent[] = []) {}

  async load(): Promise<LoadResult> {
    return { events: [...this.events] };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    this.events = [...events];
  }
}
```

- [ ] **Step 5: Write failing tests `src/data/localStorageRepository.test.ts`**

```ts
import { LocalStorageRepository, STORAGE_KEY, BACKUP_KEY } from './localStorageRepository';
import { serializeStore } from './storeFile';
import type { CalendarEvent } from '../core/types';

const event: CalendarEvent = {
  id: 'abc',
  title: 'Dentist',
  date: '2026-06-12',
  recurrence: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

beforeEach(() => localStorage.clear());

describe('LocalStorageRepository', () => {
  it('loads empty on first run', async () => {
    const repo = new LocalStorageRepository();
    expect(await repo.load()).toEqual({ events: [] });
  });

  it('round-trips events', async () => {
    const repo = new LocalStorageRepository();
    await repo.saveAll([event]);
    expect((await repo.load()).events).toEqual([event]);
  });

  it('backs up corrupt data, starts fresh, and warns', async () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt');
    const repo = new LocalStorageRepository();
    const result = await repo.load();
    expect(result.events).toEqual([]);
    expect(result.warning).toContain('backup');
    expect(localStorage.getItem(BACKUP_KEY)).toBe('{corrupt');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps valid data intact', async () => {
    localStorage.setItem(STORAGE_KEY, serializeStore([event]));
    const repo = new LocalStorageRepository();
    const result = await repo.load();
    expect(result.warning).toBeUndefined();
    expect(result.events).toEqual([event]);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/data/localStorageRepository.test.ts`
Expected: FAIL — cannot resolve `./localStorageRepository`.

- [ ] **Step 7: Create `src/data/localStorageRepository.ts`**

```ts
import type { CalendarEvent } from '../core/types';
import type { EventRepository, LoadResult } from './repository';
import { parseStore, serializeStore } from './storeFile';

export const STORAGE_KEY = 'open-calendar.store';
export const BACKUP_KEY = 'open-calendar.store.bak';

/** Browser adapter — used in `npm run dev` outside the Tauri shell. */
export class LocalStorageRepository implements EventRepository {
  async load(): Promise<LoadResult> {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text === null) return { events: [] };
    const parsed = parseStore(text);
    if (parsed.ok) return { events: parsed.events };
    localStorage.setItem(BACKUP_KEY, text);
    localStorage.removeItem(STORAGE_KEY);
    return {
      events: [],
      warning: `Stored data was unreadable (${parsed.error}). A backup was kept; starting fresh.`,
    };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    localStorage.setItem(STORAGE_KEY, serializeStore(events));
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/data`
Expected: PASS (both test files).

- [ ] **Step 9: Update the spec's dev-adapter line**

In `docs/superpowers/specs/2026-06-12-main-screen-design.md`, replace the line
`#   IndexedDbRepository (browser dev mode)` with
`#   LocalStorageRepository (browser dev mode)`.

- [ ] **Step 10: Commit**

```bash
git add src/data docs/superpowers/specs/2026-06-12-main-screen-design.md
git commit -m "feat: versioned store format, repository interface, memory + localStorage adapters"
```

---

### Task 6: Calendar store (Zustand) and UI-overlay store

**Files:**
- Create: `src/app/store.ts`, `src/app/uiStore.ts`
- Test: `src/app/store.test.ts`

- [ ] **Step 1: Write failing tests `src/app/store.test.ts`**

```ts
import { useCalendarStore } from './store';
import { MemoryRepository } from '../data/memoryRepository';
import type { EventRepository } from '../data/repository';

beforeEach(async () => {
  useCalendarStore.setState({ events: [], toast: null, ready: false });
  await useCalendarStore.getState().init(new MemoryRepository());
});

describe('init', () => {
  it('loads events and sets ready', () => {
    expect(useCalendarStore.getState().ready).toBe(true);
    expect(useCalendarStore.getState().events).toEqual([]);
  });

  it('surfaces a load warning as a toast', async () => {
    const repo: EventRepository = {
      load: async () => ({ events: [], warning: 'data was corrupt' }),
      saveAll: async () => {},
    };
    await useCalendarStore.getState().init(repo);
    expect(useCalendarStore.getState().toast).toBe('data was corrupt');
  });
});

describe('addEvent', () => {
  it('adds an event with generated id and timestamps', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist', time: '14:30' });
    const [event] = useCalendarStore.getState().events;
    expect(event.id).toBeTruthy();
    expect(event).toMatchObject({
      title: 'Dentist',
      date: '2026-06-18',
      time: '14:30',
      recurrence: null,
    });
    expect(event.createdAt).toBeTruthy();
  });
});

describe('updateEvent', () => {
  it('patches fields and bumps updatedAt', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().updateEvent(id, {
      title: 'Dentist (moved)',
      recurrence: { unit: 'year', interval: 1 },
    });
    const [event] = useCalendarStore.getState().events;
    expect(event.title).toBe('Dentist (moved)');
    expect(event.recurrence).toEqual({ unit: 'year', interval: 1 });
  });
});

describe('deleteEvent', () => {
  it('removes the event', async () => {
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    const id = useCalendarStore.getState().events[0].id;
    await useCalendarStore.getState().deleteEvent(id);
    expect(useCalendarStore.getState().events).toEqual([]);
  });
});

describe('failed persistence', () => {
  it('rolls back state and shows a toast when saveAll rejects', async () => {
    const repo: EventRepository = {
      load: async () => ({ events: [] }),
      saveAll: async () => {
        throw new Error('disk full');
      },
    };
    await useCalendarStore.getState().init(repo);
    await useCalendarStore.getState().addEvent({ date: '2026-06-18', title: 'Dentist' });
    expect(useCalendarStore.getState().events).toEqual([]);
    expect(useCalendarStore.getState().toast).toContain('not stored');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Create `src/app/store.ts`**

```ts
import { create } from 'zustand';
import type { CalendarEvent, Recurrence } from '../core/types';
import type { EventRepository } from '../data/repository';

export interface NewEventInput {
  date: string;
  title: string;
  time?: string;
}

export interface EventPatch {
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  recurrence?: Recurrence | null;
}

interface CalendarState {
  events: CalendarEvent[];
  toast: string | null;
  ready: boolean;
  init(repo: EventRepository): Promise<void>;
  addEvent(input: NewEventInput): Promise<void>;
  updateEvent(id: string, patch: EventPatch): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  dismissToast(): void;
}

let repository: EventRepository | null = null;

export const useCalendarStore = create<CalendarState>((set, get) => {
  /** Optimistically sets state, persists, rolls back + toasts on failure. */
  async function persist(events: CalendarEvent[]): Promise<void> {
    const previous = get().events;
    set({ events });
    try {
      await repository?.saveAll(events);
    } catch {
      set({ events: previous, toast: 'Saving failed — your change was not stored.' });
    }
  }

  return {
    events: [],
    toast: null,
    ready: false,

    async init(repo) {
      repository = repo;
      const { events, warning } = await repo.load();
      set({ events, ready: true, toast: warning ?? null });
    },

    async addEvent(input) {
      const now = new Date().toISOString();
      const event: CalendarEvent = {
        id: crypto.randomUUID(),
        title: input.title,
        date: input.date,
        time: input.time,
        recurrence: null,
        createdAt: now,
        updatedAt: now,
      };
      await persist([...get().events, event]);
    },

    async updateEvent(id, patch) {
      await persist(
        get().events.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
        ),
      );
    },

    async deleteEvent(id) {
      await persist(get().events.filter((e) => e.id !== id));
    },

    dismissToast() {
      set({ toast: null });
    },
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/app/uiStore.ts`** (which overlay is open, anchored to which element — cross-feature coordination lives here, so features stay decoupled)

```ts
import { create } from 'zustand';

export interface QuickEntryTarget {
  date: string;
  anchorEl: Element;
}

export interface EditorTarget {
  eventId: string;
  anchorEl: Element;
}

interface UiState {
  quickEntry: QuickEntryTarget | null;
  editor: EditorTarget | null;
  openQuickEntry(date: string, anchorEl: Element): void;
  openEditor(eventId: string, anchorEl: Element): void;
  closeOverlays(): void;
}

export const useUiStore = create<UiState>((set) => ({
  quickEntry: null,
  editor: null,
  openQuickEntry: (date, anchorEl) => set({ quickEntry: { date, anchorEl }, editor: null }),
  openEditor: (eventId, anchorEl) => set({ editor: { eventId, anchorEl }, quickEntry: null }),
  closeOverlays: () => set({ quickEntry: null, editor: null }),
}));
```

- [ ] **Step 6: Verify everything still compiles and passes**

Run: `npm test`
Expected: PASS — all test files so far.

- [ ] **Step 7: Commit**

```bash
git add src/app
git commit -m "feat: calendar store with optimistic persistence + UI overlay store"
```

### Task 7: UI primitives and layout shell

**Files:**
- Create: `src/ui/AnchoredPopover.tsx`, `src/ui/popover.css`
- Create: `src/app/panels.tsx`, `src/app/MainScreen.tsx`, `src/app/mainScreen.css`

- [ ] **Step 1: Create `src/ui/AnchoredPopover.tsx`** (the one popover used by quick-entry and the editor; Floating UI flips it left when there's no room on the right, so it never covers the anchor)

```tsx
import type { ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react';
import './popover.css';

interface AnchoredPopoverProps {
  anchorEl: Element;
  onClose(): void;
  children: ReactNode;
  placement?: Placement;
}

export function AnchoredPopover({
  anchorEl,
  onClose,
  children,
  placement = 'right',
}: AnchoredPopoverProps) {
  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    placement,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="popover"
        {...getFloatingProps()}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}
```

- [ ] **Step 2: Create `src/ui/popover.css`**

```css
.popover {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  padding: var(--space-3);
  min-width: 260px;
  z-index: 100;
}
```

- [ ] **Step 3: Create `src/app/panels.tsx`** (panel registry + layout config — this is the spec's "reordering panels is a config change". Placeholders for now; Tasks 8–12 swap in the real components.)

```tsx
import type { ComponentType } from 'react';

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 16, color: 'var(--color-text-faint)' }}>{name}</div>;
}

const UpcomingStackPlaceholder = () => <Placeholder name="Upcoming" />;
const YearCirclePlaceholder = () => <Placeholder name="Year circle" />;
const MonthGridPlaceholder = () => <Placeholder name="Month grid" />;

export type PanelId = 'upcoming-stack' | 'year-circle' | 'month-grid';

export const panelRegistry: Record<PanelId, ComponentType> = {
  'upcoming-stack': UpcomingStackPlaceholder,
  'year-circle': YearCirclePlaceholder,
  'month-grid': MonthGridPlaceholder,
};

export interface LayoutConfig {
  sidebar: { top: PanelId; bottom: PanelId };
  main: PanelId;
}

export const defaultLayout: LayoutConfig = {
  sidebar: { top: 'upcoming-stack', bottom: 'year-circle' },
  main: 'month-grid',
};
```

- [ ] **Step 4: Create `src/app/MainScreen.tsx`**

```tsx
import { defaultLayout, panelRegistry, type LayoutConfig } from './panels';
import './mainScreen.css';

export function MainScreen({ layout = defaultLayout }: { layout?: LayoutConfig }) {
  const Top = panelRegistry[layout.sidebar.top];
  const Bottom = panelRegistry[layout.sidebar.bottom];
  const Main = panelRegistry[layout.main];
  return (
    <div className="main-screen">
      <aside className="sidebar">
        <section className="sidebar-top">
          <Top />
        </section>
        <section className="sidebar-bottom">
          <Bottom />
        </section>
      </aside>
      <main className="main-panel">
        <Main />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/app/mainScreen.css`** (the 30/70 and 50/50 splits with hairline dividers)

```css
.main-screen {
  display: grid;
  grid-template-columns: 30% 1fr;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  display: grid;
  grid-template-rows: 50% 50%;
  border-right: 1px solid var(--color-border);
  min-width: 0;
}

.sidebar-top {
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
  min-height: 0;
}

.sidebar-bottom {
  overflow: hidden;
  min-height: 0;
}

.main-panel {
  overflow: hidden;
  min-width: 0;
}

.panel-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  padding: var(--space-4) var(--space-4) var(--space-2);
}
```

- [ ] **Step 6: Wire `src/App.tsx` to render the shell** (still without data init — Task 13 finishes App)

```tsx
import { MainScreen } from './app/MainScreen';

export default function App() {
  return <MainScreen />;
}
```

- [ ] **Step 7: Verify visually**

Run: `npm run dev`, open the printed URL in a browser.
Expected: 30/70 split with hairline dividers, "Upcoming" / "Year circle" / "Month grid" placeholder labels in their slots. Stop the dev server after checking.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/app src/App.tsx
git commit -m "feat: anchored popover primitive and 30/70 layout shell with panel registry"
```

---

### Task 8: Month grid

**Files:**
- Create: `src/features/month-grid/grid.ts`, `src/features/month-grid/MonthGrid.tsx`, `src/features/month-grid/monthGrid.css`
- Modify: `src/app/panels.tsx` (swap in real component)
- Test: `src/features/month-grid/grid.test.ts`, `src/features/month-grid/MonthGrid.test.tsx`

- [ ] **Step 1: Write failing tests `src/features/month-grid/grid.test.ts`**

```ts
import type { CalendarEvent } from '../../core/types';
import { buildMonthGrid, groupOccurrences, shiftMonth } from './grid';

describe('buildMonthGrid', () => {
  it('returns 42 cells starting on the Monday on/before the 1st', () => {
    // June 2026 starts on a Monday.
    const cells = buildMonthGrid(2026, 6, '2026-06-12');
    expect(cells).toHaveLength(42);
    expect(cells[0].date).toBe('2026-06-01');
    expect(cells[29].date).toBe('2026-06-30');
    expect(cells[30].date).toBe('2026-07-01');
  });

  it('pads the first week when the month starts mid-week', () => {
    // Oct 1, 2026 is a Thursday -> grid starts Mon Sep 28.
    const cells = buildMonthGrid(2026, 10, '2026-06-12');
    expect(cells[0].date).toBe('2026-09-28');
    expect(cells[0].inMonth).toBe(false);
    expect(cells[3].date).toBe('2026-10-01');
    expect(cells[3].inMonth).toBe(true);
  });

  it('marks today', () => {
    const cells = buildMonthGrid(2026, 6, '2026-06-12');
    const today = cells.find((c) => c.isToday);
    expect(today?.date).toBe('2026-06-12');
  });
});

describe('shiftMonth', () => {
  it('moves forward across a year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });
  it('moves backward across a year boundary', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('groupOccurrences', () => {
  const base = {
    recurrence: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  it('maps dates to events, all-day first then by time', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Late', date: '2026-06-12', time: '18:00', recurrence: null },
      { ...base, id: '2', title: 'AllDay', date: '2026-06-12', recurrence: null },
      { ...base, id: '3', title: 'Early', date: '2026-06-12', time: '08:00', recurrence: null },
    ];
    const map = groupOccurrences(events, '2026-06-01', '2026-06-30');
    expect(map.get('2026-06-12')!.map((e) => e.title)).toEqual(['AllDay', 'Early', 'Late']);
  });
  it('includes recurring occurrences', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Gym', date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } },
    ];
    const map = groupOccurrences(events, '2026-06-01', '2026-06-30');
    expect(map.get('2026-06-08')!.map((e) => e.title)).toEqual(['Gym']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/month-grid/grid.test.ts`
Expected: FAIL — cannot resolve `./grid`.

- [ ] **Step 3: Create `src/features/month-grid/grid.ts`**

```ts
import { addDays, pad2, parseISODate } from '../../core/dates';
import { expandOccurrences } from '../../core/occurrences';
import type { CalendarEvent } from '../../core/types';

export interface DayCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

export interface MonthView {
  year: number;
  month: number; // 1-12
}

/** 42 cells (6 weeks), Monday-start, covering the given month. */
export function buildMonthGrid(year: number, month: number, today: string): DayCell[] {
  const first = `${year}-${pad2(month)}-01`;
  const mondayOffset = (parseISODate(first).getDay() + 6) % 7; // Monday = 0
  const start = addDays(first, -mondayOffset);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    const [y, m, d] = date.split('-').map(Number);
    cells.push({ date, day: d, inMonth: y === year && m === month, isToday: date === today });
  }
  return cells;
}

export function shiftMonth(view: MonthView, delta: number): MonthView {
  const total = view.year * 12 + (view.month - 1) + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
}

/** date -> events occurring that day, sorted all-day first then by time. */
export function groupOccurrences(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const date of expandOccurrences(event, rangeStart, rangeEnd)) {
      const list = map.get(date) ?? [];
      list.push(event);
      map.set(date, list);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  }
  return map;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/month-grid/grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/features/month-grid/MonthGrid.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { todayISO } from '../../core/dates';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { buildMonthGrid, groupOccurrences, shiftMonth, type MonthView } from './grid';
import './monthGrid.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

export function MonthGrid() {
  const today = todayISO();
  const [view, setView] = useState<MonthView>(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const events = useCalendarStore((s) => s.events);
  const openQuickEntry = useUiStore((s) => s.openQuickEntry);
  const openEditor = useUiStore((s) => s.openEditor);

  const cells = useMemo(() => buildMonthGrid(view.year, view.month, today), [view, today]);
  const byDate = useMemo(
    () => groupOccurrences(events, cells[0].date, cells[41].date),
    [events, cells],
  );

  return (
    <div className="month-grid">
      <header className="month-header">
        <h1 className="month-title">
          {MONTH_NAMES[view.month - 1]} <span className="month-year">{view.year}</span>
        </h1>
        <nav className="month-nav">
          <button onClick={() => setView(shiftMonth(view, -1))} aria-label="Previous month">‹</button>
          <button
            onClick={() =>
              setView({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })
            }
          >
            today
          </button>
          <button onClick={() => setView(shiftMonth(view, 1))} aria-label="Next month">›</button>
        </nav>
      </header>
      <div className="weekday-row">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="month-cells">
        {cells.map((cell) => {
          const dayEvents = byDate.get(cell.date) ?? [];
          return (
            <div
              key={cell.date}
              className={
                'day-tile' +
                (cell.inMonth ? '' : ' day-tile-muted') +
                (cell.isToday ? ' day-tile-today' : '')
              }
              onClick={(e) => openQuickEntry(cell.date, e.currentTarget)}
            >
              <span className="day-number">{cell.day}</span>
              {dayEvents.slice(0, MAX_CHIPS).map((event) => (
                <button
                  key={event.id}
                  className={'event-chip' + (event.time ? '' : ' event-chip-allday')}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditor(event.id, e.currentTarget);
                  }}
                >
                  {event.time ? `${event.time} ` : ''}
                  {event.title}
                </button>
              ))}
              {dayEvents.length > MAX_CHIPS && (
                <span className="event-more">+{dayEvents.length - MAX_CHIPS} more</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/features/month-grid/monthGrid.css`**

```css
.month-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--space-4) var(--space-5);
}

.month-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.month-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.month-year {
  color: var(--color-text-secondary);
  font-weight: 400;
}

.month-nav button {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}

.month-nav button:hover {
  color: var(--color-text);
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  font-size: 10px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-1);
}

.weekday-row > div {
  padding: var(--space-1);
}

.month-cells {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: var(--space-1);
  min-height: 0;
}

.day-tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  font-size: 12px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
}

.day-tile:hover {
  border-color: var(--color-border-strong);
}

.day-tile-muted {
  background: var(--color-muted-bg);
}

.day-tile-muted .day-number {
  color: var(--color-text-faint);
}

.day-tile-today {
  border: 2px solid var(--color-accent);
}

.day-tile-today .day-number {
  font-weight: 700;
}

.event-chip {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border: none;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-chip-allday {
  background: var(--color-muted-bg);
  color: var(--color-text);
}

.event-more {
  font-size: 9px;
  color: var(--color-text-faint);
}
```

- [ ] **Step 7: Register the real panel in `src/app/panels.tsx`**

Replace the `MonthGridPlaceholder` line and registry entry:

```tsx
import { MonthGrid } from '../features/month-grid/MonthGrid';
```

…and in `panelRegistry`:

```tsx
  'month-grid': MonthGrid,
```

Delete the now-unused `MonthGridPlaceholder`.

- [ ] **Step 8: Write failing component test `src/features/month-grid/MonthGrid.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MonthGrid } from './MonthGrid';
import { useCalendarStore } from '../../app/store';
import { MemoryRepository } from '../../data/memoryRepository';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 12)); // June 12, 2026
  await useCalendarStore.getState().init(
    new MemoryRepository([
      {
        id: 'e1',
        title: 'Dentist',
        date: '2026-06-12',
        time: '14:30',
        recurrence: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]),
  );
});

afterEach(() => vi.useRealTimers());

describe('MonthGrid', () => {
  it('shows the current month title', () => {
    render(<MonthGrid />);
    expect(screen.getByText('June')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('renders 42 day tiles with adjacent-month days muted', () => {
    const { container } = render(<MonthGrid />);
    expect(container.querySelectorAll('.day-tile')).toHaveLength(42);
    // June 2026 grid runs Jun 1 – Jul 12: 12 July days are muted.
    expect(container.querySelectorAll('.day-tile-muted')).toHaveLength(12);
  });

  it('highlights today', () => {
    const { container } = render(<MonthGrid />);
    expect(container.querySelectorAll('.day-tile-today')).toHaveLength(1);
  });

  it('renders event chips with time', () => {
    render(<MonthGrid />);
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
    expect(screen.getByText(/Dentist/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run the component test**

Run: `npx vitest run src/features/month-grid`
Expected: PASS (both files).

- [ ] **Step 10: Verify visually**

Run: `npm run dev`, open in browser.
Expected: month grid fills the right 70%: current month white, adjacent days gray, today outlined in blue, ‹/today/› navigation works. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add src/features/month-grid src/app/panels.tsx
git commit -m "feat: month grid with muted adjacent months, today highlight, event chips"
```

### Task 9: Quick entry

**Files:**
- Create: `src/features/quick-entry/QuickEntryHost.tsx`, `src/features/quick-entry/quickEntry.css`
- Test: `src/features/quick-entry/QuickEntryHost.test.tsx`

- [ ] **Step 1: Create `src/features/quick-entry/QuickEntryHost.tsx`** (single input; live parse preview shows the time chip; Enter saves, Esc/outside-click cancels via AnchoredPopover)

```tsx
import { useState } from 'react';
import { friendlyDate, todayISO } from '../../core/dates';
import { parseQuickEntry } from '../../core/timeParser';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import './quickEntry.css';

export function QuickEntryHost() {
  const target = useUiStore((s) => s.quickEntry);
  if (!target) return null;
  // key remounts the form (fresh input) when the user clicks another day
  return <QuickEntryForm key={target.date} date={target.date} anchorEl={target.anchorEl} />;
}

function QuickEntryForm({ date, anchorEl }: { date: string; anchorEl: Element }) {
  const close = useUiStore((s) => s.closeOverlays);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const [value, setValue] = useState('');
  const parsed = parseQuickEntry(value);
  const canSave = parsed.title.length > 0;

  async function submit() {
    if (!canSave) return;
    await addEvent({ date, title: parsed.title, time: parsed.time ?? undefined });
    close();
  }

  return (
    <AnchoredPopover anchorEl={anchorEl} onClose={close}>
      <div className="quick-entry">
        <input
          className="quick-entry-input"
          autoFocus
          placeholder="14 30 Dentist — or just a title"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <div className="quick-entry-preview">
          {parsed.time ? (
            <span className="time-chip">{parsed.time}</span>
          ) : (
            <span className="time-chip time-chip-allday">all-day</span>
          )}
          <span className="quick-entry-title-preview">
            {parsed.title || <em>title…</em>}
          </span>
        </div>
        <div className="quick-entry-hint">
          {friendlyDate(date, undefined, todayISO())} · Enter to save · Esc to cancel
        </div>
      </div>
    </AnchoredPopover>
  );
}
```

- [ ] **Step 2: Create `src/features/quick-entry/quickEntry.css`**

```css
.quick-entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 280px;
}

.quick-entry-input {
  font-family: inherit;
  font-size: 13px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  outline: none;
}

.quick-entry-preview {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  min-height: 20px;
}

.time-chip {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-radius: 4px;
  padding: 1px 6px;
  font-weight: 600;
  font-size: 11px;
}

.time-chip-allday {
  background: var(--color-muted-bg);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.quick-entry-title-preview em {
  color: var(--color-text-faint);
}

.quick-entry-hint {
  font-size: 10px;
  color: var(--color-text-faint);
}
```

- [ ] **Step 3: Write failing component test `src/features/quick-entry/QuickEntryHost.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickEntryHost } from './QuickEntryHost';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';

beforeEach(async () => {
  await useCalendarStore.getState().init(new MemoryRepository());
  useUiStore.setState({ quickEntry: { date: '2026-06-18', anchorEl: document.body }, editor: null });
});

describe('QuickEntryHost', () => {
  it('creates a timed event from "HH MM title" + Enter', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), '14 30 Dentist{Enter}');
    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Dentist',
      time: '14:30',
      date: '2026-06-18',
      recurrence: null,
    });
  });

  it('creates an all-day event from plain text', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), 'Buy flowers{Enter}');
    const events = useCalendarStore.getState().events;
    expect(events).toHaveLength(1);
    expect(events[0].time).toBeUndefined();
    expect(events[0].title).toBe('Buy flowers');
  });

  it('shows a live time chip while typing', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), '9 00 Standup');
    expect(screen.getByText('09:00')).toBeInTheDocument();
  });

  it('does not save an empty title', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), '14 30{Enter}');
    expect(useCalendarStore.getState().events).toHaveLength(0);
  });

  it('closes the popover after saving', async () => {
    render(<QuickEntryHost />);
    await userEvent.type(screen.getByRole('textbox'), 'Buy flowers{Enter}');
    expect(useUiStore.getState().quickEntry).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/quick-entry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-entry
git commit -m "feat: quick-entry popover with live time parsing"
```

---

### Task 10: Event editor

**Files:**
- Create: `src/features/event-editor/EventEditorHost.tsx`, `src/features/event-editor/eventEditor.css`
- Test: `src/features/event-editor/EventEditorHost.test.tsx`

- [ ] **Step 1: Create `src/features/event-editor/EventEditorHost.tsx`**

```tsx
import { useState } from 'react';
import type { Recurrence } from '../../core/types';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import './eventEditor.css';

type RecurrenceUnit = Recurrence['unit'] | 'never';

const UNIT_LABELS: Record<Exclude<RecurrenceUnit, 'never'>, string> = {
  week: 'weeks',
  month: 'months',
  year: 'years',
};

export function EventEditorHost() {
  const target = useUiStore((s) => s.editor);
  if (!target) return null;
  return <EventEditorForm key={target.eventId} eventId={target.eventId} anchorEl={target.anchorEl} />;
}

function EventEditorForm({ eventId, anchorEl }: { eventId: string; anchorEl: Element }) {
  const close = useUiStore((s) => s.closeOverlays);
  const event = useCalendarStore((s) => s.events.find((e) => e.id === eventId));
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [unit, setUnit] = useState<RecurrenceUnit>(event?.recurrence?.unit ?? 'never');
  const [interval, setIntervalValue] = useState(event?.recurrence?.interval ?? 1);

  if (!event) return null;

  async function save() {
    if (!title.trim()) return;
    await useCalendarStore.getState().updateEvent(eventId, {
      title: title.trim(),
      date,
      time: time || undefined,
      description: description.trim() || undefined,
      recurrence:
        unit === 'never' ? null : { unit, interval: Math.max(1, Math.floor(interval) || 1) },
    });
    close();
  }

  async function remove() {
    await useCalendarStore.getState().deleteEvent(eventId);
    close();
  }

  return (
    <AnchoredPopover anchorEl={anchorEl} onClose={close}>
      <div className="event-editor">
        <input
          className="editor-title"
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <div className="editor-row">
          <input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="time"
            aria-label="Time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <textarea
          aria-label="Description"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="editor-row">
          <label className="editor-label">
            Repeats
            <select
              aria-label="Repeats"
              value={unit}
              onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
            >
              <option value="never">never</option>
              <option value="week">weekly</option>
              <option value="month">monthly</option>
              <option value="year">yearly</option>
            </select>
          </label>
          {unit !== 'never' && (
            <label className="editor-label">
              every
              <input
                type="number"
                aria-label="Interval"
                min={1}
                value={interval}
                onChange={(e) => setIntervalValue(Number(e.target.value))}
              />
              {UNIT_LABELS[unit]}
            </label>
          )}
        </div>
        <div className="editor-actions">
          <button className="editor-delete" onClick={() => void remove()}>
            Delete
          </button>
          <button className="editor-save" onClick={() => void save()} disabled={!title.trim()}>
            Save
          </button>
        </div>
      </div>
    </AnchoredPopover>
  );
}
```

- [ ] **Step 2: Create `src/features/event-editor/eventEditor.css`**

```css
.event-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 300px;
}

.event-editor input,
.event-editor textarea,
.event-editor select {
  font-family: inherit;
  font-size: 13px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  outline-color: var(--color-accent);
}

.editor-title {
  font-weight: 600;
}

.editor-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.editor-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 12px;
  color: var(--color-text-secondary);
}

.editor-label input[type='number'] {
  width: 52px;
}

.editor-actions {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-1);
}

.editor-save {
  background: var(--color-text);
  color: var(--color-surface);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}

.editor-save:disabled {
  opacity: 0.4;
  cursor: default;
}

.editor-delete {
  background: none;
  border: none;
  color: var(--color-danger);
  cursor: pointer;
  padding: var(--space-1) 0;
}
```

- [ ] **Step 3: Write failing component test `src/features/event-editor/EventEditorHost.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventEditorHost } from './EventEditorHost';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { MemoryRepository } from '../../data/memoryRepository';

beforeEach(async () => {
  await useCalendarStore.getState().init(
    new MemoryRepository([
      {
        id: 'e1',
        title: 'Dentist',
        date: '2026-06-12',
        time: '14:30',
        recurrence: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]),
  );
  useUiStore.setState({ editor: { eventId: 'e1', anchorEl: document.body }, quickEntry: null });
});

describe('EventEditorHost', () => {
  it('prefills the form from the event', () => {
    render(<EventEditorHost />);
    expect(screen.getByLabelText('Title')).toHaveValue('Dentist');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-06-12');
    expect(screen.getByLabelText('Time')).toHaveValue('14:30');
  });

  it('saves edits including description and recurrence', async () => {
    render(<EventEditorHost />);
    await userEvent.type(screen.getByLabelText('Description'), 'Bring insurance card');
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'year');
    await userEvent.click(screen.getByText('Save'));
    const [event] = useCalendarStore.getState().events;
    expect(event.description).toBe('Bring insurance card');
    expect(event.recurrence).toEqual({ unit: 'year', interval: 1 });
    expect(useUiStore.getState().editor).toBeNull();
  });

  it('sets the recurrence interval', async () => {
    render(<EventEditorHost />);
    await userEvent.selectOptions(screen.getByLabelText('Repeats'), 'week');
    const intervalInput = screen.getByLabelText('Interval');
    await userEvent.clear(intervalInput);
    await userEvent.type(intervalInput, '2');
    await userEvent.click(screen.getByText('Save'));
    expect(useCalendarStore.getState().events[0].recurrence).toEqual({
      unit: 'week',
      interval: 2,
    });
  });

  it('deletes the event (whole series)', async () => {
    render(<EventEditorHost />);
    await userEvent.click(screen.getByText('Delete'));
    expect(useCalendarStore.getState().events).toEqual([]);
    expect(useUiStore.getState().editor).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/event-editor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/event-editor
git commit -m "feat: event editor with description, recurrence control, delete"
```

### Task 11: Upcoming stack

**Files:**
- Create: `src/features/upcoming-stack/upcoming.ts`, `src/features/upcoming-stack/UpcomingStack.tsx`, `src/features/upcoming-stack/upcomingStack.css`
- Modify: `src/app/panels.tsx`
- Test: `src/features/upcoming-stack/upcoming.test.ts`

- [ ] **Step 1: Write failing tests `src/features/upcoming-stack/upcoming.test.ts`**

```ts
import type { CalendarEvent } from '../../core/types';
import { buildUpcoming } from './upcoming';

const base = {
  recurrence: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildUpcoming', () => {
  const today = '2026-06-12';

  it('lists future one-time events sorted soonest-first', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Later', date: '2026-06-20', recurrence: null },
      { ...base, id: '2', title: 'Sooner', date: '2026-06-13', recurrence: null },
    ];
    expect(buildUpcoming(events, today).map((i) => i.event.title)).toEqual(['Sooner', 'Later']);
  });

  it('excludes past one-time events but includes today', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Past', date: '2026-06-01', recurrence: null },
      { ...base, id: '2', title: 'Today', date: '2026-06-12', recurrence: null },
    ];
    expect(buildUpcoming(events, today).map((i) => i.event.title)).toEqual(['Today']);
  });

  it('lists only the NEXT occurrence of a recurring event', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Gym', date: '2026-06-01', recurrence: { unit: 'week', interval: 1 } },
    ];
    const items = buildUpcoming(events, today);
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-06-15');
  });

  it('sorts same-day events all-day first, then by time', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Timed', date: '2026-06-13', time: '09:00', recurrence: null },
      { ...base, id: '2', title: 'AllDay', date: '2026-06-13', recurrence: null },
    ];
    expect(buildUpcoming(events, today).map((i) => i.event.title)).toEqual(['AllDay', 'Timed']);
  });

  it('respects the horizon', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Far', date: '2028-01-01', recurrence: null },
    ];
    expect(buildUpcoming(events, today, 365)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/upcoming-stack`
Expected: FAIL — cannot resolve `./upcoming`.

- [ ] **Step 3: Create `src/features/upcoming-stack/upcoming.ts`**

```ts
import { addDays } from '../../core/dates';
import { nextOccurrence } from '../../core/occurrences';
import type { CalendarEvent } from '../../core/types';

export interface UpcomingItem {
  event: CalendarEvent;
  /** The concrete occurrence date shown in the list. */
  date: string;
}

/**
 * One-time events: every future occurrence. Recurring events: only the next
 * one (so a weekly event doesn't flood the stack). Sorted soonest-first;
 * all-day before timed within a day.
 */
export function buildUpcoming(
  events: CalendarEvent[],
  today: string,
  horizonDays = 365,
): UpcomingItem[] {
  const end = addDays(today, horizonDays);
  const items: UpcomingItem[] = [];
  for (const event of events) {
    const date = event.recurrence
      ? nextOccurrence(event, today)
      : event.date >= today
        ? event.date
        : null;
    if (date && date <= end) items.push({ event, date });
  }
  const sortKey = (i: UpcomingItem) => `${i.date}T${i.event.time ?? ''}`;
  return items.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/upcoming-stack`
Expected: PASS.

- [ ] **Step 5: Create `src/features/upcoming-stack/UpcomingStack.tsx`**

```tsx
import { useMemo } from 'react';
import { friendlyDate, todayISO } from '../../core/dates';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { buildUpcoming } from './upcoming';
import './upcomingStack.css';

export function UpcomingStack() {
  const events = useCalendarStore((s) => s.events);
  const openEditor = useUiStore((s) => s.openEditor);
  const today = todayISO();
  const items = useMemo(() => buildUpcoming(events, today), [events, today]);

  return (
    <div className="upcoming-panel">
      <div className="panel-label">Upcoming</div>
      <div className="upcoming-list">
        {items.length === 0 && (
          <div className="upcoming-empty">No upcoming events — click a day to add one.</div>
        )}
        {items.map(({ event, date }) => (
          <button
            key={`${event.id}-${date}`}
            className="upcoming-card"
            onClick={(e) => openEditor(event.id, e.currentTarget)}
          >
            <div className="upcoming-title">{event.title}</div>
            <div className="upcoming-date">{friendlyDate(date, event.time, today)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/features/upcoming-stack/upcomingStack.css`**

```css
.upcoming-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.upcoming-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-4);
}

.upcoming-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  text-align: left;
  cursor: pointer;
  flex-shrink: 0;
}

.upcoming-card:hover {
  border-color: var(--color-border-strong);
}

.upcoming-title {
  font-size: 13px;
  font-weight: 600;
}

.upcoming-date {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.upcoming-empty {
  font-size: 12px;
  color: var(--color-text-faint);
  padding: var(--space-2) 0;
}
```

- [ ] **Step 7: Register the real panel in `src/app/panels.tsx`**

Add the import, point the registry entry at it, delete `UpcomingStackPlaceholder`:

```tsx
import { UpcomingStack } from '../features/upcoming-stack/UpcomingStack';
```

```tsx
  'upcoming-stack': UpcomingStack,
```

- [ ] **Step 8: Commit**

```bash
git add src/features/upcoming-stack src/app/panels.tsx
git commit -m "feat: upcoming-events stack with next-occurrence logic"
```

---

### Task 12: Year circle

**Files:**
- Create: `src/features/year-circle/circle.ts`, `src/features/year-circle/YearCircle.tsx`, `src/features/year-circle/yearCircle.css`
- Modify: `src/app/panels.tsx`
- Test: `src/features/year-circle/circle.test.ts`

- [ ] **Step 1: Write failing tests `src/features/year-circle/circle.test.ts`**

```ts
import type { CalendarEvent } from '../../core/types';
import { computeYearDots } from './circle';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('computeYearDots', () => {
  it('includes only yearly-recurring events', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Contract', date: '2026-04-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'Weekly gym', date: '2026-04-01', recurrence: { unit: 'week', interval: 1 } },
      { ...base, id: '3', title: 'One-off', date: '2026-04-01', recurrence: null },
    ];
    const dots = computeYearDots(events, 2026, 100);
    expect(dots).toHaveLength(1);
    expect(dots[0].title).toBe('Contract');
  });

  it('places Jan 1 at angle 0 and advances clockwise', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'NY', date: '2026-01-01', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'Mid', date: '2026-07-02', recurrence: { unit: 'year', interval: 1 } },
    ];
    const dots = computeYearDots(events, 2026, 100);
    expect(dots[0].angle).toBeCloseTo(0);
    // Jul 2 is day 183 of 365 — almost exactly half the year.
    expect(dots[1].angle).toBeCloseTo(Math.PI, 1);
  });

  it('offsets near-coincident dots radially so none is hidden', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'A', date: '2026-05-10', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '2', title: 'B', date: '2026-05-11', recurrence: { unit: 'year', interval: 1 } },
      { ...base, id: '3', title: 'C', date: '2026-09-01', recurrence: { unit: 'year', interval: 1 } },
    ];
    const dots = computeYearDots(events, 2026, 100);
    const may10 = dots.find((d) => d.date === '2026-05-10')!;
    const may11 = dots.find((d) => d.date === '2026-05-11')!;
    const sep = dots.find((d) => d.date === '2026-09-01')!;
    expect(may10.radius).toBe(100);
    expect(may11.radius).toBeLessThan(100);
    expect(sep.radius).toBe(100);
  });

  it('skips a yearly event whose interval misses this year', () => {
    const events: CalendarEvent[] = [
      { ...base, id: '1', title: 'Biennial', date: '2025-06-01', recurrence: { unit: 'year', interval: 2 } },
    ];
    expect(computeYearDots(events, 2026, 100)).toEqual([]);
    expect(computeYearDots(events, 2027, 100)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/year-circle`
Expected: FAIL — cannot resolve `./circle`.

- [ ] **Step 3: Create `src/features/year-circle/circle.ts`**

```ts
import { dayOfYear, daysInYear } from '../../core/dates';
import { expandOccurrences } from '../../core/occurrences';
import type { CalendarEvent } from '../../core/types';

export interface CircleDot {
  eventId: string;
  date: string;
  title: string;
  /** Radians. 0 = Jan 1 at the top, increasing clockwise. */
  angle: number;
  /** Dots within 3 days of the previous dot step inward so none is hidden. */
  radius: number;
}

const NEAR_DAYS = 3;
const RADIAL_STEP = 10;

export function computeYearDots(
  events: CalendarEvent[],
  year: number,
  baseRadius: number,
): CircleDot[] {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const dots: CircleDot[] = [];
  for (const event of events) {
    if (event.recurrence?.unit !== 'year') continue;
    for (const date of expandOccurrences(event, start, end)) {
      dots.push({ eventId: event.id, date, title: event.title, angle: 0, radius: baseRadius });
    }
  }
  dots.sort((a, b) => a.date.localeCompare(b.date));

  const total = daysInYear(year);
  let prevDay = Number.NEGATIVE_INFINITY;
  let level = 0;
  for (const dot of dots) {
    const doy = dayOfYear(dot.date);
    level = doy - prevDay <= NEAR_DAYS ? level + 1 : 0;
    prevDay = doy;
    dot.angle = (2 * Math.PI * (doy - 1)) / total;
    dot.radius = baseRadius - level * RADIAL_STEP;
  }
  return dots;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/year-circle`
Expected: PASS.

- [ ] **Step 5: Create `src/features/year-circle/YearCircle.tsx`**

```tsx
import { useMemo } from 'react';
import { dayOfYear, daysInYear, todayISO } from '../../core/dates';
import { useCalendarStore } from '../../app/store';
import { useUiStore } from '../../app/uiStore';
import { computeYearDots } from './circle';
import './yearCircle.css';

const CENTER = 120;
const RING_RADIUS = 100;

/** SVG position for an angle (0 = top, clockwise) at a given radius. */
function dotPosition(angle: number, radius: number) {
  return { cx: CENTER + radius * Math.sin(angle), cy: CENTER - radius * Math.cos(angle) };
}

const MONTH_TICKS = [
  { label: 'Jan', angle: 0 },
  { label: 'Apr', angle: Math.PI / 2 },
  { label: 'Jul', angle: Math.PI },
  { label: 'Oct', angle: (3 * Math.PI) / 2 },
];

export function YearCircle() {
  const events = useCalendarStore((s) => s.events);
  const openEditor = useUiStore((s) => s.openEditor);
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const dots = useMemo(() => computeYearDots(events, year, RING_RADIUS), [events, year]);
  const todayAngle = (2 * Math.PI * (dayOfYear(today) - 1)) / daysInYear(year);
  const todayPos = dotPosition(todayAngle, RING_RADIUS);

  return (
    <div className="year-circle-panel">
      <div className="panel-label">Year · cyclical</div>
      <div className="year-circle-body">
        <svg viewBox="0 0 240 240" className="year-circle-svg">
          <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} className="year-ring" />
          {MONTH_TICKS.map(({ label, angle }) => {
            const pos = dotPosition(angle, RING_RADIUS + 12);
            return (
              <text key={label} x={pos.cx} y={pos.cy + 3} className="month-tick">
                {label}
              </text>
            );
          })}
          <circle cx={todayPos.cx} cy={todayPos.cy} r={3} className="today-marker" />
          {dots.map((dot) => {
            const pos = dotPosition(dot.angle, dot.radius);
            return (
              <circle
                key={`${dot.eventId}-${dot.date}`}
                cx={pos.cx}
                cy={pos.cy}
                r={5}
                className="year-dot"
                onClick={(e) => openEditor(dot.eventId, e.currentTarget)}
              >
                <title>{`${dot.title} · ${dot.date}`}</title>
              </circle>
            );
          })}
          <text x={CENTER} y={CENTER + 6} className="year-label">
            {year}
          </text>
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/features/year-circle/yearCircle.css`**

```css
.year-circle-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.year-circle-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: var(--space-2) var(--space-4) var(--space-4);
}

.year-circle-svg {
  height: 100%;
  max-height: 280px;
  max-width: 100%;
}

.year-ring {
  fill: none;
  stroke: var(--color-border);
  stroke-width: 1.5;
}

.month-tick {
  fill: var(--color-text-faint);
  font-size: 9px;
  text-anchor: middle;
}

.today-marker {
  fill: var(--color-accent);
}

.year-dot {
  fill: var(--color-text);
  cursor: pointer;
}

.year-dot:hover {
  fill: var(--color-accent);
}

.year-label {
  fill: var(--color-text);
  font-size: 16px;
  font-weight: 600;
  text-anchor: middle;
}
```

- [ ] **Step 7: Register the real panel in `src/app/panels.tsx`**

Add the import, point the registry entry at it, delete `YearCirclePlaceholder` and the now-unused `Placeholder` helper:

```tsx
import { YearCircle } from '../features/year-circle/YearCircle';
```

```tsx
  'year-circle': YearCircle,
```

- [ ] **Step 8: Commit**

```bash
git add src/features/year-circle src/app/panels.tsx
git commit -m "feat: year circle with yearly-event dots and today marker"
```

### Task 13: App wiring, toast, full verification

**Files:**
- Create: `src/ui/Toast.tsx`, `src/ui/toast.css`, `src/data/createRepository.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/ui/Toast.tsx`**

```tsx
import { useEffect } from 'react';
import { useCalendarStore } from '../app/store';
import './toast.css';

export function Toast() {
  const toast = useCalendarStore((s) => s.toast);
  const dismiss = useCalendarStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, 6000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" onClick={dismiss}>
      {toast}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/ui/toast.css`**

```css
.toast {
  position: fixed;
  bottom: var(--space-5);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-text);
  color: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
  box-shadow: var(--shadow-popover);
  cursor: pointer;
  z-index: 200;
  max-width: 480px;
}
```

- [ ] **Step 3: Create `src/data/createRepository.ts`** (platform detection — the Tauri adapter slots in here in Task 14)

```ts
import type { EventRepository } from './repository';
import { LocalStorageRepository } from './localStorageRepository';

export function createRepository(): EventRepository {
  // Task 14 adds: if running inside Tauri, return JsonFileRepository.
  return new LocalStorageRepository();
}
```

- [ ] **Step 4: Replace `src/App.tsx`**

```tsx
import { useEffect } from 'react';
import { MainScreen } from './app/MainScreen';
import { useCalendarStore } from './app/store';
import { createRepository } from './data/createRepository';
import { QuickEntryHost } from './features/quick-entry/QuickEntryHost';
import { EventEditorHost } from './features/event-editor/EventEditorHost';
import { Toast } from './ui/Toast';

export default function App() {
  const ready = useCalendarStore((s) => s.ready);

  useEffect(() => {
    void useCalendarStore.getState().init(createRepository());
  }, []);

  if (!ready) return null;
  return (
    <>
      <MainScreen />
      <QuickEntryHost />
      <EventEditorHost />
      <Toast />
    </>
  );
}
```

- [ ] **Step 5: Run the full suite and the type checker**

Run: `npm test`
Expected: PASS — every test file.
Run: `npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 6: Manual end-to-end verification in the browser**

Run: `npm run dev`, open the URL, and walk through:

1. Click an empty day → quick-entry popover appears beside the tile (right of it; for days in the rightmost columns it appears to the left).
2. Type `14 30 Dentist` → time chip shows `14:30`, preview shows "Dentist". Enter → chip appears on the day, card appears in Upcoming.
3. Click a day, type `Buy flowers`, Enter → all-day chip (gray) on the tile.
4. Click the Dentist chip → editor opens prefilled. Add a description, set Repeats=yearly, Save.
5. A dot appears on the year circle at roughly the right position; hover shows the tooltip; click opens the editor.
6. Reload the page → everything persists (localStorage).
7. Navigate ‹/›: adjacent-month days are muted; "today" returns to the current month.
8. Esc and outside-click both close popovers.

Expected: all eight checks pass. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/ui src/data/createRepository.ts
git commit -m "feat: wire app together with repository init and toast"
```

---

### Task 14: Tauri desktop shell + JSON file storage

**Prerequisite:** Rust toolchain (`rustup`). Check with `rustc --version`; if missing, install from https://rustup.rs (default options), then restart the shell. On Windows it needs the MSVC build tools (the rustup installer guides you).

**Files:**
- Create: `src-tauri/**` (generated by `tauri init`, then edited)
- Create: `src/data/jsonFileRepository.ts`
- Modify: `src/data/createRepository.ts`, `package.json`, `README.md`

- [ ] **Step 1: Install Tauri CLI and JS APIs**

Run:
```bash
npm install -D @tauri-apps/cli
npm install @tauri-apps/api @tauri-apps/plugin-fs
```

- [ ] **Step 2: Initialize the Tauri shell**

Run:
```bash
npx tauri init --app-name open-calendar --window-title "Open Calendar" --frontend-dist ../dist --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"
```
Expected: a `src-tauri/` directory appears.

- [ ] **Step 3: Register the fs plugin in Rust**

Run (from repo root):
```bash
cd src-tauri && cargo add tauri-plugin-fs && cd ..
```

Edit `src-tauri/src/lib.rs` — add the plugin to the builder:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

(If `tauri init` generated `main.rs` without `lib.rs`, apply the same `.plugin(tauri_plugin_fs::init())` line to the builder there.)

- [ ] **Step 4: Grant scoped fs permissions**

Replace the permissions array in `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    { "identifier": "fs:allow-exists", "allow": [{ "path": "$APPDATA" }, { "path": "$APPDATA/**" }] },
    { "identifier": "fs:allow-mkdir", "allow": [{ "path": "$APPDATA" }, { "path": "$APPDATA/**" }] },
    { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$APPDATA/**" }] },
    { "identifier": "fs:allow-write-text-file", "allow": [{ "path": "$APPDATA/**" }] }
  ]
}
```

- [ ] **Step 5: Create `src/data/jsonFileRepository.ts`**

```ts
import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type { CalendarEvent } from '../core/types';
import type { EventRepository, LoadResult } from './repository';
import { parseStore, serializeStore } from './storeFile';

const FILE = 'events.json';
const BACKUP = 'events.json.bak';
const FS_OPTS = { baseDir: BaseDirectory.AppData };

/** Desktop adapter: a human-readable JSON file in the app-data directory. */
export class JsonFileRepository implements EventRepository {
  async load(): Promise<LoadResult> {
    if (!(await exists(FILE, FS_OPTS))) return { events: [] };
    const text = await readTextFile(FILE, FS_OPTS);
    const parsed = parseStore(text);
    if (parsed.ok) return { events: parsed.events };
    await writeTextFile(BACKUP, text, FS_OPTS);
    return {
      events: [],
      warning: `events.json was unreadable (${parsed.error}). A backup was saved as events.json.bak; starting fresh.`,
    };
  }

  async saveAll(events: CalendarEvent[]): Promise<void> {
    if (!(await exists('', FS_OPTS))) {
      await mkdir('', { ...FS_OPTS, recursive: true });
    }
    await writeTextFile(FILE, serializeStore(events), FS_OPTS);
  }
}
```

- [ ] **Step 6: Update `src/data/createRepository.ts`**

```ts
import type { EventRepository } from './repository';
import { LocalStorageRepository } from './localStorageRepository';
import { JsonFileRepository } from './jsonFileRepository';

function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function createRepository(): EventRepository {
  return isTauri() ? new JsonFileRepository() : new LocalStorageRepository();
}
```

- [ ] **Step 7: Add the tauri script to `package.json`**

In `"scripts"`, add:

```json
    "tauri": "tauri"
```

- [ ] **Step 8: Verify the desktop app**

Run: `npx tauri dev` (first compile takes several minutes).
Expected: a native "Open Calendar" window opens showing the app. Create an event, close the window, run `npx tauri dev` again — the event is still there (now stored in `%APPDATA%\com.open-calendar.app\events.json` or similar; the exact folder comes from the `identifier` in `src-tauri/tauri.conf.json`).

If `exists('', ...)`/`mkdir('', ...)` errors on the first save, replace that guard with `await mkdir('', { ...FS_OPTS, recursive: true }).catch(() => {});` — some plugin versions reject empty-path `exists` but accept idempotent recursive mkdir.

- [ ] **Step 9: Run the web test suite once more**

Run: `npm test`
Expected: PASS — the Tauri imports must not break jsdom tests (they're only loaded when `createRepository` chooses the Tauri branch — if vitest fails on resolving `@tauri-apps/plugin-fs`, convert the import in `createRepository.ts` to a dynamic `await import('./jsonFileRepository')` inside the `isTauri()` branch and make `createRepository` async, awaiting it in `App.tsx`).

- [ ] **Step 10: Create `README.md`**

````markdown
# Open Calendar

A free, open-source, minimalistic calendar for desktop (and later mobile).
Local-first: your events live in a JSON file on your machine.

## Development

```bash
npm install
npm run dev        # web app in the browser (localStorage)
npm test           # unit + component tests
npx tauri dev      # desktop app (requires Rust: https://rustup.rs)
npx tauri build    # production desktop build
```

## Architecture

- `src/core/` — pure domain logic (types, time parser, recurrence expander)
- `src/data/` — storage adapters behind the `EventRepository` interface
- `src/features/` — self-contained UI modules (month grid, quick entry, ...)
- `src/app/` — layout shell and stores
- `src/ui/` — design tokens and shared primitives

See `docs/superpowers/specs/` for the design spec.
````

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: Tauri desktop shell with JSON file storage"
```

---

## Final acceptance checklist

After all tasks: `npm test` passes, `npm run build` is clean, and the Task 13 Step 6 manual walkthrough passes in both the browser and the Tauri window.

Spec coverage map: layout shell (Task 7) · upcoming stack (11) · year circle (12) · month grid (8) · quick entry + parsing (3, 9) · event editor + recurrence (10) · occurrence semantics (4) · storage, versioning, corrupt-file recovery (5) · toasts + wiring (13) · desktop shell (14).






