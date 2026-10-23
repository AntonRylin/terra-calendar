import { useSettingsStore } from '../../app/settingsStore';
import { YearCircle } from './YearCircle';
import { MonthDays } from './MonthDays';

/** The sidebar minimap: a year wheel or a month of numbered days,
 *  chosen by the persisted `minimapMode` setting. */
export function Minimap() {
  const mode = useSettingsStore((s) => s.minimapMode);
  return mode === 'days' ? <MonthDays /> : <YearCircle />;
}
