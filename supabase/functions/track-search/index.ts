import { createClient } from 'npm:@supabase/supabase-js@2';

type SearchRequest = {
  term?: unknown;
  categorySlug?: unknown;
  visitorId?: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hashClientIp(ip: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  let input: SearchRequest;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
  if (!input || typeof input !== 'object'
    || typeof input.term !== 'string'
    || typeof input.visitorId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.visitorId)
    || (input.categorySlug !== undefined && typeof input.categorySlug !== 'string')) {
    return jsonResponse({ error: 'Search data is invalid.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Search tracking is not configured.' }, 500);
  }

  const rawIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip');
  if (!rawIp) return jsonResponse({ tracked: false });

  const ipHash = await hashClientIp(rawIp, serviceRoleKey);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: notificationIds, error: trackingError } = await admin.rpc('track_marketplace_search', {
    p_term: input.term.slice(0, 200),
    p_category_slug: typeof input.categorySlug === 'string' ? input.categorySlug.slice(0, 80) : '',
    p_visitor_id: input.visitorId,
    p_ip_hash: ipHash,
  });
  if (trackingError) {
    if (trackingError.message.includes('rate limit exceeded')) return jsonResponse({ tracked: false }, 429);
    console.error('Could not record marketplace search trend data.', trackingError);
    return jsonResponse({ error: 'Could not record this search.' }, 500);
  }

  const ids = Array.isArray(notificationIds) ? notificationIds.filter((id): id is string => typeof id === 'string') : [];
  for (const notificationId of ids) {
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/notification-push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationId }),
      });
      if (!pushResponse.ok) {
        console.error('Search trend notification was saved, but phone push failed.', {
          status: pushResponse.status,
          response: await pushResponse.text(),
        });
      }
    } catch (error) {
      console.error('Search trend notification was saved, but phone push could not be requested.', error);
    }
  }

  return jsonResponse({ tracked: true, alertsCreated: ids.length });
});
