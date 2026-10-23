// Supabase Edge Function (Deno). The ONLY writer of entitlement fields. Verifies
// the Stripe signature, then flips profiles flags using the service-role key
// (bypasses RLS). Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Service-role client -> bypasses RLS so it can write entitlement fields.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Upsert (not update) so a paid grant is never silently lost if the profile row
// is somehow missing — it gets created. Idempotent for the boolean flags here,
// so duplicate Stripe deliveries are harmless.
async function setEntitlements(userId: string, patch: Record<string, unknown>) {
  await admin
    .from('profiles')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
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
