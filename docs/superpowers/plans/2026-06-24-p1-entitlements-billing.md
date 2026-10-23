# P1 — Entitlements & Stripe Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, working entitlement + billing layer: a per-user `profiles` row in Supabase (written only by a Stripe webhook), a client entitlement store, and Stripe Checkout for the $3.99 lifetime cosmetics unlock and the $2/mo Cloud subscription.

**Architecture:** Entitlements live in a `public.profiles` table guarded by RLS — clients may **read** their own row but never write entitlement fields; only the service-role Stripe webhook writes them (hard-enforced). The client fetches entitlements after auth and exposes them via a Zustand store (defaults all-false: signed-out, unconfigured, or on error). Purchases go through two Supabase Edge Functions: `create-checkout` (creates a Stripe Checkout Session bound to the user via `client_reference_id`) and `stripe-webhook` (verifies the signature and flips entitlement flags on purchase/subscription events). Nothing reads entitlements yet to gate features — that is P2/P3 — so this phase is safe to ship: it changes no existing behavior.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions/Deno), Stripe (Checkout + webhooks), React 18 + Zustand + TypeScript client, Vitest + Testing Library.

**Split:** Tasks 1–4 (client + DB schema) are fully built and unit-tested now with no external infra. Tasks 5–8 (Edge Functions, purchase UI, provisioning) are authored now but only become live once YOU provision Stripe + deploy the functions; they cannot be end-to-end tested in CI.

---

## File Structure

- **Create** `supabase/migrations/0004_add_profiles.sql` — `profiles` table, RLS, signup trigger.
- **Create** `src/data/entitlements.ts` — `fetchEntitlements(session)` + `Entitlements` type (pure data access).
- **Create** `src/data/entitlements.test.ts` — unit tests with a mocked Supabase client.
- **Create** `src/app/entitlementStore.ts` — Zustand store holding current entitlements.
- **Create** `src/app/entitlementStore.test.ts` — store unit tests.
- **Modify** `src/App.tsx` — refresh entitlements when the auth session changes.
- **Create** `src/data/checkout.ts` — `startCheckout(kind)` client helper (invokes the Edge Function, opens Stripe Checkout).
- **Create** `src/data/checkout.test.ts` — unit tests with a mocked Supabase client.
- **Create** `supabase/functions/create-checkout/index.ts` — Deno Edge Function (authored; user deploys).
- **Create** `supabase/functions/stripe-webhook/index.ts` — Deno Edge Function (authored; user deploys).
- **Modify** `src/features/settings/Settings.tsx` — purchase buttons + entitlement status in the Account section.
- **Create** `docs/BILLING_SETUP.md` — exact Stripe + Supabase provisioning checklist.
- **Modify** `.env.example` (create if absent) — document the new env vars.

---

## Task 1: Supabase `profiles` schema + RLS

**Files:**
- Create: `supabase/migrations/0004_add_profiles.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_add_profiles.sql`:

```sql
-- Per-user entitlements. Clients may READ their own row; entitlement fields are
-- written ONLY by the service-role Stripe webhook (which bypasses RLS), so a
-- patched client cannot grant itself a paid feature.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cosmetics_unlocked boolean not null default false,
  cloud_active boolean not null default false,
  plan text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

alter table public.profiles enable row level security;

-- Read-only for the owner. No insert/update/delete policies for authenticated
-- users → the only writer is the service role (webhook).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Verify it parses (no live DB needed)**

This migration is applied by the user against their Supabase project (`supabase db push` or the SQL editor). There is no local DB in CI. Visually confirm: table has the five entitlement/identity columns + timestamps, RLS enabled, a single SELECT policy scoped to `auth.uid()`, and the signup trigger. No syntax placeholders remain.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_add_profiles.sql
git commit -m "feat(db): profiles table + RLS for entitlements"
```

---

## Task 2: `fetchEntitlements` data accessor

**Files:**
- Create: `src/data/entitlements.ts`
- Test: `src/data/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/entitlements.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ from }),
}));

import { fetchEntitlements, NO_ENTITLEMENTS } from './entitlements';

const session = { user: { id: 'user-1' } } as unknown as Session;

describe('fetchEntitlements', () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    from.mockClear();
  });

  it('returns all-false when there is no session', async () => {
    expect(await fetchEntitlements(null)).toEqual(NO_ENTITLEMENTS);
    expect(from).not.toHaveBeenCalled();
  });

  it('maps the profile row to entitlements', async () => {
    maybeSingle.mockResolvedValue({ data: { cosmetics_unlocked: true, cloud_active: false }, error: null });
    expect(await fetchEntitlements(session)).toEqual({ cosmeticsUnlocked: true, cloudActive: false });
    expect(from).toHaveBeenCalledWith('profiles');
  });

  it('returns all-false on error or missing row', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await fetchEntitlements(session)).toEqual(NO_ENTITLEMENTS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/entitlements.test.ts`
