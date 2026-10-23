import { useState } from 'react';
import { collapsedGallery, type Design } from './presets';
import './categoryEditor.css';

interface Props {
  mode: 'color' | 'gradient';
  designs: Design[];
  /** The current config.value — used for the selected outline. */
  selectedValue: string;
  cosmeticsUnlocked: boolean;
  onSelect(design: Design): void;
  /** Gradient mode: save (c1, c2) to the library. Solid mode: apply (c, c). */
  onSaveCustom(color1: string, color2: string): void;
  onDeleteCustom(name: string): void;
}

function swatchBackground(d: Design): string {
  return d.kind === 'gradient' ? `linear-gradient(90deg, ${d.color1}, ${d.color2})` : d.color1;
}

/** Nameless swatch grid: collapsed 6×2 with a trailing + tile, expandable into
 *  the grouped gallery (Your gradients / Presets / Premium designs). Names live
 *  in native `title` tooltips (also the touch/screen-reader fallback). */
export function SwatchGrid({ mode, designs, selectedValue, cosmeticsUnlocked, onSelect, onSaveCustom, onDeleteCustom }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [c1, setC1] = useState('#22d3ee');
  const [c2, setC2] = useState('#818cf8');

  const customs = designs.filter((d) => d.custom);
  const presets = designs.filter((d) => !d.custom && !d.premium);
  const premium = designs.filter((d) => d.premium);

  const addLabel = mode === 'gradient' ? 'New custom gradient' : 'Custom color';

  function swatch(d: Design, opts: { deletable?: boolean } = {}) {
    const locked = d.premium && !cosmeticsUnlocked;
    const label = `${d.name} ${d.kind}${d.premium ? ' — premium' : ''}`;
    return (
      <div key={d.id} className="catswatch-cell">
        <button
          type="button"
          className={`catswatch${selectedValue === d.value ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
          style={{ background: swatchBackground(d) }}
          title={label}
          aria-label={label}
          onClick={() => onSelect(d)}
        />
        {opts.deletable && (
          <button
            type="button"
            className="catswatch-delete"
            aria-label={`Delete ${d.name}`}
            title={`Delete ${d.name}`}
            onClick={() => onDeleteCustom(d.name)}
          >
            ×
          </button>
        )}
        {locked && <span className="catswatch-lock" aria-hidden="true">🔒</span>}
      </div>
    );
  }

  const addTile = (
    <button
      type="button"
      className="catswatch catswatch-add"
      aria-label={addLabel}
      title={addLabel}
      onClick={() => setAdding((v) => !v)}
    >
      +
    </button>
  );

  const customFlow = mode === 'gradient' && adding && (
    <div className="catswatch-custom-row">
      <label className="catswatch-custom-label">
        Start
        <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} aria-label="Start color" />
      </label>
      <label className="catswatch-custom-label">
        End
        <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} aria-label="End color" />
      </label>
      <span className="catswatch-custom-strip" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
      <button
        type="button"
        className="tb tb-text tb-primary"
        onClick={() => { onSaveCustom(c1, c2); setAdding(false); }}
      >
        Save gradient
      </button>
    </div>
  );

  const solidFlow = mode === 'color' && adding && (
    <div className="catswatch-custom-row">
      <label className="catswatch-custom-label">
        Color
        <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} aria-label="Custom color" />
      </label>
      <button
        type="button"
        className="tb tb-text tb-primary"
        onClick={() => { onSaveCustom(c1, c1); setAdding(false); }}
      >
        Apply color
      </button>
    </div>
  );

  if (!expanded) {
    return (
      <div className="catswatch-wrap">
        <div className="catswatch-grid">
          {collapsedGallery(designs).map((d) => swatch(d))}
          {addTile}
        </div>
        {customFlow}
        {solidFlow}
        <button type="button" className="catswatch-more" onClick={() => setExpanded(true)}>
          See all designs ▾
        </button>
      </div>
    );
  }

  return (
    <div className="catswatch-wrap">
      {mode === 'gradient' && (
        <>
          <div className="catswatch-group-title">Your gradients</div>
          <div className="catswatch-grid">
            {customs.map((d) => swatch(d, { deletable: true }))}
            {addTile}
          </div>
        </>
      )}
      <div className="catswatch-group-title">Presets</div>
      <div className="catswatch-grid">{presets.map((d) => swatch(d))}{mode === 'color' ? addTile : null}</div>
      {mode === 'gradient' && premium.length > 0 && (
        <>
          <div className="catswatch-group-title">Premium designs</div>
          <div className="catswatch-grid">{premium.map((d) => swatch(d))}</div>
        </>
      )}
      {customFlow}
      {solidFlow}
      <button type="button" className="catswatch-more" onClick={() => setExpanded(false)}>
        Show less ▴
      </button>
    </div>
  );
}
