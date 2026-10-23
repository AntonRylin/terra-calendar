import { useRef, useState } from 'react';
import { useCalendarStore } from '../../app/store';
import { useShareStore } from '../../app/shareStore';
import { useSettingsStore, type CategoryConfig } from '../../app/settingsStore';
import type { CalendarEvent, EventReminder } from '../../core/types';
import { useEntitlementStore } from '../../app/entitlementStore';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
import { confirmChoice } from '../../ui/confirmStore';
import { startCheckout } from '../../data/checkout';
import { buildGallery, gradientValue, type Design } from './presets';
import { SwatchGrid } from './SwatchGrid';
import { CategoryPreview } from './CategoryPreview';
import { CategoryReminders } from './CategoryReminders';
import '../../ui/toolbarButton.css';
import './categoryEditor.css';

const reminderKey = (r: EventReminder) => `${r.value}-${r.unit}`;

/** `"A"`, `"A" and "B"`, or `"A", "B" and N others` — for the retro prompt. */
function listEventTitles(events: CalendarEvent[]): string {
  const titles = events.map((e) => `"${e.title || 'Untitled'}"`);
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  const rest = titles.length - 2;
  return `${titles[0]}, ${titles[1]} and ${rest} other${rest === 1 ? '' : 's'}`;
}

const DEFAULT_GRADIENT: CategoryConfig = {
  type: 'gradient',
  value: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #f59e0b, #6366f1)',
  color1: '#6366f1',
  color2: '#ec4899',
  matchEvents: true,
};

interface Props {
  category: string;
  variant?: 'pane' | 'popover';
}

/** The one category editor, shared by the settings Categories pane and the
 *  chip double-click popover. Free selections auto-save; premium designs
 *  preview only (try-on) until the cosmetics unlock is purchased. */
