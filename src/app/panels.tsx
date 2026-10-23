import type { ComponentType } from 'react';
import { MonthGrid } from '../features/month-grid/MonthGrid';
import { WeekView } from '../features/week-view/WeekView';
import { UpcomingStack } from '../features/upcoming-stack/UpcomingStack';
import { Minimap } from '../features/year-circle/Minimap';
import { useSettingsStore } from './settingsStore';

export type PanelId = 'upcoming-stack' | 'year-circle' | 'month-grid';

/** The main calendar area: the month grid, or the week planner when the
 *  layout dropdown is set to Week. */
function CalendarPanel() {
  const mode = useSettingsStore((s) => s.calendarViewMode);
  return mode === 'week' ? <WeekView /> : <MonthGrid />;
}

export const panelRegistry: Record<PanelId, ComponentType> = {
  'upcoming-stack': UpcomingStack,
  'year-circle': Minimap,
  'month-grid': CalendarPanel,
};

export interface LayoutConfig {
  sidebar: { top: PanelId; bottom: PanelId };
  main: PanelId;
}

export const defaultLayout: LayoutConfig = {
  sidebar: { top: 'upcoming-stack', bottom: 'year-circle' },
  main: 'month-grid',
};
