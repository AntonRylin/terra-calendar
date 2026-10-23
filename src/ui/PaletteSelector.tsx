import './paletteSelector.css';

export interface PaletteColor {
  value: string;
  bg: string;
  isDefault?: boolean;
}

interface PaletteSelectorProps {
  value: string;
  onChange(color: string): void;
  presets: PaletteColor[];
  allowCustom?: boolean;
}

export function PaletteSelector({ value, onChange, presets, allowCustom = true }: PaletteSelectorProps) {
  const isCustom = value !== '' && !presets.some((p) => p.value === value);

  return (
    <div className="color-options">
      {presets.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`color-circle ${value === p.value ? 'selected' : ''}`}
          style={{ backgroundColor: p.bg }}
          onClick={() => onChange(p.value)}
          title={p.isDefault ? 'Default' : p.value}
        >
          {p.isDefault && <span className="default-slash" />}
        </button>
      ))}

      {allowCustom && (
        <label
          className={`color-circle custom-color-circle ${isCustom ? 'selected' : ''}`}
          style={isCustom ? { backgroundColor: value } : undefined}
          title="Choose custom color"
        >
          <input
            type="color"
            value={isCustom ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="hidden-color-input"
          />
          {!isCustom && <span className="palette-icon">＋</span>}
        </label>
      )}
    </div>
  );
}
