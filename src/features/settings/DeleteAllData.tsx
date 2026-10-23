import { useState } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { useAndroidBack } from '../../app/androidBack';
import { useCalendarStore } from '../../app/store';
import { useConnectionStore } from '../../app/connectionStore';
import { confirmChoice } from '../../ui/confirmStore';
import { DELETE_ALL_PHRASE, deleteAllData, type DeleteAllMode } from '../../data/deleteAllData';

/**
 * "Danger zone" of the Data panel: delete every trace of app data. With
 * calendars connected the user first chooses whether the events synced to those
 * calendars go too; either way the wipe itself only runs after typing the
 * confirmation phrase.
 */
export function DeleteAllDataSection() {
  const notify = useCalendarStore((s) => s.notify);
  const caldav = useConnectionStore((s) => s.caldav);
  const google = useConnectionStore((s) => s.google);
  const isConnected = Boolean(caldav || google);
  const [mode, setMode] = useState<DeleteAllMode | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  const connectedNames = [caldav && 'Apple Calendar', google && 'Google Calendar']
    .filter(Boolean)
    .join(' and ');

  async function start() {
    if (!isConnected) {
      setPhrase('');
      setMode('everywhere');
      return;
    }
    const choice = await confirmChoice({
      title: 'Calendars are connected',
      message:
        `To delete all data, ${connectedNames} must be disconnected first. ` +
        'Choose what happens to the events already synced to ' +
        (caldav && google ? 'those accounts' : 'that account') +
        '.',
      cancelLabel: 'Cancel',
      actions: [
        { label: 'Disconnect calendars & delete local data', value: 'local-only', primary: true },
        { label: 'Delete data here and in connected calendars', value: 'everywhere', danger: true },
      ],
    });
    if (choice !== 'everywhere' && choice !== 'local-only') return;
    setPhrase('');
    setMode(choice);
  }

  async function run() {
    if (phrase.trim() !== DELETE_ALL_PHRASE || busy || !mode) return;
    setBusy(true);
    try {
      // On success this reloads the page — nothing runs after it.
      await deleteAllData(mode);
    } catch (e) {
      setBusy(false);
      setMode(null);
      notify(`Couldn't delete all data: ${(e as Error).message}`);
    }
  }

  const dismiss = () => {
    if (!busy) setMode(null);
  };
  useAndroidBack(Boolean(mode), dismiss);

  const armed = phrase.trim() === DELETE_ALL_PHRASE;

  return (
    <>
      <h3 className="settings-subhead" style={{ marginTop: 'var(--space-4)', color: 'var(--color-danger, #ff453a)' }}>
        Danger zone
      </h3>
      <p className="settings-empty">
        Permanently delete all events, categories, styles, habits, images and settings.
        {isConnected && ' Connected calendars have to be disconnected first — you choose what happens to their events.'}
      </p>
      <button className="settings-cleanup-btn" onClick={() => void start()}>
        Delete all data…
      </button>

      {mode && (
        <FloatingPortal>
          <div className="confirm-overlay" onClick={dismiss}>
            <div
              className="confirm-card"
              role="alertdialog"
              aria-modal="true"
              aria-label="Delete all data"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-title">Delete all data</div>
              <div className="confirm-message">
                {mode === 'everywhere' && isConnected
                  ? `Every event will also be deleted from ${connectedNames}, the account${caldav && google ? 's' : ''} will be disconnected, and everything stored in this app will be erased.`
                  : mode === 'local-only'
                    ? `${connectedNames} will be disconnected — events already synced there stay in ${caldav && google ? 'those accounts' : 'that account'}. Everything stored in this app will be erased.`
                    : 'Everything stored in this app will be erased.'}{' '}
                This cannot be undone.
              </div>
              <div className="confirm-message">
                Type <strong>{DELETE_ALL_PHRASE}</strong> to confirm.
              </div>
              <input
                className="settings-mode delete-all-phrase"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder={DELETE_ALL_PHRASE}
                value={phrase}
                disabled={busy}
                onChange={(e) => setPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void run();
                  if (e.key === 'Escape') dismiss();
                }}
              />
              <div className="confirm-actions">
                <button className="confirm-btn danger" disabled={!armed || busy} onClick={() => void run()}>
                  {busy ? 'Deleting…' : 'Delete all data'}
                </button>
                <button className="confirm-cancel" disabled={busy} onClick={dismiss}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
