import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function hexToBytes(hex: string) {
  if (!/^[a-f\d]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function hasValidPaystackSignature(payload: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = new Uint8Array(digest);
  const received = hexToBytes(signature);
  return received !== null && constantTimeEqual(expected, received);
}

function getAllowedOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = new Set([
    'https://shopsharp.com.ng',
    'https://www.shopsharp.com.ng',
    'https://shopsharp.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  return origin && allowedOrigins.has(origin) ? origin : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
  if (!paystackSecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Paystack subscription configuration is incomplete.');
    return jsonResponse({ error: 'Secure Paystack checkout is not configured yet.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rawBody = await request.text();
  let input: { action?: unknown; planId?: unknown; reference?: unknown };
  try {
    input = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  const authorization = request.headers.get('Authorization');
  const webhookSignature = request.headers.get('x-paystack-signature');
  let webhookEvent: { event?: unknown; data?: { reference?: unknown } } | null = null;
  let userId: string;
  let authenticatedUserEmail: string | null = null;

  if (webhookSignature) {
    let signatureIsValid = false;
    try {
      signatureIsValid = await hasValidPaystackSignature(rawBody, webhookSignature, paystackSecret);
    } catch (error) {
      console.error('Could not validate Paystack webhook signature.', error);
    }
    if (!signatureIsValid) return jsonResponse({ error: 'Invalid Paystack signature.' }, 401);

    try {
      webhookEvent = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid Paystack event.' }, 400);
    }
    if (webhookEvent.event !== 'charge.success') return jsonResponse({ received: true });
    if (typeof webhookEvent.data?.reference !== 'string') {
      return jsonResponse({ error: 'Paystack event is missing its reference.' }, 400);
    }
    userId = '';
  } else {
    if (!authorization) return jsonResponse({ error: 'A signed-in user is required.' }, 401);
    const origin = getAllowedOrigin(request);
    if (!origin) return jsonResponse({ error: 'This website origin is not allowed.' }, 403);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'A valid signed-in user is required.' }, 401);
    userId = user.id;
    authenticatedUserEmail = user.email || null;

    if (input.action === 'initialize') {
      if (typeof input.planId !== 'string') return jsonResponse({ error: 'A subscription plan is required.' }, 400);

      const { data: shop, error: shopError } = await admin
        .from('shops')
        .select('id, owner_id')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (shopError) {
        console.error('Could not load the shop for Paystack checkout.', shopError);
        return jsonResponse({ error: 'Could not load your shop.' }, 500);
      }
      if (!shop) return jsonResponse({ error: 'Create your shop before choosing a paid plan.' }, 400);

      const { data: plan, error: planError } = await admin
        .from('plans')
        .select('id, name, display_name, price_naira')
        .eq('id', input.planId)
        .maybeSingle();
      if (planError) {
        console.error('Could not load the requested Paystack plan.', planError);
        return jsonResponse({ error: 'Could not load the selected plan.' }, 500);
      }
      if (!plan || plan.price_naira <= 0) return jsonResponse({ error: 'Choose a valid paid plan.' }, 400);
      if (!user.email) return jsonResponse({ error: 'Your account needs an email address for Paystack checkout.' }, 400);

      const amount = Number(plan.price_naira) * 100;
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return jsonResponse({ error: 'The selected plan has an invalid price.' }, 400);
      }

      const reference = `SS-${crypto.randomUUID()}`;
      const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount,
          currency: 'NGN',
          reference,
          callback_url: `${origin}/dashboard/subscription?paystack=1`,
          metadata: {
            user_id: user.id,
            shop_id: shop.id,
            plan_id: plan.id,
            plan_name: plan.name,
          },
        }),
      });
      const paystackResult = await paystackResponse.json().catch(() => null);
      if (
        !paystackResponse.ok
        || paystackResult?.status !== true
        || !paystackResult.data?.authorization_url
        || paystackResult.data?.reference !== reference
      ) {
        console.error('Paystack did not initialize the subscription payment.', { status: paystackResponse.status });
        return jsonResponse({ error: 'Paystack could not start checkout. Please try again.' }, 502);
      }

      return jsonResponse({
        authorizationUrl: paystackResult.data.authorization_url,
        reference: paystackResult.data.reference,
      });
    }

    if (input.action !== 'verify') return jsonResponse({ error: 'Unknown payment action.' }, 400);
    if (typeof input.reference !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(input.reference)) {
      return jsonResponse({ error: 'A valid Paystack reference is required.' }, 400);
    }
  }

  const reference = webhookEvent
    ? webhookEvent.data?.reference
    : input.reference;
  if (typeof reference !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(reference)) {
    return jsonResponse({ error: 'A valid Paystack reference is required.' }, 400);
  }

  const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret}`, Accept: 'application/json' },
  });
  const verification = await verifyResponse.json().catch(() => null);
  if (!verifyResponse.ok || verification?.status !== true || verification.data?.status !== 'success') {
    return jsonResponse({ error: 'Paystack has not confirmed a successful payment.' }, 402);
  }

  const transaction = verification.data;
  const metadata = transaction.metadata;
  const metadataUserId = typeof metadata?.user_id === 'string' ? metadata.user_id : null;
  const metadataShopId = typeof metadata?.shop_id === 'string' ? metadata.shop_id : null;
  const metadataPlanId = typeof metadata?.plan_id === 'string' ? metadata.plan_id : null;
  if (!metadataUserId || !metadataShopId || !metadataPlanId) {
    console.error('Verified Paystack payment is missing subscription metadata.');
    return jsonResponse({ error: 'Payment details could not be matched to a subscription.' }, 400);
  }
  if (userId && metadataUserId !== userId) {
    return jsonResponse({ error: 'This payment belongs to another account.' }, 403);
  }

  const [{ data: shop, error: shopError }, { data: plan, error: planError }, ownerResult] = await Promise.all([
    admin.from('shops').select('id, owner_id').eq('id', metadataShopId).maybeSingle(),
    admin.from('plans').select('id, display_name, price_naira').eq('id', metadataPlanId).maybeSingle(),
    userId
      ? Promise.resolve({ data: null, error: null })
      : admin.auth.admin.getUserById(metadataUserId),
  ]);
  const ownerEmail = authenticatedUserEmail || ownerResult.data?.user?.email || null;
  if (shopError || planError) {
    console.error('Could not validate the subscription associated with a Paystack payment.', { shopError, planError });
    return jsonResponse({ error: 'Could not validate the selected subscription.' }, 500);
  }
  if (ownerResult.error) {
    console.error('Could not verify the owner of a Paystack subscription.', ownerResult.error);
    return jsonResponse({ error: 'Could not verify the account associated with this payment.' }, 500);
  }
  if (!shop || shop.owner_id !== metadataUserId || !plan || plan.price_naira <= 0) {
    return jsonResponse({ error: 'The paid plan no longer matches this shop.' }, 400);
  }
  if (
    transaction.reference !== reference
    || transaction.currency !== 'NGN'
    || Number(transaction.amount) !== Number(plan.price_naira) * 100
    || !ownerEmail
    || String(transaction.customer?.email || '').toLowerCase() !== ownerEmail.toLowerCase()
  ) {
    return jsonResponse({ error: 'The verified payment does not match the plan price.' }, 400);
  }

  const { error: activationError } = await admin.rpc('activate_paid_subscription', {
    p_shop_id: shop.id,
    p_plan_id: plan.id,
    p_paystack_ref: reference,
  });
  if (activationError) {
    console.error('Could not activate a verified paid subscription.', activationError);
    return jsonResponse({ error: 'Payment was verified, but plan activation failed. Contact ShopSharp support with your payment reference.' }, 500);
  }

  return jsonResponse({ success: true, planName: plan.display_name });
});
