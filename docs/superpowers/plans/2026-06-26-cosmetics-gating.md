# Cosmetics Gating (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the glow/flashy/AI cosmetics behind the P1 `cosmetics_unlocked` entitlement — but only once billing is live, so the app ships dormant and current users keep everything until purchasing exists.

**Architecture:** A pure tier policy (`isPremiumCosmetic`) and a pure lock predicate (`isCosmeticLocked`, which also reads the `VITE_BILLING_ENABLED` flag + the entitlement) live in `src/core`. The single `CosmeticSelector` reads the entitlement store + billing flag, renders premium swatches as locked for un-entitled users, and routes a locked-swatch click to a confirm → `startCheckout('cosmetics')` instead of selecting. Rendering of already-applied cosmetics is untouched.

**Tech Stack:** React 18, Zustand, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Modify** `src/core/cosmetics.ts` — add `isPremiumCosmetic`. **Test** `src/core/cosmetics.test.ts`.
- **Create** `src/core/cosmeticAccess.ts` — `isCosmeticLocked` pure predicate. **Test** `src/core/cosmeticAccess.test.ts`.
- **Modify** `src/ui/CosmeticSelector.tsx` — lock state, locked-click → confirm → checkout (DRY via a `renderSwatch` helper).
- **Modify** `src/ui/cosmeticSelector.css` — `.is-locked` + `.cosmetic-lock` overlay.
- **Create** `src/ui/CosmeticSelector.test.tsx` — locked swatch blocks selection; free swatch selects.
- **Modify** `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md` and `docs/BILLING_SETUP.md` — progress + the gating note.

---

## Task 1: `isPremiumCosmetic` tier policy

**Files:**
- Modify: `src/core/cosmetics.ts`
- Test: `src/core/cosmetics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/core/cosmetics.test.ts` (add `isPremiumCosmetic` to the existing import from `./cosmetics`, then add this `describe`):

```ts
describe('isPremiumCosmetic', () => {
  it('treats effect and calm as free, glow/flashy/AI as premium', () => {
    expect(isPremiumCosmetic({ id: 'shimmer', family: 'effect' })).toBe(false);
    expect(isPremiumCosmetic({ id: 'aurora', family: 'calm' })).toBe(false);
    expect(isPremiumCosmetic({ id: 'neon-pulse', family: 'glow' })).toBe(true);
    expect(isPremiumCosmetic({ id: 'neon-rush', family: 'flashy' })).toBe(true);
  });

  it('treats every AI cosmetic as premium regardless of family', () => {
    for (const id of ['ai-aura', 'ai-glow', 'ai-spin', 'ai-prism']) {
      const c = COSMETICS.find((x) => x.id === id)!;
      expect(isPremiumCosmetic(c)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/cosmetics.test.ts`
Expected: FAIL — `isPremiumCosmetic` is not exported.

- [ ] **Step 3: Add `isPremiumCosmetic`** to `src/core/cosmetics.ts`

Add at the end of the file (after `resolveCosmetic`):

```ts
/**
 * Premium cosmetics require the $3.99 unlock. Free = Overlay effects + Calm
 * gradients; premium = Glowing + Animated & bold + the AI set. Change the split
 * later by editing this one function (or adding a per-cosmetic override).
 */
export function isPremiumCosmetic(c: Pick<Cosmetic, 'family' | 'id'>): boolean {
  return c.family === 'glow' || c.family === 'flashy' || c.id.startsWith('ai-');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/cosmetics.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/core/cosmetics.ts src/core/cosmetics.test.ts
git commit -m "feat(cosmetics): isPremiumCosmetic tier policy"
```

---

## Task 2: `isCosmeticLocked` lock predicate

**Files:**
- Create: `src/core/cosmeticAccess.ts`
- Test: `src/core/cosmeticAccess.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/cosmeticAccess.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCosmeticLocked } from './cosmeticAccess';

const premium = { id: 'neon-pulse', family: 'glow' as const };
const free = { id: 'aurora', family: 'calm' as const };

describe('isCosmeticLocked', () => {
  it('never locks when billing is not enabled (ships dormant)', () => {
    expect(isCosmeticLocked(premium, { unlocked: false, billingEnabled: false })).toBe(false);
    expect(isCosmeticLocked(free, { unlocked: false, billingEnabled: false })).toBe(false);
  });

  it('locks premium for un-entitled users once billing is live', () => {
    expect(isCosmeticLocked(premium, { unlocked: false, billingEnabled: true })).toBe(true);
    expect(isCosmeticLocked(free, { unlocked: false, billingEnabled: true })).toBe(false);
  });

  it('never locks for entitled users', () => {
    expect(isCosmeticLocked(premium, { unlocked: true, billingEnabled: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/cosmeticAccess.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/core/cosmeticAccess.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/cosmeticAccess.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/cosmeticAccess.ts src/core/cosmeticAccess.test.ts
git commit -m "feat(cosmetics): isCosmeticLocked predicate (dormant until billing)"
```

