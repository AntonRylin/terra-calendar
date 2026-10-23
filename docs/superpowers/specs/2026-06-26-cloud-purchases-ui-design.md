# Cloud & Purchases UI Design

- **Date:** 2026-06-26
- **Status:** Approved; small UI change (built inline).
- **Type:** Monetization UX — surface the Subscribe / Unlock buttons + Cloud status.

## Goal

Make the purchase + cloud-status UI visible and discoverable in Settings → Account
whenever a user is signed in — instead of being hidden behind `VITE_BILLING_ENABLED`.

## Change

In `src/features/settings/Settings.tsx`, the signed-in branch of the Account
section becomes an always-visible **Cloud & Purchases** block (no `billingEnabled`
gate):

- **Cloud sync row:** label + status (`On — events sync across your devices` when
  `cloud_active`, else `Off`) + a **`Subscribe — $2/mo`** button when not active
  (→ `startCheckout('cloud')`).
- **Premium cosmetics row:** status (`Unlocked ✓` / `Locked`) + an **`Unlock —
  $3.99`** button when not unlocked (→ `startCheckout('cosmetics')`).
- Reuses existing `settings-*` classes (no new CSS).
- The `buy()` helper's failure toast is made actionable: if checkout can't start
  (e.g. the Stripe edge function isn't deployed yet), it points to
  `docs/BILLING_SETUP.md`.
- The now-unused `billingEnabled` const is removed from `Settings.tsx`.

## Deliberately unchanged

- **Cosmetic *locking* in the picker (P2)** stays gated by `VITE_BILLING_ENABLED` —
  free users must never lose styles before purchasing is actually live. Showing the
  *buttons* is harmless; locking the *picker* degrades the free UX, so it stays gated.
- "Switch to cloud" is **not** a manual toggle — cloud mode follows the subscription
  (`cloud_active`); the row only reflects status.

## Out of scope

- Stripe Customer Portal ("Manage subscription") — needs another edge function; later.
- P3b (categories + settings cloud sync) — next cycle.

## Verification

Typecheck + a browser smoke: signed-in Account shows both rows + buttons; clicking
without Stripe deployed shows the actionable toast.
