import { useMemo } from 'react';
import { useCustomStylesStore } from '../app/customStylesStore';
import { compileAllTemplatesCss } from '../core/customStyles';

/** One global <style> holding the CSS for every user-saved gradient template,
 *  covering the same host contexts as the built-in cosmetics (day tiles, month
 *  chips, spans, week blocks, picker swatches). */
export function CustomStylesSheet() {
  const templates = useCustomStylesStore((s) => s.templates);
  const css = useMemo(() => compileAllTemplatesCss(templates), [templates]);
  if (!css) return null;
  return <style data-custom-styles>{css}</style>;
}
