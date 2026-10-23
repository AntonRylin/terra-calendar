import { useShareStore } from '../../app/shareStore';
import type { Share } from '../../data/sharing/types';

/** Whether a share would carry this event on its own scope alone. */
function coveredByScope(share: Share, type: string | undefined): boolean {
  if (share.scopeMode === 'all') return true;
  if (share.scopeMode === 'categories') return Boolean(type && share.categories.includes(type));
  return false; // 'manual' — only explicit adds
}

/**
 * Per-event sharing: tick a share to add this one event to it, untick to hold
 * this one back.
 *
 * The checkbox shows the EFFECTIVE answer — scope plus overrides — because that
 * is the question the user is actually asking ("can Mum see this?"). Whether it
 * ends up stored as an include or an exclude is bookkeeping they never see.
 */
export function EventSharePicker({
  eventType,
  shareInclude,
  shareExclude,
  onChange,
}: {
  eventType: string | undefined;
  shareInclude: string[] | undefined;
  shareExclude: string[] | undefined;
  onChange: (next: { shareInclude?: string[]; shareExclude?: string[] }) => void;
}) {
  const shares = useShareStore((s) => s.shares);
  if (shares.length === 0) return null;

  const include = shareInclude ?? [];
  const exclude = shareExclude ?? [];

  function isShared(share: Share): boolean {
    if (include.includes(share.id)) return true;
    if (exclude.includes(share.id)) return false;
    return coveredByScope(share, eventType);
  }

  function toggle(share: Share, next: boolean): void {
    // Store the minimum: an override is only recorded when it actually differs
    // from what the share's scope would do on its own. That way, widening a
    // share's scope later still picks this event up.
    const byScope = coveredByScope(share, eventType);
    const nextInclude = include.filter((id) => id !== share.id);
    const nextExclude = exclude.filter((id) => id !== share.id);
    if (next && !byScope) nextInclude.push(share.id);
    if (!next && byScope) nextExclude.push(share.id);
    onChange({
      shareInclude: nextInclude.length > 0 ? nextInclude : undefined,
      shareExclude: nextExclude.length > 0 ? nextExclude : undefined,
    });
  }

  return (
    <div className="event-share-picker">
      <span className="event-share-picker-label">Shared with</span>
      {shares.map((share) => {
        const shared = isShared(share);
        const byScope = coveredByScope(share, eventType);
        return (
          <label key={share.id} className="event-share-option">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => toggle(share, e.target.checked)}
            />
            {share.name}
            {shared !== byScope && (
              <span className="event-share-option-hint">
                {shared ? 'just this event' : 'held back'}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