Expected: FAIL — `entitlements.ts` does not exist yet.

- [ ] **Step 3: Write `src/data/entitlements.ts`**

```ts
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export interface Entitlements {
  /** $3.99 lifetime unlock — advanced cosmetics available on this account. */
  cosmeticsUnlocked: boolean;
  /** Active Cloud subscription — events/settings sync via Supabase. */
  cloudActive: boolean;
}

export const NO_ENTITLEMENTS: Entitlements = { cosmeticsUnlocked: false, cloudActive: false };

/**
 * Read the signed-in user's entitlements from their `profiles` row. Safe by
 * default: returns NO_ENTITLEMENTS when signed out, when Supabase isn't
 * configured, on any error, or when the row is missing — so a failure never
 * grants a paid feature.
 */
export async function fetchEntitlements(session: Session | null): Promise<Entitlements> {
  if (!session || !isSupabaseConfigured()) return NO_ENTITLEMENTS;
  try {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('cosmetics_unlocked, cloud_active')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error || !data) return NO_ENTITLEMENTS;
    return {
      cosmeticsUnlocked: Boolean((data as { cosmetics_unlocked?: boolean }).cosmetics_unlocked),
      cloudActive: Boolean((data as { cloud_active?: boolean }).cloud_active),
    };
  } catch {
    return NO_ENTITLEMENTS;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/entitlements.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/entitlements.ts src/data/entitlements.test.ts
git commit -m "feat(entitlements): fetch per-user entitlements from profiles"
```

---

## Task 3: Entitlement store + App wiring

**Files:**
- Create: `src/app/entitlementStore.ts`
- Test: `src/app/entitlementStore.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/entitlementStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchEntitlements = vi.fn();
vi.mock('../data/entitlements', () => ({
  NO_ENTITLEMENTS: { cosmeticsUnlocked: false, cloudActive: false },
  fetchEntitlements: (s: unknown) => fetchEntitlements(s),
}));
vi.mock('../auth/authStore', () => ({
  useAuthStore: { getState: () => ({ session: { user: { id: 'u1' } } }) },
}));

import { useEntitlementStore } from './entitlementStore';

describe('entitlementStore', () => {
  beforeEach(() => {
    fetchEntitlements.mockReset();
    useEntitlementStore.setState({ cosmeticsUnlocked: false, cloudActive: false, loaded: false });
  });

  it('defaults to all-false and not loaded', () => {
    const s = useEntitlementStore.getState();
    expect(s.cosmeticsUnlocked).toBe(false);
    expect(s.cloudActive).toBe(false);
    expect(s.loaded).toBe(false);
  });

  it('refresh() pulls entitlements for the current session and marks loaded', async () => {
    fetchEntitlements.mockResolvedValue({ cosmeticsUnlocked: true, cloudActive: true });
    await useEntitlementStore.getState().refresh();
    const s = useEntitlementStore.getState();
    expect(s.cosmeticsUnlocked).toBe(true);
    expect(s.cloudActive).toBe(true);
    expect(s.loaded).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/entitlementStore.test.ts`
Expected: FAIL — `entitlementStore.ts` does not exist yet.

- [ ] **Step 3: Write `src/app/entitlementStore.ts`**

```ts
import { create } from 'zustand';
import { fetchEntitlements, NO_ENTITLEMENTS, type Entitlements } from '../data/entitlements';
import { useAuthStore } from '../auth/authStore';

interface EntitlementState extends Entitlements {
  /** True once a fetch has resolved at least once (so UI can tell unknown from false). */
  loaded: boolean;
  /** Re-fetch entitlements for the current auth session. */
  refresh(): Promise<void>;
}

export const useEntitlementStore = create<EntitlementState>((set) => ({
  ...NO_ENTITLEMENTS,
  loaded: false,
  async refresh() {
    const session = useAuthStore.getState().session;
    const ent = await fetchEntitlements(session);
    set({ ...ent, loaded: true });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/entitlementStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire entitlement refresh into `src/App.tsx`**

Add the import next to the other store imports:

```ts
import { useEntitlementStore } from './app/entitlementStore';
```

Add this hook to the `App` component, immediately AFTER the existing "Optional account" auth-init effect (the one containing `return useAuthStore.getState().init();`):

```ts
  // Re-fetch entitlements whenever the signed-in user changes (sign-in/out).
  const session = useAuthStore((s) => s.session);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void useEntitlementStore.getState().refresh();
  }, [session]);
