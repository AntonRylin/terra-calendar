# Cosmetics Gating (P2) Design

- **Date:** 2026-06-26
- **Status:** Approved (design); ready for implementation plan
- **Type:** Monetization — gate advanced cosmetics behind the $3.99 lifetime unlock (the P1 `cosmetics_unlocked` entitlement).
- **Roadmap:** P2 of the [business-model strategy](2026-06-23-business-model-strategy-design.md). Depends on P1 (entitlements) which is merged.

## Goal

Make the $3.99 cosmetics unlock *mean something*: free accounts get a generous
set of cosmetics; the eye-catching "premium" set unlocks with the purchase (or a
Cloud subscription, which includes the unlock). Nothing in P1 reads
`cosmetics_unlocked` yet — today all 64 cosmetics are free to everyone. P2 wires
that flag to the picker.

## The critical constraint: ship dormant

If gating activated immediately, every current user would lose the premium
cosmetics with **no way to buy them back** (billing isn't provisioned yet). So
gating only activates when billing is live, behind the same `VITE_BILLING_ENABLED`
flag that already gates the P1 purchase buttons.

**Lock predicate:**

```
locked(cosmetic) = isPremiumCosmetic(cosmetic)
                   && import.meta.env.VITE_BILLING_ENABLED === 'true'
                   && !useEntitlementStore.cosmeticsUnlocked
```

- Today (no billing) → `locked` is always false → zero change for users. **Safe to merge now.**
- After provisioning + `VITE_BILLING_ENABLED=true` → premium styles lock for
  un-entitled accounts; entitled accounts and Cloud subscribers see everything.

## Free vs. premium split (by family)

A single policy function in `src/core/cosmetics.ts`:

```ts
/** Premium cosmetics require the $3.99 unlock. Free = Overlay effects + Calm
 *  gradients; premium = Glowing + Animated & bold + the AI set. Edit this one
 *  function (or add a per-cosmetic override) to change the split later. */
export function isPremiumCosmetic(c: Pick<Cosmetic, 'family' | 'id'>): boolean {
  return c.family === 'glow' || c.family === 'flashy' || c.id.startsWith('ai-');
}
```

- **Free:** `effect` (shimmer, glow, sheen) + `calm` gradients (~33).
- **Premium:** `glow` + `flashy` families + the four `ai-*` styles (~31).

This is explicitly changeable later; the user approved it as a starting split.

## Render vs. select — only selection is gated

Premium cosmetics already applied to events/categories **keep rendering for
everyone** (it's client-side CSS; we don't punish existing data, imports, or
lapsed subscribers). `resolveCosmetic` and all rendering paths are **untouched**.
P2 only blocks *choosing* a locked cosmetic in the picker.

## Locked UX — in `CosmeticSelector` only

`src/ui/CosmeticSelector.tsx` is the single picker used by the event editor, task
form, span form, and the category editor, so gating it there covers every entry
point with no prop-threading.

- The selector reads `cosmeticsUnlocked` from `useEntitlementStore` and the
  billing flag itself (it gains those two dependencies — an acceptable trade for
  a single chokepoint).
- A locked swatch (collapsed row and the "All Styles" popover) gets an `is-locked`
  class: dimmed, with a small lock badge. The collapsed featured row still shows
  the premium family reps (a natural upsell tease).
- Clicking a locked swatch does **not** select it. Instead it shows a confirm
  dialog ("Unlock all premium styles — $3.99?") via the existing `confirmDialog`
  helper; on confirm it calls `startCheckout('cosmetics')` (the P1 helper, opens
  Stripe Checkout). If the user is already entitled, no swatch is ever locked.
- `onChange` is never fired for a locked cosmetic, so no premium id can be written
  to an event/category by an un-entitled user through the UI.

## Components / files

- **Modify** `src/core/cosmetics.ts` — add `isPremiumCosmetic`. **Test** in `src/core/cosmetics.test.ts`.
- **Create** `src/core/cosmeticAccess.ts` — `isCosmeticLocked(cosmetic, { unlocked, billingEnabled })`, a pure predicate (the lock rule), so it's unit-testable without React. **Test** `src/core/cosmeticAccess.test.ts`.
- **Modify** `src/ui/CosmeticSelector.tsx` — read entitlement + billing flag; render lock state; intercept locked clicks → confirm → checkout.
- **Modify** `src/ui/cosmeticSelector.css` — `.cosmetic-swatch.is-locked` styling (dim + lock badge), theme-token-based (light + dark).

## Error handling

- Entitlement unknown/not loaded → treat as **not** unlocked (locked) only when
  billing is enabled; with billing disabled nothing locks, so the unknown state
  is harmless. Fail-safe stays consistent with P1 (`fetchEntitlements` defaults
  false).
- `startCheckout` errors surface via its existing return value; the selector
  shows the error through the app's toast (or the confirm flow no-ops).

## Testing

- `isPremiumCosmetic`: effects + calm → false; glow/flashy → true; every `ai-*` → true.
- `isCosmeticLocked` across the three states: billing off → never locked; billing
  on + not unlocked + premium → locked; billing on + unlocked → never locked; free
  cosmetic → never locked.
- Selector behavior (component test): a locked swatch click does not call
  `onChange`; an unlocked/free swatch click does.

## Documentation to update (per the "update docs thoroughly" preference)

- Mark **P2 done** in the strategy roadmap (`2026-06-23-business-model-strategy-design.md`).
- `docs/BILLING_SETUP.md`: note that once billing is live, the cosmetics unlock
  actually gates the glow/flashy/AI styles (and document `VITE_BILLING_ENABLED`'s
  dual role: purchase buttons **and** gating).

## Out of scope (YAGNI)

- Server-side enforcement of cosmetic rendering (it's client CSS; soft-enforced by
  design — accepted in the strategy).
- A standalone upsell/marketing modal beyond the inline confirm.
- Changing the actual split UX (per-cosmetic overrides) — the policy function
  supports it, but no override is configured now.