export function CategoryEditor({ category, variant = 'pane' }: Props) {
  const storeCategories = useSettingsStore((s) => s.categories);
  const customGradients = useSettingsStore((s) => s.customGradients);
  const setCategoryConfig = useSettingsStore((s) => s.setCategoryConfig);
  const deleteCategoryConfig = useSettingsStore((s) => s.deleteCategoryConfig);
  const renameCategoryConfig = useSettingsStore((s) => s.renameCategoryConfig);
  const addCustomGradient = useSettingsStore((s) => s.addCustomGradient);
  const deleteCustomGradient = useSettingsStore((s) => s.deleteCustomGradient);
  const renameCategory = useCalendarStore((s) => s.renameCategory);
  const notify = useCalendarStore((s) => s.notify);
  const cosmeticsUnlocked = useEntitlementStore((s) => s.cosmeticsUnlocked);

  const [name, setName] = useState(category);
  const saved: CategoryConfig = storeCategories[name] ?? storeCategories[category] ?? DEFAULT_GRADIENT;
  /** Premium try-on: previews only, never persisted. */
  const [tryDesign, setTryDesign] = useState<Design | null>(null);

  const effective: CategoryConfig = tryDesign
    ? { ...saved, type: 'gradient', value: tryDesign.value, color1: tryDesign.color1, color2: tryDesign.color2 ?? tryDesign.color1, cosmetic: undefined }
    : saved;

  function save(config: CategoryConfig) {
    setTryDesign(null);
    setCategoryConfig(name.trim() || category, config);
  }

  /** Reminder set as of the last retro-update prompt (or mount), so each
   *  settled batch of edits is offered for existing events exactly once. */
  const remindersBaseline = useRef<EventReminder[]>(saved.reminders ?? []);

  /** After a committed reminder edit: offer to retroactively update the
   *  category's existing events with the delta. Declining (or no affected
   *  events) means only newly categorised events pick up the change. */
  function handleRemindersSettled() {
    const catName = name.trim() || category;
    const current = useSettingsStore.getState().categories[catName]?.reminders ?? [];
    const before = remindersBaseline.current;
    remindersBaseline.current = current;

    const beforeKeys = new Set(before.map(reminderKey));
    const currentKeys = new Set(current.map(reminderKey));
    const added = current.filter((r) => !beforeKeys.has(reminderKey(r)));
    const removed = before.filter((r) => !currentKeys.has(reminderKey(r)));
    if (added.length === 0 && removed.length === 0) return;

    const affected = useCalendarStore.getState().events.filter((e) => {
      if (e.type !== catName || e.isTask) return false;
      const keys = new Set((e.reminders ?? []).map(reminderKey));
      return added.some((r) => !keys.has(reminderKey(r))) || removed.some((r) => keys.has(reminderKey(r)));
    });
    if (affected.length === 0) return;

    void confirmChoice({
      title: 'Update existing events?',
      message: `Apply this reminder change to ${listEventTitles(affected)} retroactively? Otherwise only new "${catName}" events get it.`,
      actions: [{ value: 'update', label: `Update ${affected.length} event${affected.length === 1 ? '' : 's'}`, primary: true }],
      cancelLabel: 'Only new events',
    }).then((v) => {
      if (v === 'update') {
        void useCalendarStore.getState().syncCategoryReminders(catName, added, removed);
      }
    });
  }

  function handleSelect(d: Design) {
    if (d.premium && !cosmeticsUnlocked) {
      setTryDesign(d);
      void confirmChoice({
        title: `${d.name} is a premium design`,
        message: 'Unlock all premium cosmetics with a one-time $3.99 purchase. You can preview it now.',
        actions: [{ value: 'buy', label: 'Unlock — $3.99', primary: true }],
        cancelLabel: 'Keep previewing',
      }).then((v) => {
        if (v === 'buy') void startCheckout('cosmetics');
      });
      return;
    }
    if (d.kind === 'solid') {
      save({ ...saved, type: 'color', value: d.value, color1: d.color1, color2: undefined, cosmetic: undefined });
    } else {
      save({ ...saved, type: 'gradient', value: d.value, color1: d.color1, color2: d.color2, cosmetic: undefined });
    }
  }

  async function handleRename(next: string) {
    const trimmedNew = next.trim();
    const trimmedOld = name.trim();
    if (!trimmedNew || trimmedNew === trimmedOld) return;
    try {
      await renameCategory(trimmedOld, trimmedNew);
      renameCategoryConfig(trimmedOld, trimmedNew);
      setCategoryConfig(trimmedNew, saved);
      setName(trimmedNew);
      // Shares scope by category NAME, so any share listing the old one has to
      // follow the rename or it silently stops sharing those events.
      await useShareStore.getState().renameCategory(trimmedOld, trimmedNew);
    } catch (err) {
      console.error('Failed to rename category:', err);
    }
  }

  const mode = effective.type === 'color' ? 'color' : 'gradient';
  const designs = buildGallery(mode, customGradients);

  return (
    <div className={`catedit${variant === 'popover' ? ' is-popover' : ''}`}>
      <CategoryPreview name={name} config={effective} onRename={handleRename} />

      <div className="catedit-seg" role="group" aria-label="Style type">
        <button
          type="button"
          className={`catedit-seg-btn${mode === 'color' ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, type: 'color', value: saved.color1 || '#0a84ff', color1: saved.color1 || '#0a84ff', cosmetic: undefined })}
        >
          Solid
        </button>
        <button
          type="button"
          className={`catedit-seg-btn${mode === 'gradient' ? ' is-on' : ''}`}
          onClick={() =>
            save({
              ...saved,
              type: 'gradient',
              value: gradientValue(saved.color1 || '#6366f1', saved.color2 || '#ec4899'),
              color1: saved.color1 || '#6366f1',
              color2: saved.color2 || '#ec4899',
              cosmetic: undefined,
            })
          }
        >
          Gradient
        </button>
      </div>

      <SwatchGrid
        mode={mode}
        designs={designs}
        selectedValue={effective.value}
        cosmeticsUnlocked={cosmeticsUnlocked}
        onSelect={handleSelect}
        onSaveCustom={(c1, c2) => {
          if (mode === 'gradient') {
            addCustomGradient({ color1: c1, color2: c2 });
            save({ ...saved, type: 'gradient', value: gradientValue(c1, c2), color1: c1, color2: c2 });
          } else {
            save({ ...saved, type: 'color', value: c1, color1: c1 });
          }
        }}
        onDeleteCustom={(gname) => {
          void confirmChoice({
            title: `Delete "${gname}"?`,
            message: 'Categories using it keep their current colors.',
            actions: [{ value: 'delete', label: 'Delete', danger: true }],
          }).then((v) => {
            if (v === 'delete') deleteCustomGradient(gname);
          });
        }}
      />

      <div className="catedit-cosmetic">
        <div className="catswatch-group-title">Animated styles</div>
        <CosmeticSelector
          value={saved.cosmetic ?? ''}
          onChange={(id) => save({ ...saved, cosmetic: id || undefined })}
          color={saved.type === 'color' ? saved.value : saved.color1}
        />
      </div>

      <div className="catedit-match">
        <div className="catedit-match-label">
          <div className="catedit-match-title">Events match category</div>
          <div className="catedit-match-hint">
            {saved.cosmetic
              ? 'Events use the animated style above.'
              : 'Events use this exact look, and follow changes.'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(saved.matchEvents)}
          aria-label="Events match category"
          className={`catedit-switch${saved.matchEvents ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, matchEvents: !saved.matchEvents })}
        >
          <span className="catedit-knob" />
        </button>
      </div>

      <div className="catedit-reminders">
        <div className="catedit-match-label">
          <div className="catedit-match-title">Reminders</div>
          <div className="catedit-match-hint">
            Added automatically to any event that gets this category. Synced like normal event reminders.
          </div>
        </div>
        <CategoryReminders
          reminders={saved.reminders ?? []}
          onChange={(next) => save({ ...saved, reminders: next.length > 0 ? next : undefined })}
          onSettled={handleRemindersSettled}
        />
      </div>

      {/* Hidden on phones, which have no minimap (the setting still syncs). */}
      <div className="catedit-match catedit-match--minimap">
        <div className="catedit-match-label">
          <div className="catedit-match-title">Hide from minimap</div>
          <div className="catedit-match-hint">No events of this category on the minimap.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(saved.hideFromMinimap)}
          aria-label="Hide from minimap"
          className={`catedit-switch${saved.hideFromMinimap ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, hideFromMinimap: !saved.hideFromMinimap || undefined })}
        >
          <span className="catedit-knob" />
        </button>
      </div>

      <div className="catedit-match">
        <div className="catedit-match-label">
          <div className="catedit-match-title">Hide from upcoming</div>
          <div className="catedit-match-hint">No events of this category in the Upcoming list.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(saved.hideFromUpcoming)}
          aria-label="Hide from upcoming"
          className={`catedit-switch${saved.hideFromUpcoming ? ' is-on' : ''}`}
          onClick={() => save({ ...saved, hideFromUpcoming: !saved.hideFromUpcoming || undefined })}
        >
          <span className="catedit-knob" />
        </button>
      </div>

      {Boolean(storeCategories[name.trim() || category]) && (
        <button
          type="button"
          className="catedit-reset"
          onClick={() => {
            deleteCategoryConfig(name.trim() || category);
            notify(`Reset style for "${name.trim() || category}".`);
          }}
        >
          Reset style
        </button>
      )}
    </div>
  );
}
