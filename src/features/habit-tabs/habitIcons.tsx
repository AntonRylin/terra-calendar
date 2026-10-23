/** Curated feather-style 24px outline icons users can assign to habit tabs.
 *  Stroked with currentColor so they follow the tab's text color. */
function icon(paths: JSX.Element): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

export interface HabitIcon {
  id: string;
  label: string;
  icon: JSX.Element;
}

export const HABIT_ICONS: HabitIcon[] = [
  {
    id: 'check',
    label: 'Checkmark',
    icon: icon(<polyline points="20 6 9 17 4 12" />),
  },
  {
    id: 'dumbbell',
    label: 'Gym',
    icon: icon(<><path d="M6.5 6.5v11" /><path d="M17.5 6.5v11" /><path d="M3 9v6" /><path d="M21 9v6" /><line x1="6.5" y1="12" x2="17.5" y2="12" /></>),
  },
  {
    id: 'run',
    label: 'Running',
    icon: icon(<><circle cx="14" cy="4" r="2" /><path d="M9 21l2.5-5L9 12l3-4 3 2.5 4 .5" /><path d="M6 12l3-4" /><path d="M14 16l2 5" /></>),
  },
  {
    id: 'dollar',
    label: 'Money',
    icon: icon(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>),
  },
  {
    id: 'lightbulb',
    label: 'Ideas',
    icon: icon(<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3v1h6v-1c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" /></>),
  },
  {
    id: 'book',
    label: 'Reading',
    icon: icon(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
  },
  {
    id: 'pen',
    label: 'Journal',
    icon: icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></>),
  },
  {
    id: 'food',
    label: 'Nutrition',
    icon: icon(<><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></>),
  },
  {
    id: 'water',
    label: 'Water',
    icon: icon(<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.3 0z" />),
  },
  {
    id: 'sleep',
    label: 'Sleep',
    icon: icon(<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />),
  },
  {
    id: 'heart',
    label: 'Health',
    icon: icon(<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />),
  },
  {
    id: 'pill',
    label: 'Medication',
    icon: icon(<><path d="M10.5 20.5L3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z" /><line x1="7" y1="10" x2="14" y2="17" /></>),
  },
  {
    id: 'music',
    label: 'Music',
    icon: icon(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
  },
  {
    id: 'code',
    label: 'Coding',
    icon: icon(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>),
  },
  {
    id: 'plant',
    label: 'Plants',
    icon: icon(<><path d="M12 22v-8" /><path d="M12 14a6 6 0 0 0 6-6V5a9 9 0 0 0-6 3 9 9 0 0 0-6-3v3a6 6 0 0 0 6 6z" /></>),
  },
  {
    id: 'star',
    label: 'Favorites',
    icon: icon(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  },
  {
    id: 'flame',
    label: 'Streak',
    icon: icon(<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3 1.1-2.2 2.8-4 5-5-.4 2 .5 3.3 1.5 4.5A6 6 0 0 1 18 12a6 6 0 1 1-12 0c0 1.4 1 2.5 2.5 2.5z" />),
  },
  {
    id: 'coffee',
    label: 'Coffee',
    icon: icon(<><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /></>),
  },
  {
    id: 'phone',
    label: 'Screen time',
    icon: icon(<><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>),
  },
  {
    id: 'brush',
    label: 'Art',
    icon: icon(<><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" /></>),
  },
  {
    id: 'target',
    label: 'Goals',
    icon: icon(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  },
];

const DEFAULT_ICON = HABIT_ICONS[0];

/** The icon for a stored id, falling back to the checkmark for unknown ids. */
export function habitIconById(id: string): HabitIcon {
  return HABIT_ICONS.find((i) => i.id === id) ?? DEFAULT_ICON;
}
