import { useState, useEffect, useRef } from 'react';
import { useUiStore } from '../../app/uiStore';
import { useSpecialDaysStore, type DayCustomStyle, type DayImageRef } from '../../app/specialDaysStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { CosmeticSelector } from '../../ui/CosmeticSelector';
import { EFFECTS, EffectsModal } from './EffectsModal';
import { useIsMobile } from '../../ui/useMediaQuery';
import { SheetHeader } from '../../ui/SheetParts';
import { CheckIcon, ImageIcon } from '../../ui/sheetIcons';
import { formatPhoneDate } from '../../ui/PhonePickers';
import './specialDay.css';

/** Recurrence options — a single, intuitive segmented control. */
const RECURRENCE = [
  { id: 'none', label: 'Once' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
] as const;

export function SpecialDayHost() {
  const target = useUiStore((s) => s.specialDayEditor);
  if (!target) return null;
  return <SpecialDayForm key={target.date} date={target.date} anchorEl={target.anchorEl} />;
}

function SpecialDayForm({ date, anchorEl }: { date: string; anchorEl: Element }) {
  const close = useUiStore((s) => s.closeOverlays);
  const openDayBackground = useUiStore((s) => s.openDayBackground);
  const isMobile = useIsMobile();
  const {
    specialDays,
    setSpecialDayInMemory,
    removeSpecialDayInMemory,
    commit,
  } = useSpecialDaysStore();

  const existingDirect = specialDays.find((d) => d.date === date);
  // The record as it was when the panel opened (existingDirect follows the live
  // preview), for the phone sheet's ✕ to put back.
  const originalRef = useRef(existingDirect);

  const [cosmetic, setCosmetic] = useState(existingDirect?.cosmetic ?? '');
  const [animations, setAnimations] = useState<string[]>(existingDirect?.animations ?? []);
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly' | 'yearly'>(
    existingDirect?.recurrence ?? 'none'
  );
  const [emoji, setEmoji] = useState(existingDirect?.emoji ?? '');
  const [effectsOpen, setEffectsOpen] = useState(false);
  // The custom background can't change while this panel is open — opening the
  // background modal unmounts it (see uiStore.openDayBackground) — so mirroring
  // it into local state is safe, and it makes the sync effect below the single
  // writer instead of reading back a record it is halfway through rewriting.
  // A swatch wins over a background when a record somehow carries both (pasting
  // a style onto a day with a photo leaves the image ref in place), so opening
  // the panel settles that here rather than leaving a half-applied record.
  const [background, setBackground] = useState<{ image?: DayImageRef; customStyle?: DayCustomStyle }>(
    () =>
      existingDirect?.cosmetic
        ? { image: undefined, customStyle: undefined }
        : { image: existingDirect?.image, customStyle: existingDirect?.customStyle }
  );

  const toggleEffect = (id: string) =>
    setAnimations((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  // Registry order, not selection order, so the panel summary stays stable as
  // effects toggle on and off.
  const selectedEffects = EFFECTS.filter((fx) => animations.includes(fx.id));

  // A style swatch and a custom background paint the same layer, so picking a
  // swatch drops the background. The dropped image's bytes stay in IndexedDB so
  // Ctrl+Z can bring the photo back; sweepUnreferencedImages() collects them on
  // the next launch, once no history can reach them.
  const handleCosmetic = (next: string) => {
    setCosmetic(next);
    if (!next) return;
    setBackground({ image: undefined, customStyle: undefined });
  };

  // Apply preview to the live store as local state changes, so the real day tile
  // behind the popover updates instantly.
  useEffect(() => {
    const hasBackground = Boolean(background.image || background.customStyle);
    if (!cosmetic && animations.length === 0 && !emoji && !hasBackground) {
      removeSpecialDayInMemory(date);
    } else {
      setSpecialDayInMemory(date, {
        cosmetic,
        animations,
        emoji,
        recurrence,
        image: background.image,
        customStyle: background.customStyle,
      });
    }
  }, [cosmetic, animations, recurrence, emoji, background, date]);

  // Commit on close — no Save button. Picking a style and clicking away is enough.
  useEffect(() => {
    return () => {
      commit();
    };
  }, [commit]);

  // One reset for the whole day. This used to be a bare ↺ that cleared the
  // style, effects and repeat but left the background standing, while the
  // background modal's own reset did the mirror image — so neither button ever
  // returned a day to plain, and you had to find both to get there.
  // Undoable: closing the panel commits one history step for the whole session.
  const handleReset = () => {
    setCosmetic('');
    setAnimations([]);
    setRecurrence('none');
    setEmoji('');
    setBackground({ image: undefined, customStyle: undefined });
  };

  // Phone ✕: leave the day as it was when the sheet opened. The live preview
  // already wrote to the store, so put the original record back before the
  // close-time commit (which then records nothing, as nothing changed). The
  // sync effect above can't undo this: the form state doesn't change again.
  const discardChanges = () => {
    const original = originalRef.current;
    if (original) {
      const { id: _id, date: _date, ...rest } = original;
      setSpecialDayInMemory(date, rest);
    } else {
      removeSpecialDayInMemory(date);
    }
  };

  const isSpecial =
    Boolean(cosmetic) ||
    animations.length > 0 ||
    Boolean(emoji) ||
    Boolean(background.image) ||
    Boolean(background.customStyle);

  // What the background opener should report it is currently holding. Mirrors
  // the method chooser's own labels in DayBackgroundHost.
  const backgroundKind = background.image
    ? background.image.media === 'video' || background.image.mime === 'image/gif'
      ? 'Video'
      : background.image.kind === 'url' && background.image.id.startsWith('scene-')
        ? 'Scene'
        : 'Photo'
    : background.customStyle?.kind === 'recipe'
      ? 'Gradient'
      : background.customStyle?.kind === 'raw'
        ? 'Custom CSS'
        : null;

  return (
    <AnchoredPopover anchorEl={anchorEl} onClose={close} dismissable={!effectsOpen}>
      <div className={'sd-panel' + (isMobile ? ' sd-panel--phone' : '')}>
        {isMobile && (
          <SheetHeader
            title={
              <>
                Style this day
                <span className="sd-sheet-date">{formatPhoneDate(date)}</span>
              </>
            }
            onBeforeClose={discardChanges}
            closeLabel="Discard changes"
            action={{ label: 'Done' }}
          />
        )}
        {/* No topbar — both exits live in the footer row at the bottom. */}
        <div className="sd-section">
          <span className="sd-label">Style</span>
          <CosmeticSelector
            value={cosmetic}
            onChange={handleCosmetic}
            featuredTotal={isMobile ? 19 : 17}
            hideNone
            className="sd-styles"
          />
        </div>

        <div className="sd-section">
          <span className="sd-label">Effect</span>
          <button
            type="button"
            className="sd-effects-open"
            onClick={() => setEffectsOpen(true)}
            aria-haspopup="dialog"
          >
            {selectedEffects.length === 0 && (
              <span className="special-day-particles" aria-hidden="true">
                <span className="special-day-firefly" style={{ top: '80%', left: '20%', animationDelay: '0s' }} />
                <span className="special-day-firefly" style={{ top: '55%', left: '58%', animationDelay: '1.5s' }} />
                <span className="special-day-firefly" style={{ top: '42%', left: '32%', animationDelay: '3s' }} />
                <span className="special-day-firefly" style={{ top: '70%', left: '78%', animationDelay: '0.8s' }} />
                <span className="special-day-firefly" style={{ top: '30%', left: '88%', animationDelay: '2.2s' }} />
              </span>
            )}
            {selectedEffects.length === 0 ? (
              <span className="sd-effects-empty">＋&nbsp; Add effects</span>
            ) : (
              <span className="sd-effects-summary">
                <span className="sd-effects-icons" aria-hidden="true">
                  {selectedEffects.map((fx) => (
                    <span key={fx.id}>{fx.icon}</span>
                  ))}
                </span>
                <span className="sd-effects-names">
                  {selectedEffects.map((fx) => fx.label).join(', ')}
                </span>
              </span>
            )}
            <span className="sd-effects-chev" aria-hidden="true">›</span>
          </button>
        </div>

        <div className="sd-section">
          <div className="sd-segment" role="radiogroup" aria-label="Repeat">
            <span
              className="sd-segment-thumb"
              style={{ transform: `translateX(${RECURRENCE.findIndex((r) => r.id === recurrence) * 100}%)` }}
              aria-hidden="true"
            />
            {RECURRENCE.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={recurrence === r.id}
                className={`sd-segment-btn ${recurrence === r.id ? 'selected' : ''}`}
                onClick={() => setRecurrence(r.id)}
              >
                {isMobile && recurrence === r.id && <CheckIcon size={18} />}
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="sd-custom-bg-btn"
          onClick={() => openDayBackground(date)}
        >
          {isMobile && <ImageIcon />}
          <span>Custom background{backgroundKind ? '' : '…'}</span>
          {backgroundKind && <span className="sd-custom-bg-cur">{backgroundKind} applied</span>}
        </button>

        {/* Both exits in one row: reset on the left, done on the right. */}
        <div className="sd-footbar">
          {isSpecial && (
            <button type="button" className="sd-foot-reset" onClick={handleReset}>
              Reset changes
            </button>
          )}
          {!isMobile && (
            <button type="button" className="sd-foot-done" onClick={close}>
              Done
            </button>
          )}
        </div>

        {effectsOpen && (
          <EffectsModal
            selected={animations}
            day={Number(date.split('-')[2])}
            onToggle={toggleEffect}
            onClear={() => setAnimations([])}
            onClose={() => setEffectsOpen(false)}
          />
        )}
      </div>
    </AnchoredPopover>
  );
}
