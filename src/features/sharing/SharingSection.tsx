import { useEffect, useState } from 'react';
import { useShareStore } from '../../app/shareStore';
import { useSettingsStore } from '../../app/settingsStore';
import { useEntitlementStore } from '../../app/entitlementStore';
import { useAuthStore } from '../../auth/authStore';
import { useCalendarStore } from '../../app/store';
import { confirmDialog } from '../../ui/confirmStore';
import { shareLinkFor } from './shareLink';
import type { Share, ShareDetail, ShareRole, ShareScopeMode } from '../../data/sharing/types';
import { SHARE_MEMBER_LIMIT } from '../../data/sharing/types';
import { useIsMobile } from '../../ui/useMediaQuery';
import { PhoneActionRow, PhoneGroup } from '../settings/PhoneSettings';
import './sharing.css';

/** One line of plain English describing what a share currently covers. */
function describeScope(share: Share): string {
  if (share.scopeMode === 'all') return 'Every event on your calendar';
  if (share.scopeMode === 'manual') return 'Only events you add to it one by one';
  if (share.categories.length === 0) return 'No categories chosen yet — nothing is shared';
  return `Events in ${share.categories.join(', ')}`;
}

export function SharingSection() {
  const shares = useShareStore((s) => s.shares);
  const error = useShareStore((s) => s.error);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const session = useAuthStore((s) => s.session);
  const categories = useSettingsStore((s) => s.categories);
  const notify = useCalendarStore((s) => s.notify);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Family');
  const isMobile = useIsMobile();

  useEffect(() => {
    if (session && cloudActive) void useShareStore.getState().refresh();
  }, [session, cloudActive]);

  // Phones: the empty states as Android rows that lead somewhere.
  if (isMobile && (!session || !cloudActive)) {
    return (
      <section className="settings-section ps-section">
        <PhoneGroup
          footer={<>Already receive a calendar shared through Google or Apple? That keeps working without Cloud — connect the account under Calendars.</>}
        >
          <PhoneActionRow
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            title={session ? 'Share with Cloud' : 'Sign in to share'}
            summary="Send family a link. They see the events you choose — no subscription needed on their side."
            onClick={() => useSettingsStore.getState().openSettings('account')}
          />
        </PhoneGroup>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="settings-section">
        <h3>Sharing</h3>
        <p className="settings-empty">
          Sign in to share your calendar with family.
        </p>
      </section>
    );
  }

  if (!cloudActive) {
    return (
      <section className="settings-section">
        <h3>Sharing</h3>
        <p className="settings-empty">
          Sharing your calendar is part of Cloud. Your family don’t need a subscription —
          they open a link and see the events you chose, free.
        </p>
        <p className="settings-empty">
          Already receive a calendar shared through Google or Apple? That keeps working
          without Cloud — connect the account under <strong>Calendars</strong>.
        </p>
      </section>
    );
  }

  async function handleCreate() {
    const share = await useShareStore.getState().create({
      name: name.trim() || 'Shared calendar',
      scopeMode: 'all',
      categories: [],
      detail: 'full',
      role: 'viewer',
    });
    setCreating(false);
    setName('Family');
    if (share) notify('Share created — copy the link to invite someone');
  }

  async function handleCopy(share: Share) {
    try {
      await navigator.clipboard.writeText(shareLinkFor(share.token));
      notify('Link copied — send it to whoever should see this');
    } catch {
      notify('Couldn’t copy the link');
    }
  }

  async function handleRevoke(share: Share) {
    const ok = await confirmDialog({
      title: `Revoke “${share.name}”?`,
      message:
        'The link stops working and everyone who joined loses access immediately. ' +
        'This cannot be undone — you would have to send a new link.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (ok) await useShareStore.getState().revoke(share.id);
  }

  const categoryNames = Object.keys(categories).sort();

  return (
    <section className="settings-section">
      <h3>Sharing</h3>
      <p className="settings-empty" style={{ marginTop: 0 }}>
        Share your calendar by sending a link. Whoever opens it sees the events you chose —
        they don’t need a subscription, only a free account.
      </p>

      {error && <p className="share-error">{error}</p>}

      {shares.length === 0 && !creating && (
        <p className="settings-empty">You haven’t shared anything yet.</p>
      )}

      <div className="share-list">
        {shares.map((share) => (
          <div key={share.id} className="share-card">
            <div className="share-card-head">
              <input
                className="share-name"
                value={share.name}
                onChange={(e) => void useShareStore.getState().update(share.id, { name: e.target.value })}
                aria-label="Share name"
              />
              <span className="share-members">
                {share.memberCount === 0
                  ? 'Nobody yet'
                  : `${share.memberCount} of ${SHARE_MEMBER_LIMIT} joined`}
              </span>
            </div>

            <p className="share-scope-summary">{describeScope(share)}</p>

            <label className="share-row">
              <span>Include</span>
              <select
                value={share.scopeMode}
                onChange={(e) =>
                  void useShareStore.getState().update(share.id, {
                    scopeMode: e.target.value as ShareScopeMode,
                  })
                }
              >
                <option value="all">Everything</option>
                <option value="categories">Only some categories</option>
                <option value="manual">Only events I pick</option>
              </select>
            </label>

            {share.scopeMode === 'categories' && (
              <div className="share-categories">
                {categoryNames.length === 0 && (
                  <p className="settings-empty">You have no categories yet.</p>
                )}
                {categoryNames.map((cat) => (
                  <label key={cat} className="share-category">
                    <input
                      type="checkbox"
                      checked={share.categories.includes(cat)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...share.categories, cat]
                          : share.categories.filter((c) => c !== cat);
                        void useShareStore.getState().update(share.id, { categories: next });
                      }}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            )}

            <label className="share-row">
              <span>They can</span>
              <select
                value={share.role}
                onChange={(e) =>
                  void useShareStore.getState().update(share.id, {
                    role: e.target.value as ShareRole,
                  })
                }
              >
                <option value="viewer">Only look</option>
                <option value="editor">Change events too</option>
              </select>
            </label>

            <label className="share-row">
              <span>They see</span>
              <select
                value={share.detail}
                onChange={(e) =>
                  void useShareStore.getState().update(share.id, {
                    detail: e.target.value as ShareDetail,
                  })
                }
              >
                <option value="full">Full details</option>
                <option value="busy">Only that you’re busy</option>
              </select>
            </label>

            {share.detail === 'busy' && share.role === 'editor' && (
              <p className="share-note">
                “Busy” hides what the event is, so nobody can change it either — this share
                is effectively view-only until you switch it to full details.
              </p>
            )}

            <div className="share-actions">
              <button className="share-btn" onClick={() => void handleCopy(share)}>
                Copy link
              </button>
              <button className="share-btn share-btn-danger" onClick={() => void handleRevoke(share)}>
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <div className="share-card">
          <label className="share-row">
            <span>Name</span>
            <input
              className="share-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Family"
            />
          </label>
          <p className="share-note">
            Starts off sharing everything, view-only. You can narrow it down straight after.
          </p>
          <div className="share-actions">
            <button className="share-btn" onClick={() => void handleCreate()}>Create</button>
            <button className="share-btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="share-btn share-btn-primary" onClick={() => setCreating(true)}>
          New share
        </button>
      )}
    </section>
  );
}
