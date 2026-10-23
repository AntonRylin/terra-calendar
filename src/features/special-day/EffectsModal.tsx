import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAndroidBack } from '../../app/androidBack';

/** One animation effect. Any number can be on at once; `id` is what's stored in
 *  a special day's `animations` array. */
export interface EffectDef {
  id: string;
  label: string;
  icon: string;
  /** One line the gallery shows under the live preview. */
  desc: string;
}

export const EFFECTS: EffectDef[] = [
  { id: 'sparkles', label: 'Sparkles', icon: '✨', desc: 'Gold stars twinkle across the day.' },
  { id: 'snow', label: 'Snow', icon: '❄️', desc: 'Soft flakes drift down the tile.' },
  { id: 'fireflies', label: 'Fireflies', icon: '🌟', desc: 'Warm dots glow and wander.' },
  { id: 'comet', label: 'Comet', icon: '☄️', desc: 'Shooting stars streak across the day.' },
  { id: 'bubbles', label: 'Bubbles', icon: '🫧', desc: 'Bubbles float up and drift away.' },
  { id: 'confetti', label: 'Confetti', icon: '🎉', desc: 'A colourful shower of paper tumbles down.' },
  { id: 'fireworks', label: 'Fireworks', icon: '🎆', desc: 'Colourful bursts pop across the day.' },
  { id: 'petals', label: 'Blossom', icon: '🌸', desc: 'Cherry petals drift and flutter down.' },
  { id: 'aurora', label: 'Aurora', icon: '🌌', desc: 'Northern lights ripple over the day.' },
  { id: 'hearts', label: 'Hearts', icon: '💗', desc: 'Little hearts float up and away.' },
  { id: 'balloons', label: 'Balloons', icon: '🎈', desc: 'Colourful balloons drift up on a thread.' },
  { id: 'leaves', label: 'Autumn', icon: '🍂', desc: 'Warm leaves tumble and flip downward.' },
  { id: 'notes', label: 'Music', icon: '🎵', desc: 'Colourful notes float up and sway.' },
  { id: 'wiggle', label: 'Wiggle', icon: '💫', desc: 'The day tilts gently, side to side.' },
  { id: 'bounce', label: 'Bounce', icon: '⬆️', desc: 'Bobs up and down; rests when you point at it.' },
  { id: 'rainbow-border', label: 'Rainbow', icon: '🌈', desc: 'A rainbow outline circles the day.' },
];

