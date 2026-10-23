import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../app/settingsStore';
import {
  CLOCK_COLOR_PRESETS,
  CLOCK_FONTS,
  DEFAULT_CLOCK_STYLE,
  clockTextStyle,
  formatClockTime,
  isGradientColor,
  type ClockFormat,
} from '../../core/clockStyle';

const FORMAT_OPTIONS: { id: ClockFormat; label: string }[] = [
  { id: '24h', label: '24-hour' },
  { id: '12h', label: '12-hour' },
  { id: '12h-ampm', label: 'AM / PM' },
];

/** Pull the two hex stops out of a gradient value, if it has them. */
function gradientStops(value: string): [string, string] | null {
  const hexes = value.match(/#[0-9a-fA-F]{6}/g);
  return hexes && hexes.length >= 2 ? [hexes[0], hexes[1]] : null;
}

function buildGradient(from: string, to: string): string {
  return `linear-gradient(90deg, ${from}, ${to})`;
}

/** "Today's clock" customization inside the Appearance panel. Every option is a
 *  tile showing only the live time in that style (its name appears on hover);
 *  clicking the selected tile again puts that choice back to its default. */
export function ClockSection() {
  const clockStyle = useSettingsStore((s) => s.clockStyle);
  const setClockStyle = useSettingsStore((s) => s.setClockStyle);
  const showClockOnToday = useSettingsStore((s) => s.showClockOnToday);
  const setShowClockOnToday = useSettingsStore((s) => s.setShowClockOnToday);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 500);
    return () => clearInterval(timer);
  }, []);

  const presetValues = new Set(CLOCK_COLOR_PRESETS.map((p) => p.value));
  const isCustomSolid = clockStyle.color.startsWith('#') && !presetValues.has(clockStyle.color);
  const isCustomGradient = isGradientColor(clockStyle.color) && !presetValues.has(clockStyle.color);

  const [customSolid, setCustomSolid] = useState(() => (isCustomSolid ? clockStyle.color : '#5e5ce6'));
  const [gradFrom, setGradFrom] = useState(
    () => (isCustomGradient && gradientStops(clockStyle.color)?.[0]) || '#ff9500',
  );
  const [gradTo, setGradTo] = useState(
    () => (isCustomGradient && gradientStops(clockStyle.color)?.[1]) || '#af52de',
  );

  const isDefault =
    clockStyle.format === DEFAULT_CLOCK_STYLE.format &&
    clockStyle.showSeconds === DEFAULT_CLOCK_STYLE.showSeconds &&
    clockStyle.font === DEFAULT_CLOCK_STYLE.font &&
    clockStyle.color === DEFAULT_CLOCK_STYLE.color;

  const toggleCustomGradient = () => {
    setClockStyle({ color: isCustomGradient ? '' : buildGradient(gradFrom, gradTo) });
  };

  return (
    <>
      <h3 className="settings-subhead">Today&apos;s clock</h3>
      <label className="ios-switch-label clock-toggle-row">
        Show clock on today&apos;s day tile
        <div className="ios-switch">
          <input
            type="checkbox"
            checked={showClockOnToday}
            onChange={(e) => setShowClockOnToday(e.target.checked)}
          />
          <span className="ios-switch-slider" />
        </div>
      </label>

      <div className={`clock-settings-body${showClockOnToday ? '' : ' is-disabled'}`}>
        <h4 className="clock-group-label">Format</h4>
        <div className="clock-tile-grid" role="group" aria-label="Time format">
          {FORMAT_OPTIONS.map((opt) => {
            const active = clockStyle.format === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`clock-tile${active ? ' is-active' : ''}`}
                aria-pressed={active}
                aria-label={opt.label}
                onClick={() => setClockStyle({ format: active ? DEFAULT_CLOCK_STYLE.format : opt.id })}
              >
                <span className="clock-tile-time" style={clockTextStyle(clockStyle)}>
                  {formatClockTime(now, { ...clockStyle, format: opt.id })}
                </span>
                <span className="clock-tile-label" aria-hidden="true">
                  {opt.label}
                  {opt.id === DEFAULT_CLOCK_STYLE.format ? ' · default' : ''}
                </span>
              </button>
            );
          })}
        </div>
        <label className="ios-switch-label clock-toggle-row">
          Show seconds
          <div className="ios-switch">
            <input
              type="checkbox"
              checked={clockStyle.showSeconds}
              onChange={(e) => setClockStyle({ showSeconds: e.target.checked })}
            />
            <span className="ios-switch-slider" />
          </div>
        </label>

        <h4 className="clock-group-label">Font</h4>
        <div className="clock-tile-grid" role="group" aria-label="Clock font">
          {CLOCK_FONTS.map((font) => {
            const active = clockStyle.font === font.id;
            return (
              <button
                key={font.id}
                type="button"
                className={`clock-tile${active ? ' is-active' : ''}`}
                aria-pressed={active}
                aria-label={font.name}
                onClick={() => setClockStyle({ font: active ? DEFAULT_CLOCK_STYLE.font : font.id })}
              >
                <span className="clock-tile-time" style={clockTextStyle({ ...clockStyle, font: font.id })}>
                  {formatClockTime(now, clockStyle)}
                </span>
                <span className="clock-tile-label" aria-hidden="true">
                  {font.name}
                  {font.id === DEFAULT_CLOCK_STYLE.font ? ' · default' : ''}
                </span>
              </button>
            );
          })}
        </div>

        <h4 className="clock-group-label">Color</h4>
        <div className="clock-tile-grid" role="group" aria-label="Clock color">
          {CLOCK_COLOR_PRESETS.map((preset) => {
            const active = clockStyle.color === preset.value;
            return (
              <button
                key={preset.id}
                type="button"
                className={`clock-tile${active ? ' is-active' : ''}`}
                aria-pressed={active}
                aria-label={preset.name}
                onClick={() => setClockStyle({ color: active ? DEFAULT_CLOCK_STYLE.color : preset.value })}
              >
                <span className="clock-tile-time" style={clockTextStyle({ ...clockStyle, color: preset.value })}>
                  {formatClockTime(now, clockStyle)}
                </span>
                <span className="clock-tile-label" aria-hidden="true">
                  {preset.name}
                  {preset.value === DEFAULT_CLOCK_STYLE.color ? ' · default' : ''}
                </span>
              </button>
            );
          })}

          <label className={`clock-tile clock-tile-custom${isCustomSolid ? ' is-active' : ''}`}>
            <span
              className="clock-tile-time"
              style={clockTextStyle({ ...clockStyle, color: isCustomSolid ? clockStyle.color : customSolid })}
            >
              {formatClockTime(now, clockStyle)}
            </span>
            <span className="clock-tile-label" aria-hidden="true">Custom color</span>
            <input
              type="color"
              className="hidden-color-input"
              aria-label="Custom color"
              value={isCustomSolid ? clockStyle.color : customSolid}
              onChange={(e) => {
                setCustomSolid(e.target.value);
                setClockStyle({ color: e.target.value });
              }}
            />
          </label>

          <div
            className={`clock-tile clock-tile-custom clock-tile-gradient${isCustomGradient ? ' is-active' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={isCustomGradient}
            aria-label="Custom gradient"
            onClick={toggleCustomGradient}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleCustomGradient();
              }
            }}
          >
            <span
              className="clock-tile-time"
              style={clockTextStyle({ ...clockStyle, color: buildGradient(gradFrom, gradTo) })}
            >
              {formatClockTime(now, clockStyle)}
            </span>
            <span className="clock-tile-label" aria-hidden="true">Custom gradient</span>
            <span className="clock-grad-swatches" onClick={(e) => e.stopPropagation()}>
              <input
                type="color"
                aria-label="Gradient start color"
                value={gradFrom}
                onChange={(e) => {
                  setGradFrom(e.target.value);
                  if (isCustomGradient) setClockStyle({ color: buildGradient(e.target.value, gradTo) });
                }}
              />
              <input
                type="color"
                aria-label="Gradient end color"
                value={gradTo}
                onChange={(e) => {
                  setGradTo(e.target.value);
                  if (isCustomGradient) setClockStyle({ color: buildGradient(gradFrom, e.target.value) });
                }}
              />
            </span>
          </div>
        </div>

        {!isDefault && (
          <button
            className="clock-reset-btn"
            onClick={() => setClockStyle({ ...DEFAULT_CLOCK_STYLE })}
          >
            Reset to default
          </button>
        )}
      </div>
    </>
  );
}
