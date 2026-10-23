import type { Session } from '@supabase/supabase-js';
import type { LocalProfile } from './profileStore';

/** The name + avatar actually shown in the UI, resolved from the best source. */
export interface Identity {
  /** Display name, or null when nothing has been set (fall back to initials). */
  name: string | null;
  /** Avatar as a data URL, or null (fall back to initials). */
  avatarDataUrl: string | null;
  /** The signed-in email, if any (shown as secondary text). */
  email: string | null;
}

function metaString(session: Session | null, key: string): string | null {
  const v = session?.user.user_metadata?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** Two initials for the fallback avatar, derived from a name or email. */
export function initials(source: string | null | undefined): string {
  const s = (source ?? '').trim();
  if (!s) return '?';
  // A name like "Ada Lovelace" → "AL"; a single token or email → first two chars.
  const parts = s.split(/[\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const token = parts[0] ?? s;
  return token.slice(0, 2).toUpperCase();
}

/**
 * Resolve the effective identity with a clear precedence:
 *   cloud auth metadata (full_name / avatar_url)  →  local profile  →  email prefix.
 * Signed-in users see their synced cloud identity; local-only users see whatever
 * they set on this device; a bare account with no metadata falls back to its email.
 */
export function effectiveIdentity(
  session: Session | null,
  profile: LocalProfile,
): Identity {
  const email = session?.user.email ?? null;
  const name =
    metaString(session, 'full_name') ??
    (profile.name.trim() !== '' ? profile.name.trim() : null) ??
    (email ? email.split('@')[0] : null);
  const avatarDataUrl = metaString(session, 'avatar_url') ?? profile.avatarDataUrl;
  return { name, avatarDataUrl, email };
}