---

## Task 3: Gate the picker (`CosmeticSelector`)

**Files:**
- Modify: `src/ui/CosmeticSelector.tsx`
- Modify: `src/ui/cosmeticSelector.css`
- Test: `src/ui/CosmeticSelector.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/ui/CosmeticSelector.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../app/entitlementStore', () => ({
  useEntitlementStore: (sel: (s: { cosmeticsUnlocked: boolean }) => unknown) => sel({ cosmeticsUnlocked: false }),
}));
vi.mock('./confirmStore', () => ({ confirmDialog: vi.fn(async () => false) }));
const startCheckout = vi.fn(async () => ({}));
vi.mock('../data/checkout', () => ({ startCheckout: (k: string) => startCheckout(k) }));

import { CosmeticSelector } from './CosmeticSelector';

describe('CosmeticSelector gating', () => {
  beforeEach(() => vi.stubEnv('VITE_BILLING_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('locks premium swatches and does not select them on click', () => {
    const onChange = vi.fn();
    const { container } = render(<CosmeticSelector value="" onChange={onChange} />);
    const locked = container.querySelector('.cosmetic-swatch.is-locked') as HTMLElement;
    expect(locked).toBeTruthy();
    fireEvent.click(locked);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects a free swatch on click', () => {
    const onChange = vi.fn();
    const { container } = render(<CosmeticSelector value="" onChange={onChange} />);
    const free = container.querySelector(
      '.cosmetic-swatch:not(.cosmetic-none):not(.cosmetic-more):not(.is-locked)',
    ) as HTMLElement;
    fireEvent.click(free);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/CosmeticSelector.test.tsx`