// The particle overlays mirror MonthGrid's real markup (same SVG star path,
// positions and delays) so a preview shows exactly what lands on the tile.
const SPARKLE_STAR = 'M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z';
const SPARKLES = [
  { top: '15%', left: '25%', delay: '0s' },
  { top: '65%', left: '75%', delay: '0.5s' },
  { top: '35%', left: '80%', delay: '1s' },
  { top: '70%', left: '15%', delay: '1.5s' },
];
const SNOW = [
  { left: '20%', delay: '0s' },
  { left: '50%', delay: '1.2s' },
  { left: '80%', delay: '0.6s' },
  { left: '35%', delay: '2.1s' },
];
const FIREFLIES = [
  { top: '80%', left: '20%', delay: '0s' },
  { top: '60%', left: '60%', delay: '1.5s' },
  { top: '40%', left: '30%', delay: '3s' },
  { top: '75%', left: '75%', delay: '0.8s' },
];
// Comets streak diagonally then rest. Each `top`/`left` is where a streak
// begins; giving every comet its own `dur` (not just a delay) means their
// visible windows drift in and out of phase, so sometimes two cross at once and
// now and then none do — livelier than a fixed one-at-a-time cadence, without a
// swarm.
const COMETS = [
  { top: '6%', left: '5%', delay: '0s', dur: '3.8s' },
  { top: '13%', left: '33%', delay: '0.5s', dur: '4.3s' },
  { top: '9%', left: '70%', delay: '1.4s', dur: '4s' },
  { top: '3%', left: '55%', delay: '2.1s', dur: '3.6s' },
  { top: '19%', left: '18%', delay: '2.7s', dur: '4.6s' },
];
// Bubbles rise from the bottom; varied size, lane and delay keep them organic.
const BUBBLES = [
  { left: '18%', size: 9, delay: '0s' },
  { left: '46%', size: 13, delay: '1.1s' },
  { left: '70%', size: 8, delay: '0.5s' },
  { left: '32%', size: 11, delay: '2.2s' },
  { left: '82%', size: 10, delay: '1.6s' },
];
// Confetti tumbles down its lane; each piece carries its own colour and a spin
// end-angle (--cf-rot) so no two fall alike. Mixed spin directions read as paper
// catching the air rather than a uniform drop.
const CONFETTI = [
  { left: '12%', color: '#ff5fa2', delay: '0s', dur: '2.6s', rot: '760deg' },
  { left: '28%', color: '#ffd23f', delay: '0.8s', dur: '3.1s', rot: '-680deg' },
  { left: '44%', color: '#3fd4ff', delay: '0.3s', dur: '2.9s', rot: '820deg' },
  { left: '60%', color: '#7bffab', delay: '1.4s', dur: '2.7s', rot: '-720deg' },
  { left: '74%', color: '#c46bff', delay: '0.5s', dur: '3.3s', rot: '700deg' },
  { left: '88%', color: '#ff9f43', delay: '1.1s', dur: '2.8s', rot: '-780deg' },
  { left: '36%', color: '#ff5fa2', delay: '1.9s', dur: '3s', rot: '640deg' },
];
// Fireworks — an expanding ring of coloured sparks (the ring is drawn in CSS
// with box-shadows and scaled up). Each burst has its own point, colour and
// out-of-phase duration so they pop one at a time, not in lockstep.
const FIREWORKS = [
  { top: '30%', left: '25%', color: '#ff4d6d', delay: '0s', dur: '2.4s' },
  { top: '55%', left: '68%', color: '#4dd2ff', delay: '0.9s', dur: '2.6s' },
  { top: '22%', left: '72%', color: '#ffd23f', delay: '1.6s', dur: '2.5s' },
  { top: '62%', left: '32%', color: '#b56bff', delay: '2.2s', dur: '2.3s' },
  { top: '42%', left: '50%', color: '#5cff9d', delay: '3s', dur: '2.7s' },
];
// Petals drift from the top, swaying and rotating as they fall — shades of pink
// so a group reads as blossom on the wind.
const PETALS = [
  { left: '15%', color: '#ffb7c5', delay: '0s', dur: '4.5s' },
  { left: '38%', color: '#ff9fb2', delay: '1.3s', dur: '5.2s' },
  { left: '58%', color: '#ffc8dd', delay: '0.6s', dur: '4.8s' },
  { left: '78%', color: '#ffb7c5', delay: '2s', dur: '5s' },
  { left: '48%', color: '#ff8fab', delay: '3.1s', dur: '4.6s' },
];
// Hearts rise like bubbles but in warm pinks and violets; size and lane vary.
const HEART_PATH = 'M12 21s-7.2-4.6-9.6-9.2C1 8.4 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.7 6.2 12 5 14 5c3.4 0 5 3.4 3.6 6.8C19.2 16.4 12 21 12 21z';
const HEARTS = [
  { left: '18%', size: 12, color: '#ff4d8d', delay: '0s', dur: '4.2s' },
  { left: '42%', size: 10, color: '#ff85a1', delay: '1.4s', dur: '4.8s' },
  { left: '66%', size: 13, color: '#c56cff', delay: '0.7s', dur: '4.5s' },
  { left: '80%', size: 9, color: '#ff6b6b', delay: '2.2s', dur: '4.4s' },
  { left: '32%', size: 11, color: '#ff4d8d', delay: '3s', dur: '4.6s' },
];
// Balloons drift up on a thread; each carries its own colour via --balloon.
const BALLOONS = [
  { left: '16%', color: '#ff5a5a', delay: '0s', dur: '5s' },
  { left: '40%', color: '#4db1ff', delay: '1.6s', dur: '5.6s' },
  { left: '62%', color: '#ffd23f', delay: '0.7s', dur: '5.2s' },
  { left: '80%', color: '#7bd16b', delay: '2.4s', dur: '5.4s' },
  { left: '30%', color: '#c46bff', delay: '3.3s', dur: '5.1s' },
];
// Leaves tumble down in warm autumn tones, flipping over as they fall.
const LEAVES = [
  { left: '14%', color: '#e8853d', delay: '0s', dur: '5.2s' },
  { left: '36%', color: '#c1440e', delay: '1.4s', dur: '5.8s' },
  { left: '58%', color: '#e0a92e', delay: '0.6s', dur: '5.4s' },
  { left: '78%', color: '#b7410e', delay: '2.1s', dur: '5.6s' },
  { left: '48%', color: '#d2691e', delay: '3.2s', dur: '5s' },
];
// Music notes float up, swaying and turning; colour via inline fill.
const NOTE_PATH = 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z';
const NOTES = [
  { left: '18%', size: 16, color: '#ff6b9d', delay: '0s', dur: '4.4s' },
  { left: '44%', size: 14, color: '#4db1ff', delay: '1.5s', dur: '4.9s' },
  { left: '66%', size: 17, color: '#ffd23f', delay: '0.7s', dur: '4.6s' },
  { left: '82%', size: 13, color: '#7bffab', delay: '2.3s', dur: '4.5s' },
  { left: '34%', size: 15, color: '#c46bff', delay: '3.1s', dur: '4.7s' },
];

