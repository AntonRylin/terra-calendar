import { useEffect, useRef } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { useConfirmStore } from './confirmStore';
import { useAndroidBack } from '../app/androidBack';
import './confirmDialog.css';

/**
 * Single app-wide host for confirm dialogs. Renders the active request from the
 * confirm store as a centred modal. Mount once near the app root.
 */
export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const resolve = useConfirmStore((s) => s.resolve);
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Android back answers "Cancel", like a native dialog.
  useAndroidBack(request !== null, () => resolve(null));

  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => {
      primaryRef.current?.focus();
    }, 10);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(null);
      } else if (e.key === 'Enter') {
        const primary = request.actions.find((a) => a.primary) ?? request.actions[0];
        if (primary) {
          e.preventDefault();
          resolve(primary.value);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [request, resolve]);

  if (!request) return null;

  const cancelLabel = request.cancelLabel === undefined ? 'Cancel' : request.cancelLabel;

  return (
    <FloatingPortal>
      <div className="confirm-overlay" onClick={() => resolve(null)}>
        <div
          className="confirm-card"
          role="alertdialog"
          aria-modal="true"
          aria-label={request.title}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="confirm-title">{request.title}</div>
          {request.message && <div className="confirm-message">{request.message}</div>}
          <div className="confirm-actions">
            {request.actions.map((action) => (
              <button
                key={action.value}
                ref={action.primary ? primaryRef : undefined}
                className={
                  'confirm-btn' +
                  (action.danger ? ' danger' : '') +
                  (action.primary && !action.danger ? ' primary' : '')
                }
                onClick={() => resolve(action.value)}
              >
                {action.label}
              </button>
            ))}
            {cancelLabel && (
              <button className="confirm-cancel" onClick={() => resolve(null)}>
                {cancelLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
