import { createClient } from 'npm:@supabase/supabase-js@2';

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

async function hmacKey(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  const brevoListId = Number(Deno.env.get('BREVO_LIST_ID'));
  const rateLimitSecret = Deno.env.get('NEWSLETTER_RATE_LIMIT_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !brevoApiKey || !Number.isSafeInteger(brevoListId) || brevoListId <= 0 || !rateLimitSecret) {
    console.error('Newsletter function is missing required configuration.');
    return jsonResponse({ error: 'Newsletter signups are temporarily unavailable.' }, 503);
  }

  let input: { email?: unknown; consent?: unknown; website?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  if (typeof input.website === 'string' && input.website.trim()) {
    return jsonResponse({ subscribed: true });
  }
  if (input.consent !== true || typeof input.email !== 'string') {
    return jsonResponse({ error: 'Please provide an email address and consent.' }, 400);
  }

  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Please enter a valid email address.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('cf-connecting-ip')
    || 'unknown';
  const [ipKey, emailKey] = await Promise.all([
    hmacKey(rateLimitSecret, `ip:${forwardedFor}`),
    hmacKey(rateLimitSecret, `email:${email}`),
  ]);
  const { data: allowed, error: rateLimitError } = await supabase.rpc('consume_newsletter_rate_limit', {
    p_ip_key: ipKey,
    p_email_key: emailKey,
  });
  if (rateLimitError) {
    console.error('Newsletter rate limit check failed.', rateLimitError);
    return jsonResponse({ error: 'Newsletter signups are temporarily unavailable.' }, 503);
  }
  if (!allowed) return jsonResponse({ error: 'Too many signup attempts. Please try again later.' }, 429);

  let brevoResponse: Response;
  try {
    brevoResponse = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        listIds: [brevoListId],
        emailBlacklisted: false,
        updateEnabled: true,
      }),
    });
  } catch (error) {
    console.error('Could not reach Brevo to save a newsletter contact.', error);
    return jsonResponse({ error: 'Could not add you to the newsletter. Please try again later.' }, 502);
  }
  if (!brevoResponse.ok) {
    console.error('Brevo rejected a newsletter contact.', { status: brevoResponse.status });
    return jsonResponse({ error: 'Could not add you to the newsletter. Please try again later.' }, 502);
  }

  const { error: saveError } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email, consent_at: new Date().toISOString() }, { onConflict: 'email' });
  if (saveError) {
    console.error('Brevo accepted a subscriber, but the local record could not be saved.', saveError);
    return jsonResponse({ error: 'Your subscription could not be recorded. Please contact support.' }, 500);
  }

  return jsonResponse({ subscribed: true });
});