/** A small day-tile playing one effect for real — same classes and keyframes as
 *  the calendar grid, so the preview is the effect, not an impression of it. */
export function EffectPreview({ id, day }: { id: string; day: number }) {
  return (
    <div className={`fx-prev fx-prev-${id}`} aria-hidden="true">
      <span className="fx-prev-num">{day}</span>
      {id === 'sparkles' && (
        <div className="special-day-particles">
          {SPARKLES.map((p, i) => (
            <svg
              key={i}
              className="special-day-sparkle"
              style={{ top: p.top, left: p.left, animationDelay: p.delay }}
              viewBox="0 0 24 24"
            >
              <path d={SPARKLE_STAR} />
            </svg>
          ))}
        </div>
      )}
      {id === 'snow' && (
        <div className="special-day-particles">
          {SNOW.map((p, i) => (
            <div
              key={i}
              className="special-day-snowflake"
              style={{ top: '-5px', left: p.left, animationDelay: p.delay }}
            />
          ))}
        </div>
      )}
      {id === 'fireflies' && (
        <div className="special-day-particles">
          {FIREFLIES.map((p, i) => (
            <div
              key={i}
              className="special-day-firefly"
              style={{ top: p.top, left: p.left, animationDelay: p.delay }}
            />
          ))}
        </div>
      )}
      {id === 'comet' && (
        <div className="special-day-particles">
          {COMETS.map((p, i) => (
            <div
              key={i}
              className="special-day-comet"
              style={{ top: p.top, left: p.left, animationDelay: p.delay, animationDuration: p.dur }}
            />
          ))}
        </div>
      )}
      {id === 'bubbles' && (
        <div className="special-day-particles">
          {BUBBLES.map((p, i) => (
            <div
              key={i}
              className="special-day-bubble"
              style={{ left: p.left, width: p.size, height: p.size, animationDelay: p.delay }}
            />
          ))}
        </div>
      )}
      {id === 'confetti' && (
        <div className="special-day-particles">
          {CONFETTI.map((p, i) => (
            <div
              key={i}
              className="special-day-confetti"
              style={{ left: p.left, background: p.color, animationDelay: p.delay, animationDuration: p.dur, '--cf-rot': p.rot } as CSSProperties}
            />
          ))}
        </div>
      )}
      {id === 'fireworks' && (
        <div className="special-day-particles">
          {FIREWORKS.map((p, i) => (
            <div
              key={i}
              className="special-day-firework"
              style={{ top: p.top, left: p.left, animationDelay: p.delay, animationDuration: p.dur, '--fw': p.color } as CSSProperties}
            />
          ))}
        </div>
      )}
      {id === 'petals' && (
        <div className="special-day-particles">
          {PETALS.map((p, i) => (
            <div
              key={i}
              className="special-day-petal"
              style={{ left: p.left, background: p.color, animationDelay: p.delay, animationDuration: p.dur }}
            />
          ))}
        </div>
      )}
      {id === 'aurora' && (
        <div className="special-day-particles">
          <div className="special-day-aurora" />
        </div>
      )}
      {id === 'hearts' && (
        <div className="special-day-particles">
          {HEARTS.map((p, i) => (
            <svg
              key={i}
              className="special-day-heart"
              style={{ left: p.left, width: p.size, height: p.size, fill: p.color, animationDelay: p.delay, animationDuration: p.dur }}
              viewBox="0 0 24 24"
            >
              <path d={HEART_PATH} />
            </svg>
          ))}
        </div>
      )}
      {id === 'balloons' && (
        <div className="special-day-particles">
          {BALLOONS.map((p, i) => (
            <div
              key={i}
              className="special-day-balloon"
              style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, '--balloon': p.color } as CSSProperties}
            />
          ))}
        </div>
      )}
      {id === 'leaves' && (
        <div className="special-day-particles">
          {LEAVES.map((p, i) => (
            <div
              key={i}
              className="special-day-leaf"
              style={{ left: p.left, background: p.color, animationDelay: p.delay, animationDuration: p.dur }}
            />
          ))}
        </div>
      )}
      {id === 'notes' && (
        <div className="special-day-particles">
          {NOTES.map((p, i) => (
            <svg
              key={i}
              className="special-day-note"
              style={{ left: p.left, width: p.size, height: p.size, fill: p.color, animationDelay: p.delay, animationDuration: p.dur }}
              viewBox="0 0 24 24"
            >
              <path d={NOTE_PATH} />
            </svg>
          ))}
        </div>
      )}
    </div>
  );
}

