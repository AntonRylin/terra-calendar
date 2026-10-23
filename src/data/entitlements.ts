import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export interface Entitlements {
  /** $3.99 lifetime unlock — advanced cosmetics available on this account. */
  cosmeticsUnlocked: boolean;
  /** Active Cloud subscription — events/settings sync via Supabase. */
  cloudActive: boolean;
}

export const NO_ENTITLEMENTS: Entitlements = { cosmeticsUnlocked: false, cloudActive: false };

const CACHE_PREFIX = 'open-calendar.entitlements.';

/** Last entitlements this user was authoritatively seen with (offline fallback). */
function readCached(userId: string): Entitlements {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return NO_ENTITLEMENTS;
    const p = JSON.parse(raw) as Partial<Entitlements>;
    return { cosmeticsUnlocked: Boolean(p.cosmeticsUnlocked), cloudActive: Boolean(p.cloudActive) };
  } catch {
    return NO_ENTITLEMENTS;
  }
}

function writeCached(userId: string, ent: Entitlements): void {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(ent));
  } catch {
    // ignore — cache is an offline convenience only
  }
}

/**
 * Read the signed-in user's entitlements from their `profiles` row. Safe by
 * default: signed out, unconfigured, or an authoritative "no row" all return
 * NO_ENTITLEMENTS — a missing purchase never becomes a paid feature. A FAILED
 * fetch (offline / server unreachable) instead falls back to the last
 * entitlements this user was seen with, so going offline doesn't silently drop
 * Cloud mode: the sync store set stays stable and offline edits sync back once
 * connectivity returns. The server (RLS) remains the authority for all data.
 */
export async function fetchEntitlements(session: Session | null): Promise<Entitlements> {
  if (!session || !isSupabaseConfigured()) return NO_ENTITLEMENTS;
  try {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('cosmetics_unlocked, cloud_active')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) return readCached(session.user.id); // fetch failed → last known
    const ent: Entitlements = data
      ? {
          cosmeticsUnlocked: Boolean((data as { cosmetics_unlocked?: boolean }).cosmetics_unlocked),
          cloudActive: Boolean((data as { cloud_active?: boolean }).cloud_active),
        }
      : NO_ENTITLEMENTS; // row genuinely missing → authoritative no
    writeCached(session.user.id, ent);
    return ent;
  } catch {
    return readCached(session.user.id);
  }
}