Expected: FAIL — no `.cosmetic-swatch.is-locked` exists yet (premium swatches aren't locked).

- [ ] **Step 3: Add imports** to `src/ui/CosmeticSelector.tsx`

Replace the first import line:

```ts
import { COSMETICS, cosmeticsByFamily, featuredCosmetics, featuredCosmeticsByCount } from '../core/cosmetics';
```

with:

```ts
import { COSMETICS, cosmeticsByFamily, featuredCosmetics, featuredCosmeticsByCount, type Cosmetic } from '../core/cosmetics';
import { isCosmeticLocked } from '../core/cosmeticAccess';
import { useEntitlementStore } from '../app/entitlementStore';
import { confirmDialog } from './confirmStore';
import { startCheckout } from '../data/checkout';
```

- [ ] **Step 4: Read entitlement + add the pick handler and swatch renderer**

Inside `CosmeticSelector`, immediately after the `const [showPopover, setShowPopover] = useState(false);` line, add:

```ts
  const cosmeticsUnlocked = useEntitlementStore((s) => s.cosmeticsUnlocked);
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === 'true';

  async function handlePick(c: Cosmetic) {
    if (isCosmeticLocked(c, { unlocked: cosmeticsUnlocked, billingEnabled })) {
      const ok = await confirmDialog({
        title: 'Premium style',
        message: 'Unlock all premium cosmetics with a one-time $3.99 purchase.',
        confirmLabel: 'Unlock — $3.99',
      });
      if (ok) await startCheckout('cosmetics');
      return;
    }
    onChange(c.id);
  }

  const renderSwatch = (c: Cosmetic) => {
    const locked = isCosmeticLocked(c, { unlocked: cosmeticsUnlocked, billingEnabled });
    return (
      <button
        key={c.id}
        type="button"
        className={`cosmetic-swatch cosmetic-${c.id} cosmetic-${c.kind} ${value === c.id ? 'selected' : ''}${locked ? ' is-locked' : ''}`}
        style={color ? ({ '--event-color': color } as React.CSSProperties) : undefined}
        onClick={() => void handlePick(c)}
        title={locked ? `${c.name} — premium` : c.name}
        aria-label={locked ? `${c.name} (premium, locked)` : c.name}
      >
        {locked && (
          <span className="cosmetic-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
        )}
      </button>
    );
  };
```

- [ ] **Step 5: Use `renderSwatch` in both swatch loops**

Replace the collapsed-row loop:

```tsx
      {shown.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`cosmetic-swatch cosmetic-${c.id} cosmetic-${c.kind} ${value === c.id ? 'selected' : ''}`}
          style={color ? ({ '--event-color': color } as React.CSSProperties) : undefined}
          onClick={() => onChange(c.id)}
          title={c.name}
          aria-label={c.name}
        />
      ))}
```

with:

```tsx
      {shown.map(renderSwatch)}
```

And replace the popover loop:

```tsx
                    {cosmetics.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`cosmetic-swatch cosmetic-${c.id} cosmetic-${c.kind} ${value === c.id ? 'selected' : ''}`}
                        style={color ? ({ '--event-color': color } as React.CSSProperties) : undefined}
                        onClick={() => onChange(c.id)}
                        title={c.name}
                        aria-label={c.name}
                      />
                    ))}
```

with:

```tsx
                    {cosmetics.map(renderSwatch)}
```

- [ ] **Step 6: Add the lock styling** to `src/ui/cosmeticSelector.css`

Add `position: relative;` to the existing `.cosmetic-swatch` rule — change:

```css
.cosmetic-swatch {
  width: 34px;
  height: 20px;
```

to:

```css
.cosmetic-swatch {
  position: relative;
  width: 34px;
  height: 20px;
```

Then append at the end of the file:

```css
/* Premium cosmetic locked behind the $3.99 unlock: a dimming overlay + lock. */
.cosmetic-lock {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/ui/CosmeticSelector.test.tsx`
Expected: PASS (2 tests). (`featuredCosmetics()` puts a glow + flashy rep in the collapsed row, which lock under the stubbed billing-on/un-entitled state.)

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/ui/CosmeticSelector.tsx src/ui/cosmeticSelector.css src/ui/CosmeticSelector.test.tsx
git commit -m "feat(cosmetics): lock premium styles in the picker when billing is live"
```

---

## Task 4: Update documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`
- Modify: `docs/BILLING_SETUP.md`

- [ ] **Step 1: Append a progress section to the strategy doc**

Add at the END of `docs/superpowers/specs/2026-06-23-business-model-strategy-design.md`:

```markdown
## Progress (updated 2026-06-26)

- **P0 — unify build + optional auth:** ✅ shipped to `main`.
- **P1 — account + entitlement + Stripe billing:** ✅ code shipped to `main`; inert
  until provisioned (see `docs/BILLING_SETUP.md`).
- **P2 — cosmetics unlock gating:** ✅ shipped to `main`. Glow/flashy/AI cosmetics
  lock behind the $3.99 unlock, but only when `VITE_BILLING_ENABLED=true` — so the
  app ships dormant and current users keep everything until purchasing is live.
- **P3 — cloud sync ($2/mo):** ⏳ not started. Drives repo selection off
  `cloud_active`, per-record sync of events + categories + settings, retires the
  legacy `VITE_BACKEND` switch.
- **Also pending:** website download links + release build; desktop Checkout opener.
```

- [ ] **Step 2: Note the gating in `docs/BILLING_SETUP.md`**

Under the "## 3. Client build" section in `docs/BILLING_SETUP.md`, after the
`VITE_BILLING_ENABLED=true` line, add:

```markdown

`VITE_BILLING_ENABLED` has a dual role: it shows the in-app purchase buttons AND
activates cosmetic gating (glow / animated / AI styles lock behind the $3.99
unlock). Leave it unset and the app stays fully free with every cosmetic available.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-23-business-model-strategy-design.md docs/BILLING_SETUP.md
git commit -m "docs: mark P2 done; document VITE_BILLING_ENABLED gating role"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all pass (prior 371 + Task 1 (2) + Task 2 (3) + Task 3 (2) = 378).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Manual smoke (web build)**

Default build has `VITE_BILLING_ENABLED` unset → confirm **no** cosmetic is locked
(every swatch selectable) — proving the dormant default.
Then run with `VITE_BILLING_ENABLED=true` (e.g. a `.env.local`) → confirm glow/
flashy/AI swatches show a lock and clicking one opens the unlock confirm instead of
selecting; effect/calm swatches select normally. No commit — smoke only.

---

## Self-Review

**Spec coverage (against `2026-06-26-cosmetics-gating-design.md`):**
- Ship dormant (lock only when `VITE_BILLING_ENABLED`) → Task 2 predicate + Task 3 wiring + Task 5 smoke. ✓
- Tier policy by family, one editable function → Task 1. ✓
- Render untouched, only selection gated → Task 3 (`handlePick` blocks `onChange`; `resolveCosmetic`/rendering not modified). ✓
- Locked UX in the single `CosmeticSelector` (lock badge, confirm → checkout) → Task 3. ✓
- Tests for classification, lock predicate states, and selector behavior → Tasks 1–3. ✓
- Docs updated (roadmap + BILLING_SETUP) → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `isPremiumCosmetic(Pick<Cosmetic,'family'|'id'>)` (Task 1) is consumed by `isCosmeticLocked` (Task 2), which is consumed by `CosmeticSelector` (Task 3) with `{ unlocked, billingEnabled }` matching `CosmeticAccess`. `startCheckout('cosmetics')` matches the P1 `CheckoutKind`. `useEntitlementStore((s) => s.cosmeticsUnlocked)` matches the P1 store shape.
