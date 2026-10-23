import { isPremiumCosmetic } from './cosmetics';
import type { Cosmetic } from './cosmetics';

export interface CosmeticAccess {
  /** The user has the cosmetics unlock (or Cloud, which includes it). */
  unlocked: boolean;
  /** Billing is live in this build (VITE_BILLING_ENABLED). */
  billingEnabled: boolean;
}

/**
 * Whether a cosmetic is locked behind the premium unlock for this user. Locks
 * only when billing is live (so the app ships dormant — no gating until
 * purchasing exists) AND the user has not unlocked. Free cosmetics never lock.
 */
export function isCosmeticLocked(c: Pick<Cosmetic, 'family' | 'id'>, access: CosmeticAccess): boolean {
  if (!access.billingEnabled || access.unlocked) return false;
  return isPremiumCosmetic(c);
}
