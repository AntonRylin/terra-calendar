# Billing setup (Stripe + Supabase)

The entitlement code ships in the app; these are the one-time steps to make
purchases live. Until done, the app runs free/local and purchase buttons stay
hidden (`VITE_BILLING_ENABLED` unset).

## 1. Supabase
1. Apply the migrations: `supabase db push` — `0004` (profiles + RLS + signup
   trigger), `0005` (`show_in_upcoming`), `0006` (event columns for
   spans/type/overrides/tasks), `0007` (`user_settings`), `0008`
   (`user_special_days` + the `day-backgrounds` Storage bucket), and `0009`
   (cloud writes gated on `cloud_active` + bucket size/MIME limits). Or just
   paste `supabase/full_setup.sql`. Cloud event sync needs `0006`; cloud
   settings sync needs `0007`; cloud day backgrounds need `0008`; **apply
   `0009` before going live** — without it any signed-in free user can write
   to the paid cloud storage with a patched client. Also enable email
   confirmation (Authentication → Providers → Email) so bots can't mass-create
   accounts against your quotas.
2. Deploy functions:
   - `supabase functions deploy create-checkout`
   - `supabase functions deploy stripe-webhook --no-verify-jwt`  (Stripe calls it unauthenticated; the signature is verified instead)
3. Set function secrets:
   - `supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... STRIPE_PRICE_COSMETICS=price_... STRIPE_PRICE_CLOUD=price_... APP_URL=https://your-app-url`
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 2. Stripe
1. Create two Products + Prices:
   - "Cosmetics Unlock" — one-time, $3.99 -> `STRIPE_PRICE_COSMETICS`.
   - "Cloud" — recurring $2/mo (optionally add a $20/yr price) -> `STRIPE_PRICE_CLOUD`.
2. Add a webhook endpoint -> `https://<project>.functions.supabase.co/stripe-webhook`, listening for:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

## 3. Client build
Set at build time so the app talks to Supabase and shows purchase buttons:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (already required for accounts)
- `VITE_BILLING_ENABLED=true`

`VITE_BILLING_ENABLED` has a dual role: it shows the in-app purchase buttons AND
activates cosmetic gating (glow / animated / AI styles lock behind the $3.99
unlock). Leave it unset and the app stays fully free with every cosmetic available.

Cloud sync activates at runtime for signed-in users whose subscription is active
(`cloud_active`) — there is no `VITE_BACKEND` flag. iCloud/Google connections pause
while Cloud mode is on.

## Known follow-up
- ~~Desktop Checkout navigates the webview to Stripe~~ — done: the desktop
  build opens Checkout in the system browser (`open_external` command) and the
  app re-fetches entitlements when the window regains focus.
- Add a Stripe **Customer Portal** link in Settings so subscribers can cancel /
  manage their plan themselves (do this before charging real customers).
