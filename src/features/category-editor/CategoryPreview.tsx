import { getCategoryStyle, type CategoryConfig } from '../../app/settingsStore';
import { getMatchedEventStyle, cosmeticById } from '../../core/cosmetics';
import '../../ui/cosmetics.css';
import './categoryEditor.css';

interface Props {
  name: string;
  config: CategoryConfig;
  /** Inline rename support: commits on blur/Enter. */
  onRename?(next: string): void;
}

/** Live preview: one soft borderless block with the category name big on top
 *  and the example event below. The event pill is a real `.event-chip` (the
 *  month grid's own class) so it looks exactly like the app: matched
 *  categories get the inline matched style, an animated style gets its cosmetic
 *  classes, and neither means the app's plain default chip. */
export function CategoryPreview({ name, config, onRename }: Props) {
  // An animated style (cosmetic) IS the category's look, so it wins over the
  // matched solid/gradient — mirrors resolveEventLook's priority.
  const cosmetic = cosmeticById(config.cosmetic);
  const matched = Boolean(config.matchEvents) && !cosmetic;
  const eventStyle = matched
    ? (getMatchedEventStyle(config) as React.CSSProperties)
    : cosmetic?.kind === 'effect'
      ? ({ '--event-color': config.type === 'color' ? config.value : config.color1 } as React.CSSProperties)
      : undefined;
  const eventClass =
    (matched && config.type === 'gradient' ? ' event-match-gradient' : '') +
    (cosmetic ? ` cosmetic-${cosmetic.id} cosmetic-${cosmetic.kind}` : '');
  // Gradient cosmetics animate in the big name too: the `cosmetic-swatch` host
  // class pulls in the animated background, which the CSS clips to the text.
  const nameCosmetic = cosmetic?.kind === 'gradient' ? cosmetic : undefined;

  return (
    <div className="catprev">
      <span
        className={`upcoming-type catprev-name${nameCosmetic ? ` cosmetic-swatch cosmetic-${nameCosmetic.id}` : ''}`}
        style={nameCosmetic ? undefined : getCategoryStyle(config)}
        contentEditable={Boolean(onRename)}
        suppressContentEditableWarning
        spellCheck={false}
        title={onRename ? 'Click to rename' : undefined}
        onBlur={(e) => onRename?.(e.currentTarget.textContent ?? '')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).blur();
          }
        }}
      >
        {name}
      </span>
      <div className="catprev-caption">How events will look</div>
      <div className={`event-chip catprev-pill${eventClass}`} style={eventStyle} data-testid="event-preview-pill">
        <span className="event-time">9:00</span> Text event
      </div>
    </div>
  );
}
