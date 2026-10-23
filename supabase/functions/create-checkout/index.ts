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

// Require an explicit APP_URL so we never fall back to a wildcard CORS origin.
// (The endpoint also verifies the caller's JWT, but there's no reason to invite
// cross-origin calls from anywhere.)
const APP_URL = Deno.env.get('APP_URL');

const cors = {
  ...(APP_URL ? { 'Access-Control-Allow-Origin': APP_URL, Vary: 'Origin' } : {}),
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

    const successUrl = `${APP_URL ?? ''}/?checkout=success`;
    const cancelUrl = `${APP_URL ?? ''}/?checkout=cancel`;

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