```

(`useAuthStore`, `isSupabaseConfigured`, and `useEffect` are already imported in `App.tsx`.)

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` → expected: all pass (prior 344 + 3 from Task 2 + 2 here = 349).
Run: `npx tsc --noEmit` → expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/entitlementStore.ts src/app/entitlementStore.test.ts src/App.tsx
git commit -m "feat(entitlements): entitlement store, refreshed on auth change"
```

---

## Task 4: `startCheckout` client helper

**Files:**
- Create: `src/data/checkout.ts`
- Test: `src/data/checkout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/checkout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: { getSession }, functions: { invoke } }),
}));

import { startCheckout } from './checkout';

describe('startCheckout', () => {
  beforeEach(() => {
    invoke.mockReset();
    getSession.mockReset();
    // jsdom: make location.href assignable without navigating.
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('errors when not signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const result = await startCheckout('cosmetics');
    expect(result.error).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes create-checkout with the kind and redirects to the returned url', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/abc' }, error: null });
    const result = await startCheckout('cloud');
    expect(result.error).toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('create-checkout', { body: { kind: 'cloud' } });
    expect(window.location.href).toBe('https://checkout.stripe.com/abc');
  });

  it('surfaces a function error', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    invoke.mockResolvedValue({ data: null, error: { message: 'no price configured' } });
    const result = await startCheckout('cosmetics');
    expect(result.error).toContain('no price configured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/checkout.test.ts`
Expected: FAIL — `checkout.ts` does not exist yet.

- [ ] **Step 3: Write `src/data/checkout.ts`**

```ts
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export type CheckoutKind = 'cosmetics' | 'cloud';

/**
 * Start a Stripe Checkout for a purchase. Calls the `create-checkout` Edge
 * Function (which binds the session to the signed-in user), then sends the
 * browser to the returned Stripe Checkout URL. The webhook is the source of
 * truth for entitlement; on return the app re-fetches entitlements.
 *
 * NOTE (desktop): on the Tauri build this navigates the webview to Stripe. A
 * follow-up will open Checkout in the system browser instead (needs a Tauri
 * opener plugin); the web build works as-is. Tracked in docs/BILLING_SETUP.md.
 */
export async function startCheckout(kind: CheckoutKind): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) return { error: 'Accounts are not configured.' };
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Sign in first.' };

  const { data, error } = await supabase.functions.invoke('create-checkout', { body: { kind } });
  if (error) return { error: error.message };
  const url = (data as { url?: string } | null)?.url;
  if (!url) return { error: 'Checkout is not available right now.' };
  window.location.href = url;
  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/checkout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/checkout.ts src/data/checkout.test.ts
git commit -m "feat(billing): startCheckout client helper"
```

---

## Task 5: `create-checkout` Edge Function

Authored now; deployed and tested by the user (needs Stripe keys). Not run in CI.

**Files:**
- Create: `supabase/functions/create-checkout/index.ts`

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/create-checkout/index.ts`:

```ts
// Supabase Edge Function (Deno). Creates a Stripe Checkout Session bound to the
// signed-in user via client_reference_id, so the webhook can grant the right
// account. Deploy with: supabase functions deploy create-checkout
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

const PRICE: Record<string, { price: string; mode: 'payment' | 'subscription' }> = {
  cosmetics: { price: Deno.env.get('STRIPE_PRICE_COSMETICS')!, mode: 'payment' },
  cloud: { price: Deno.env.get('STRIPE_PRICE_CLOUD')!, mode: 'subscription' },
};

const APP_URL = Deno.env.get('APP_URL') ?? '*';

const cors = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { kind } = await req.json();
    const entry = PRICE[kind];
    if (!entry?.price) {
      return new Response(JSON.stringify({ error: 'Unknown or unconfigured product.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Identify the caller from their Supabase JWT (forwarded by the client).
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not signed in.' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const successUrl = `${Deno.env.get('APP_URL') ?? ''}/?checkout=success`;
    const cancelUrl = `${Deno.env.get('APP_URL') ?? ''}/?checkout=cancel`;

    const checkout = await stripe.checkout.sessions.create({
      mode: entry.mode,
      line_items: [{ price: entry.price, quantity: 1 }],
      client_reference_id: user.id,
      // Carry the user id onto the subscription too, so lifecycle events map back.
      subscription_data: entry.mode === 'subscription' ? { metadata: { user_id: user.id } } : undefined,
      metadata: { user_id: user.id, kind },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(JSON.stringify({ url: checkout.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/create-checkout/index.ts
git commit -m "feat(billing): create-checkout edge function"
```

---

## Task 6: `stripe-webhook` Edge Function

Authored now; deployed and tested by the user. Not run in CI.

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/stripe-webhook/index.ts`:

```ts
// Supabase Edge Function (Deno). The ONLY writer of entitlement fields. Verifies
// the Stripe signature, then flips profiles flags using the service-role key
// (bypasses RLS). Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Service-role client → bypasses RLS so it can write entitlement fields.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function setEntitlements(userId: string, patch: Record<string, unknown>) {
  await admin
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`Invalid signature: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id ?? (s.metadata?.user_id as string | undefined);
        if (!userId) break;
        if (s.mode === 'payment') {
          await setEntitlements(userId, { cosmetics_unlocked: true });
        } else if (s.mode === 'subscription') {
          await setEntitlements(userId, {
            cloud_active: true,
            cosmetics_unlocked: true, // Cloud includes the cosmetics unlock.
            plan: 'cloud',
            stripe_customer_id: s.customer as string,
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const active = sub.status === 'active' || sub.status === 'trialing';
        const userId = sub.metadata?.user_id as string | undefined;
        if (userId) {
          await setEntitlements(userId, { cloud_active: active, plan: active ? 'cloud' : null });
        } else if (sub.customer) {
          // Fall back to the customer id stored at checkout.
          await admin
            .from('profiles')
            .update({ cloud_active: active, plan: active ? 'cloud' : null, updated_at: new Date().toISOString() })
            .eq('stripe_customer_id', sub.customer as string);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return new Response(`Handler error: ${(e as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(billing): stripe-webhook edge function (writes entitlements)"
```

---

## Task 7: Purchase UI + entitlement status in Settings

**Files:**
- Modify: `src/features/settings/Settings.tsx`

Purchase buttons appear only when signed in AND billing is enabled at build time
(`VITE_BILLING_ENABLED === 'true'`), so they never show before the functions are deployed.
Entitlement status (unlocked/active) shows whenever signed in.

- [ ] **Step 1: Add imports**

In `src/features/settings/Settings.tsx`, add:

```ts
import { useEntitlementStore } from '../../app/entitlementStore';
import { startCheckout, type CheckoutKind } from '../../data/checkout';
```

- [ ] **Step 2: Read entitlements + add a purchase handler**

After the existing `const [account, setAccount] = useState({...});` block, add:

```ts
  const cosmeticsUnlocked = useEntitlementStore((s) => s.cosmeticsUnlocked);
  const cloudActive = useEntitlementStore((s) => s.cloudActive);
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === 'true';

  async function buy(kind: CheckoutKind) {
    const result = await startCheckout(kind);
    if (result.error) notify(`Couldn't start checkout — ${result.error}`);
  }
```

- [ ] **Step 3: Render status + buy buttons inside the signed-in branch**

In the Account section, find the signed-in branch (the `session ? (` arm) and replace its inner content:

```tsx
                  <>
                    <p className="settings-empty">
                      Signed in as {session.user.email}. Accounts are optional — they're the basis
                      for purchases and cross-device sync as those features arrive.
                    </p>
                    <button className="settings-reset-btn" onClick={() => void signOut()}>
                      Sign out
                    </button>
                  </>
```

with:

```tsx
                  <>
                    <p className="settings-empty">
                      Signed in as {session.user.email}.
                      {cosmeticsUnlocked ? ' Cosmetics unlocked ✓.' : ''}
                      {cloudActive ? ' Cloud active ✓.' : ''}
                    </p>
                    {billingEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                        {!cosmeticsUnlocked && (
                          <button className="settings-connect" onClick={() => void buy('cosmetics')}>
                            Unlock all cosmetics — $3.99
                          </button>
                        )}
                        {!cloudActive && (
                          <button className="settings-connect" onClick={() => void buy('cloud')}>
                            Get Cloud sync — $2/mo
                          </button>
                        )}
                      </div>
                    )}
                    <button className="settings-reset-btn" onClick={() => void signOut()}>
                      Sign out
                    </button>
                  </>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/Settings.tsx
git commit -m "feat(billing): purchase buttons + entitlement status in Settings"
```

---

## Task 8: Provisioning checklist + env docs

**Files:**
- Create: `docs/BILLING_SETUP.md`
- Create/Modify: `.env.example`

- [ ] **Step 1: Write `docs/BILLING_SETUP.md`**

```markdown
# Billing setup (Stripe + Supabase)

The entitlement code ships in the app; these are the one-time steps to make
purchases live. Until done, the app runs free/local and purchase buttons stay
hidden (`VITE_BILLING_ENABLED` unset).

## 1. Supabase
1. Apply the migration: `supabase db push` (creates `public.profiles` + RLS + signup trigger).
2. Deploy functions:
   - `supabase functions deploy create-checkout`
   - `supabase functions deploy stripe-webhook --no-verify-jwt`  (Stripe calls it unauthenticated; the signature is verified instead)
3. Set function secrets:
   - `supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_COSMETICS=price_... STRIPE_PRICE_CLOUD=price_... APP_URL=https://your-app-url`
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 2. Stripe
1. Create two Products + Prices:
   - "Cosmetics Unlock" — one-time, $3.99 → `STRIPE_PRICE_COSMETICS`.
   - "Cloud" — recurring $2/mo (optionally add a $20/yr price) → `STRIPE_PRICE_CLOUD`.
2. Add a webhook endpoint → `https://<project>.functions.supabase.co/stripe-webhook`, listening for:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

## 3. Client build
Set at build time so the app talks to Supabase and shows purchase buttons:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (already required for accounts)
- `VITE_BILLING_ENABLED=true`

## Known follow-up
- Desktop (Tauri) Checkout currently navigates the webview to Stripe. Before
  shipping billing on desktop, open Checkout in the system browser (add a Tauri
  opener plugin) and return via deep link or focus-refresh. The web build works as-is.
- After returning from Checkout, the app re-fetches entitlements when the auth
  session refreshes; a focus-based refresh can be added for immediacy.
```

- [ ] **Step 2: Document env vars in `.env.example`**

Create `.env.example` (or append if it exists):

```
# Supabase (required for accounts + cloud)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Show in-app purchase buttons (set to "true" only after billing is deployed)
VITE_BILLING_ENABLED=
```

- [ ] **Step 3: Commit**

```bash
git add docs/BILLING_SETUP.md .env.example
git commit -m "docs: billing provisioning checklist + env example"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all pass (prior 344 + Task 2 (3) + Task 3 (2) + Task 4 (3) = 352).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Note: the Deno Edge Functions under `supabase/functions/` are not part of the app's `tsconfig` and are not type-checked here — that's expected; they run on Deno.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds. The purchase buttons are tree-shaken-safe and hidden unless `VITE_BILLING_ENABLED=true`.

---

## Self-Review

**Spec coverage (against `2026-06-23-business-model-strategy-design.md` → "Billing & entitlement layer"):**
- `profiles` table + RLS, entitlement fields written only by the service-role webhook → Task 1 + Task 6. ✓
- Client reads entitlements at login → Task 2 + Task 3 (refresh on session change). ✓
- Stripe Checkout for both purchases; webhook flips flags; Cloud includes cosmetics unlock → Task 5 + Task 6. ✓
- Purchases available in-app, any time → Task 7. ✓
- Both products ($3.99 one-time, $2/mo subscription) → Task 5 price map + Task 8 Stripe setup. ✓
- Cloud-mode repository switch by `cloud_active` and cosmetic gating by `cosmetics_unlocked` are **intentionally deferred to P3/P2** — this phase only produces the flags. ✓ (no gap by design)

**Placeholder scan:** No TBD/TODO. Every code step has complete code; the only "fill in" items are user-supplied secrets, documented in Task 8. ✓

**Type consistency:** `Entitlements { cosmeticsUnlocked, cloudActive }` is defined in Task 2 and consumed identically in Task 3 (store) and Task 7 (UI). `CheckoutKind = 'cosmetics' | 'cloud'` defined in Task 4, used in Task 7 and matched by the `create-checkout` PRICE map keys in Task 5. Column names (`cosmetics_unlocked`, `cloud_active`, `stripe_customer_id`, `plan`) are consistent across the migration (Task 1), accessor (Task 2), and webhook (Task 6). ✓

**Known scope notes (surfaced, not hidden):** desktop Checkout redirect and focus-refresh are documented as follow-ups in Task 8; Edge Functions are authored but excluded from CI typecheck/tests (Deno runtime).
