import { describe, it, expect } from 'vitest';
import { isCosmeticLocked } from './cosmeticAccess';
import { ALL_COSMETICS_FREE } from './cosmetics';

const premium = { id: 'neon-pulse', family: 'glow' as const };
const free = { id: 'aurora', family: 'calm' as const };

describe('isCosmeticLocked', () => {
  it('never locks when billing is not enabled (ships dormant)', () => {
    expect(isCosmeticLocked(premium, { unlocked: false, billingEnabled: false })).toBe(false);
    expect(isCosmeticLocked(free, { unlocked: false, billingEnabled: false })).toBe(false);
  });

  // Skipped while the temporary ALL_COSMETICS_FREE promo is on — nothing is
  // premium, so nothing locks. Re-activates unchanged when the flag flips back.
  (ALL_COSMETICS_FREE ? it.skip : it)('locks premium for un-entitled users once billing is live', () => {
    expect(isCosmeticLocked(premium, { unlocked: false, billingEnabled: true })).toBe(true);
    expect(isCosmeticLocked(free, { unlocked: false, billingEnabled: true })).toBe(false);
  });

  (ALL_COSMETICS_FREE ? it : it.skip)('locks nothing during the free-for-all, even with billing live', () => {
    expect(isCosmeticLocked(premium, { unlocked: false, billingEnabled: true })).toBe(false);
    expect(isCosmeticLocked(free, { unlocked: false, billingEnabled: true })).toBe(false);
  });

  it('never locks for entitled users', () => {
    expect(isCosmeticLocked(premium, { unlocked: true, billingEnabled: true })).toBe(false);
  });
});