interface EffectsModalProps {
  /** Ids of the effects currently on. */
  selected: string[];
  /** Day-of-month of the day being styled, shown on every preview tile. */
  day: number;
  onToggle(id: string): void;
  onClear(): void;
  onClose(): void;
}

/** The "big enough" gallery: one live preview per effect, tap to turn on or off,
 *  combine as many as you like. Portals over the special-day panel; the panel
 *  suppresses its own dismiss while this is up (see SpecialDayHost). */
export function EffectsModal({ selected, day, onToggle, onClear, onClose }: EffectsModalProps) {
  // Escape closes just this modal. stopPropagation keeps it from reaching any
  // ancestor dismiss handler (the panel already disables its own while we're up,
  // but this guards the general case — see the nested-popover Escape note).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Android back closes this gallery first (the panel's own back handler is
  // off while it is up).
  useAndroidBack(true, onClose);

  const count = selected.length;

  return createPortal(
    <div className="fx-modal-backdrop" onClick={onClose}>
      <div
        className="fx-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Effects"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fx-modal-head">
          <div>
            <h2 className="fx-modal-title">Effects</h2>
            <p className="fx-modal-sub">Pick any that catch your eye — combine as many as you like.</p>
          </div>
          <button type="button" className="fx-modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="fx-gallery">
          {EFFECTS.map((fx) => {
            const on = selected.includes(fx.id);
            return (
              <button
                key={fx.id}
                type="button"
                className={`fx-card ${on ? 'selected' : ''}`}
                onClick={() => onToggle(fx.id)}
                aria-pressed={on}
                aria-label={fx.label}
              >
                <span className="fx-check" aria-hidden="true">✓</span>
                <EffectPreview id={fx.id} day={day} />
                <span className="fx-card-name">{fx.label}</span>
              </button>
            );
          })}
        </div>

        <div className="fx-modal-foot">
          <span className="fx-foot-count">
            <b>{count}</b> {count === 1 ? 'effect' : 'effects'} on
          </span>
          {count > 0 && (
            <button type="button" className="fx-foot-clear" onClick={onClear}>
              Clear
            </button>
          )}
          <button type="button" className="fx-foot-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
