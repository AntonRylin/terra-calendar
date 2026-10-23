import { useMemo } from 'react';
import type { SpecialDay } from '../../app/specialDaysStore';
import { dayScopeClass } from '../../core/dayBackground';
import { compileCustomStyle } from '../../core/dayCss';

/** One <style> element holding the compiled, scoped CSS for every day that uses
 *  a custom style. De-duped by record id (recurring days reuse one rule). */
export function DayCustomStyleSheet({ specialDays }: { specialDays: SpecialDay[] }) {
  const css = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of specialDays) {
      if (!d.customStyle || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(compileCustomStyle(d.customStyle, dayScopeClass(d.id)));
    }
    return out.join('\n');
  }, [specialDays]);

  if (!css) return null;
  return <style data-day-custom-css>{css}</style>;
}
