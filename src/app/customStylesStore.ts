import { create } from 'zustand';
import { setCustomCosmetics } from '../core/cosmetics';
import {
  newTemplateId,
  templateToCosmetic,
  type CustomStyleTemplate,
} from '../core/customStyles';
import type { DayCustomStyle } from './specialDaysStore';

/** localStorage key holding the saved templates. Exported so the settings
 *  backup (see ./settingsExtras) can include them. */
export const CUSTOM_STYLES_KEY = 'open-calendar.custom-styles';
const KEY = CUSTOM_STYLES_KEY;

/**
 * User-saved style templates ("Save as style" in the day-background builder and
 * Custom CSS editor — gradient recipes or raw CSS). Templates are device-local
 * (localStorage); the cosmetic *ids* stored on days/events sync as plain text
 * and degrade to the plain look on devices that don't have the template.
 */
interface CustomStylesState {
  templates: CustomStyleTemplate[];
  add(name: string, style: DayCustomStyle): string;
  remove(id: string): void;
}

function persistAndRegister(templates: CustomStyleTemplate[]) {
  localStorage.setItem(KEY, JSON.stringify(templates));
  setCustomCosmetics(templates.map(templateToCosmetic));
}

function load(): CustomStyleTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CustomStyleTemplate =>
        t && typeof t.id === 'string' && typeof t.name === 'string' &&
        (t.recipe?.kind === 'recipe' || (t.recipe?.kind === 'raw' && typeof t.recipe.source === 'string')),
    );
  } catch {
    return [];
  }
}

export const useCustomStylesStore = create<CustomStylesState>((set, get) => ({
  templates: [],
  add(name, style) {
    const t: CustomStyleTemplate = { id: newTemplateId(), name: name.trim() || 'My style', recipe: style };
    const templates = [...get().templates, t];
    set({ templates });
    persistAndRegister(templates);
    return t.id;
  },
  remove(id) {
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates });
    persistAndRegister(templates);
  },
}));

/** Re-read the templates from localStorage and re-register their cosmetics.
 *  Used after a settings import replaces the stored templates. */
export function reloadCustomStyles(): void {
  const templates = load();
  useCustomStylesStore.setState({ templates });
  setCustomCosmetics(templates.map(templateToCosmetic));
}

// Hydrate at module load (synchronous, cheap) so custom cosmetic ids on days
// and events resolve before the first paint — not after a mount effect.
reloadCustomStyles();
