import { useState } from 'react';
import { allCosmetics, cosmeticsByFamily, featuredCosmetics, featuredCosmeticsByCount, type Cosmetic } from '../core/cosmetics';
import { isCosmeticLocked } from '../core/cosmeticAccess';
import { useEntitlementStore } from '../app/entitlementStore';
import { useCalendarStore } from '../app/store';
import { useCustomStylesStore } from '../app/customStylesStore';
import { confirmDialog } from './confirmStore';
import { startCheckout } from '../data/checkout';
import { AnchoredPopover } from './AnchoredPopover';
import './cosmetics.css';
import './cosmeticSelector.css';

interface CosmeticSelectorProps {
  /** Selected cosmetic id, or '' for none. */
  value: string;
  onChange(id: string): void;
  /** The event's current solid colour, so effect swatches preview accurately. */
  color?: string;
  /** Show this many styles in the collapsed row (spread across families). When
   *  unset, falls back to one representative per family. */
  featuredTotal?: number;
  /** Hide the "None" swatch from the collapsed row (clearing is handled elsewhere). */
  hideNone?: boolean;
  /** Extra class on the options container, e.g. to switch to a grid layout. */
  className?: string;
}

/** A strip of live, animated cosmetic swatches plus a "None" option. Collapses to
 *  one row by default; a "+" button reveals the full library. */
export function CosmeticSelector({ value, onChange, color, featuredTotal, hideNone, className }: CosmeticSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [showPopover, setShowPopover] = useState(false);

  const cosmeticsUnlocked = useEntitlementStore((s) => s.cosmeticsUnlocked);
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === 'true';
  // Subscribing keeps the grids fresh when a template is saved or deleted.
  useCustomStylesStore((s) => s.templates);
  const removeTemplate = useCustomStylesStore((s) => s.remove);

  async function handlePick(c: Cosmetic) {
    if (isCosmeticLocked(c, { unlocked: cosmeticsUnlocked, billingEnabled })) {
      const ok = await confirmDialog({
        title: 'Premium style',
        message: 'Unlock all premium cosmetics with a one-time $3.99 purchase.',
        confirmLabel: 'Unlock — $3.99',
      });
      if (ok) {
        const result = await startCheckout('cosmetics');
        if (result.error) {
          useCalendarStore.getState().notify(`Couldn't start checkout — ${result.error}`);
        }
      }
      return;
    }
    onChange(c.id);
  }

  const renderSwatch = (c: Cosmetic) => {
    const locked = isCosmeticLocked(c, { unlocked: cosmeticsUnlocked, billingEnabled });
    return (
      <button
        key={c.id}
        type="button"
        className={`cosmetic-swatch cosmetic-${c.id} cosmetic-${c.kind} ${value === c.id ? 'selected' : ''}${locked ? ' is-locked' : ''}`}
        style={color ? ({ '--event-color': color } as React.CSSProperties) : undefined}
        onClick={() => void handlePick(c)}
        title={locked ? `${c.name} — premium` : c.name}
        aria-label={locked ? `${c.name} (premium, locked)` : c.name}
      >
        {locked && (
          <span className="cosmetic-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
        )}
      </button>
    );
  };

  // The collapsed row shows one representative per family (a calm→loud spectrum).
  // If the selected style isn't one of them, swap it into the last slot so the
  // current choice always stays visible without changing the row length.
  const featured = featuredTotal != null ? featuredCosmeticsByCount(featuredTotal) : featuredCosmetics();
  const isSelectedFeatured = value === '' || featured.some((c) => c.id === value);

  const shown = [...featured];
  if (!isSelectedFeatured) {
    const selectedCosmetic = allCosmetics().find((c) => c.id === value);
    if (selectedCosmetic && shown.length > 0) {
      shown[shown.length - 1] = selectedCosmetic;
    }
  }

  return (
    <div className={`cosmetic-options${className ? ` ${className}` : ''}`}>
      {!hideNone && (
        <button
          type="button"
          className={`cosmetic-swatch cosmetic-none ${value === '' ? 'selected' : ''}`}
          onClick={() => onChange('')}
          title="None"
          aria-label="No cosmetic"
        >
          <span className="cosmetic-none-slash" />
        </button>
      )}

      {shown.map(renderSwatch)}

      <button
        ref={setAnchorEl}
        type="button"
        className={`cosmetic-swatch cosmetic-more ${showPopover ? 'selected' : ''}`}
        onClick={() => setShowPopover((prev) => !prev)}
        title="Show all styles"
        aria-label="Show all styles"
        aria-expanded={showPopover}
      >
        +
      </button>

      {showPopover && anchorEl && (
        <AnchoredPopover
          anchorEl={anchorEl}
          onClose={() => setShowPopover(false)}
          placement="right-start"
          className="more-styles-popover"
        >
          <div className="more-styles-container">
            <div className="more-styles-header">
              <h3>All Styles</h3>
              <button
                type="button"
                className="more-styles-close"
                onClick={() => setShowPopover(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="more-styles-body">
              <div className="more-styles-section">
                <div className="more-styles-grid">
                  <button
                    type="button"
                    className={`cosmetic-swatch cosmetic-none ${value === '' ? 'selected' : ''}`}
                    onClick={() => onChange('')}
                    title="None"
                    aria-label="No cosmetic"
                  >
                    <span className="cosmetic-none-slash" />
                  </button>
                </div>
              </div>

              {cosmeticsByFamily().map(({ family, cosmetics }) => (
                <div key={family.id} className="more-styles-section">
                  <div className="more-styles-section-label">
                    <span>{family.label}</span>
                    <span className="more-styles-section-hint">{family.hint}</span>
                  </div>
                  <div className="more-styles-grid">
                    {family.id === 'custom'
                      ? cosmetics.map((c) => (
                          <span key={c.id} className="custom-swatch-wrap">
                            {renderSwatch(c)}
                            <button
                              type="button"
                              className="custom-swatch-del"
                              onClick={(e) => { e.stopPropagation(); removeTemplate(c.id); }}
                              title={`Delete “${c.name}”`}
                              aria-label={`Delete style ${c.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      : cosmetics.map(renderSwatch)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}
