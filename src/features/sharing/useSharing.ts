import { useEffect } from 'react';
import { useAuthStore } from '../../auth/authStore';
import { useCalendarStore } from '../../app/store';
import { useSharedEventsStore } from '../../app/sharedEventsStore';
import { useShareStore } from '../../app/shareStore';
import { useEntitlementStore } from '../../app/entitlementStore';
import { isSupabaseConfigured } from '../../data/supabaseClient';
import { joinShare } from '../../data/sharing/sharesApi';
import { clearShareToken, pendingShareToken } from './shareLink';

/**
 * Keeps the two halves of sharing in sync with the session.
 *
 * Receiving is deliberately NOT gated on the subscription: the sharer pays, and
 * the people they share with only need an account. Owning shares is gated,
 * server-side, by the insert policy in migration 0014.
 */
export function useSharing(): void {
  const session = useAuthStore((s) => s.session);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const userId = session?.user.id ?? null;

  // Redeem an invite link. Runs before the first fetch below so the newly
  // joined calendar is already visible on the first paint after signing in.
  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    const token = pendingShareToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        await joinShare(token);
        if (cancelled) return;
        clearShareToken();
        await useSharedEventsStore.getState().refresh();
        useCalendarStore.getState().notify('Shared calendar added');
      } catch (err) {
        if (!cancelled) useCalendarStore.getState().notify((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Pull the calendars others share with this user; clear them on sign-out so
  // one account's shared events can never linger into the next session.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!userId) {
      useSharedEventsStore.getState().clear();
      useShareStore.getState().clear();
      return;
    }
    void useSharedEventsStore.getState().refresh();
  }, [userId]);

  // The user's own shares, for the Settings panel and the per-event picker.
  useEffect(() => {
    if (!isSupabaseConfigured() || !userId || !cloudActive) return;
    void useShareStore.getState().refresh();
  }, [userId, cloudActive]);

  // Someone else's edits show up on focus and when the network returns — the
  // same cadence the calendar itself already re-syncs on.
  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    const resync = () => void useSharedEventsStore.getState().refresh();
    window.addEventListener('focus', resync);
    window.addEventListener('online', resync);
    return () => {
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', resync);
    };
  }, [userId]);
}
