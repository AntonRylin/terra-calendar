# Cloud edition (Supabase) setup

The free edition needs none of this. These steps stand up the **paid, hosted,
cross-device-sync edition**, which keeps each user's events in Postgres on
Supabase behind per-user Row-Level Security.

## 1. Create a Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. Pick a region close to your users; save the database password.

## 2. Create the schema

Apply the full schema — the `events` table (with every synced column), the
`profiles` entitlements table, and per-user Row-Level Security — in one of two ways:

- **SQL editor (simplest):** open the project → **SQL Editor** → paste the contents
  of [`full_setup.sql`](./full_setup.sql) → **Run**. It's idempotent and covers
  everything (the consolidated equivalent of all `migrations/*.sql`).
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`
  (applies every file in `migrations/` in order).

Either way every row is scoped to its owner (`auth.uid() = user_id`); `profiles`
entitlement fields are writable only by the service-role Stripe webhook.

Calendar **sharing** (migration `0014`) rides on the entitlement helper from
`0009`, so a project created from an older `full_setup.sql` must be brought up to
date before `0014` will apply — see [`docs/SHARING_SETUP.md`](../docs/SHARING_SETUP.md).

P3c also creates a private **`day-backgrounds`** Storage bucket; each user can
read/write only objects under their own `{auth.uid()}/…` folder (storage RLS).
`full_setup.sql` and migration `0008` both create it. Objects are named
`{auth.uid()}/{mediaId}.{webp|gif|webm|mp4}`: WebP stills plus the short muted
clips that video and animated-GIF backgrounds are re-encoded into. Migration
`0013` widens the bucket's MIME allow-list to those four types — without it,
clip uploads are rejected and video backgrounds stay local-only.

## 3. Configure auth

In **Authentication → Providers**, Email is on by default (email + password —
what the in-app account sign-in uses). For local development you'll usually want to turn
**off** "Confirm email" (Authentication → Sign In / Providers) so accounts work
without SMTP; turn it back on for production, or wire up an SMTP provider.

## 4. Point the app at the project

Copy the root [`.env.example`](../.env.example) to `.env.local` and fill in:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co     # Settings → API Keys
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx       # Settings → API Keys
```

Use the **publishable** key (Settings → API Keys → "Publishable and secret API
keys", starts with `sb_publishable_`). On older projects the legacy **anon** key
works too — prefer the new keys for new projects, since they can be rotated
independently. Either is meant to be public and shipped to the browser; security
comes from RLS, not from hiding it. Never put the **secret** / **service_role**
key in the client or in any `VITE_` variable — those bypass RLS.

## 5. Run it

```bash
npm run dev
```

The app opens to the calendar. Sign in (Settings → Account) and, with an active
Cloud subscription, your events live in Supabase and sync to any device you sign
in from.

## How it fits the codebase

- `src/data/supabaseClient.ts` — the configured client (singleton).
- `src/data/supabaseRepository.ts` — `EventRepository` backed by the `events`
  table; same `load`/`saveAll` contract as the local adapters.
- `src/data/createRepository.ts` — assembles the active sync stores (local always;
  iCloud/Google when connected; Supabase in cloud mode) behind
  `src/data/sync/UnifiedRepository`, which reconciles them into one calendar.
- `src/auth/` — session store + optional sign-in, active when Supabase is configured.

## Next steps (not included yet)

- **Billing:** add Stripe Checkout + a webhook that flips a `subscribed` flag,
  and gate `CloudApp` on it. The webhook secret stays server-side; only the
  publishable key would be public.
- **Real-time multi-device merge:** `saveAll` currently mirrors the whole list.
  A per-event upsert/delete API (plus Supabase Realtime subscriptions) would
  give live updates and avoid last-writer-wins on concurrent edits.
