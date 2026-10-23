import { useSettingsStore } from '../../app/settingsStore';
import { useUiStore } from '../../app/uiStore';
import { habitIconById } from './habitIcons';
import './habitTabs.css';

/** Calendar icon for the default Events tab, matching the habit icon style. */
const EVENTS_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="16" y1="2" x2="16" y2="6" />
  </svg>
);

/**
 * Icon-tab row above the month grid: the default Events tab plus one tab per
 * user-defined habit tracker. Hidden entirely while the feature is disabled
 * or no tabs exist, so the calendar looks unchanged out of the box.
 */
export function HabitTabSwitcher() {
  const enabled = useSettingsStore((s) => s.habitTabsEnabled);
  const tabs = useSettingsStore((s) => s.habitTabs);
  const activeHabitTab = useUiStore((s) => s.activeHabitTab);
  const setActiveHabitTab = useUiStore((s) => s.setActiveHabitTab);

  if (!enabled || tabs.length === 0) return null;

  const activeId = tabs.some((t) => t.id === activeHabitTab) ? activeHabitTab : null;

  return (
    <div className="habit-tab-row" role="tablist" aria-label="Calendar tabs">
      <button
        role="tab"
        className={'habit-tab' + (activeId === null ? ' is-active' : '')}
        aria-selected={activeId === null}
        onClick={() => setActiveHabitTab(null)}
      >
        {EVENTS_ICON}
        <span>Events</span>
      </button>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          className={'habit-tab' + (activeId === tab.id ? ' is-active' : '')}
          aria-selected={activeId === tab.id}
          onClick={() => setActiveHabitTab(tab.id)}
        >
          {habitIconById(tab.icon).icon}
          <span>{tab.name}</span>
        </button>
      ))}
    </div>
  );
}
