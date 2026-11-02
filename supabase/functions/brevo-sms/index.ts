import { createClient } from 'npm:@supabase/supabase-js@2';
import { Webhook } from 'npm:standardwebhooks@1.0.0';

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

async function sendSms(recipient: string, content: string) {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const sender = Deno.env.get('BREVO_SMS_SENDER');
  if (!apiKey || !sender) throw new Error('Brevo SMS is not configured.');
  if (!/^[A-Za-z0-9]{1,11}$/.test(sender)) throw new Error('Brevo SMS sender must be 1-11 alphanumeric characters.');

  const response = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, recipient, content, type: 'transactional' }),
  });
  if (!response.ok) {
    console.error('Brevo rejected an SMS request.', { status: response.status });
    throw new Error(`Brevo SMS request failed with status ${response.status}.`);
  }
}

async function handleAuthHook(request: Request) {
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  if (!secret) return jsonResponse({ error: { message: 'SMS hook is not configured.' } }, 500);

  const payload = await request.text();
  let event: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    const webhook = new Webhook(secret.replace(/^v1,whsec_/, ''));
    event = webhook.verify(payload, Object.fromEntries(request.headers)) as typeof event;
  } catch (error) {
    console.error('Supabase SMS hook signature verification failed.', error);
    return jsonResponse({ error: { message: 'Invalid SMS hook signature.' } }, 401);
  }

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (typeof phone !== 'string' || !/^\+[1-9]\d{6,14}$/.test(phone) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    return jsonResponse({ error: { message: 'Invalid SMS hook payload.' } }, 400);
  }

  try {
    await sendSms(phone, `Your ShopSharp verification code is ${otp}. Do not share this code.`);
    return jsonResponse({});
  } catch (error) {
    console.error('Could not send a Supabase authentication code.', error);
    return jsonResponse({ error: { message: 'Could not send the authentication code.' } }, 502);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  if (request.headers.has('webhook-id')) return handleAuthHook(request);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'SMS function is not configured.' }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'A valid signed-in user is required.' }, 401);

  let input: { type?: unknown; messageId?: unknown; notificationId?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let eventType: 'new_message' | 'verification_update';
  let eventId: string;
  let recipientId: string;
  let messageBody: string;

  if (input.type === 'new_message' && typeof input.messageId === 'string') {
    const { data: message, error: messageError } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id')
      .eq('id', input.messageId)
      .maybeSingle();
    if (messageError) return jsonResponse({ error: 'Could not verify the message.' }, 500);
    if (!message || message.sender_id !== user.id) return jsonResponse({ error: 'Message not found or not owned by caller.' }, 404);

    const { data: conversation, error: conversationError } = await admin
      .from('conversations')
      .select('buyer_id, shop:shops(owner_id), listing:listings(title)')
      .eq('id', message.conversation_id)
      .maybeSingle();
    if (conversationError || !conversation) return jsonResponse({ error: 'Could not verify the conversation.' }, 500);

    const shop = Array.isArray(conversation.shop) ? conversation.shop[0] : conversation.shop;
    const listing = Array.isArray(conversation.listing) ? conversation.listing[0] : conversation.listing;
    const shopOwnerId = shop?.owner_id ?? null;
    recipientId = message.sender_id === conversation.buyer_id
      ? shopOwnerId
      : message.sender_id === shopOwnerId
        ? conversation.buyer_id
        : null;
    if (!recipientId || recipientId === user.id) return jsonResponse({ sent: false });

    eventType = 'new_message';
    eventId = input.messageId;
    const listingTitle = typeof listing?.title === 'string' ? listing.title.slice(0, 80) : null;
    messageBody = listingTitle
      ? `You have a new ShopSharp message about ${listingTitle}. Sign in to read it.`
      : 'You have a new ShopSharp message. Sign in to read it.';
  } else if (input.type === 'verification_update' && typeof input.notificationId === 'string') {
    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !callerProfile?.is_admin) return jsonResponse({ error: 'Admin access is required.' }, 403);

    const { data: notification, error: notificationError } = await admin
      .from('notifications')
      .select('id, user_id, type')
      .eq('id', input.notificationId)
      .maybeSingle();
    if (notificationError) return jsonResponse({ error: 'Could not verify the notification.' }, 500);
    if (!notification || !['verification_approved', 'verification_rejected'].includes(notification.type)) {
      return jsonResponse({ error: 'Verification notification not found.' }, 404);
    }

    eventType = 'verification_update';
    eventId = input.notificationId;
    recipientId = notification.user_id;
    messageBody = notification.type === 'verification_approved'
      ? 'Your ShopSharp shop has been verified. Sign in to see your badge.'
      : 'Your ShopSharp verification was declined. Sign in to view the details.';
  } else {
    return jsonResponse({ error: 'Unsupported SMS event.' }, 400);
  }

  const { data: profile, error: preferenceError } = await admin
    .from('profiles')
    .select('sms_notifications_enabled')
    .eq('id', recipientId)
    .maybeSingle();
  if (preferenceError) return jsonResponse({ error: 'Could not load SMS preferences.' }, 500);
  if (!profile?.sms_notifications_enabled) return jsonResponse({ sent: false });

  const { data: authResult, error: recipientError } = await admin.auth.admin.getUserById(recipientId);
  if (recipientError) return jsonResponse({ error: 'Could not verify the recipient phone.' }, 500);
  const recipient = authResult.user;
  if (!recipient?.phone || !recipient.phone_confirmed_at) return jsonResponse({ sent: false });

  const eventTable = eventType === 'new_message' ? 'messages' : 'notifications';
  const { data: claimedEvent, error: claimError } = await admin
    .from(eventTable)
    .update({ sms_sent_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('sms_sent_at', null)
    .select('id')
    .maybeSingle();
  if (claimError) return jsonResponse({ error: 'Could not record SMS delivery.' }, 500);
  if (!claimedEvent) return jsonResponse({ sent: false, duplicate: true });

  try {
    await sendSms(recipient.phone, messageBody);
  } catch (error) {
    const { error: releaseError } = await admin
      .from(eventTable)
      .update({ sms_sent_at: null })
      .eq('id', eventId);
    if (releaseError) console.error('Could not release a failed SMS delivery claim.', releaseError);
    console.error('Could not deliver a marketplace SMS.', error);
    return jsonResponse({ error: 'SMS delivery failed.' }, 502);
  }

  return jsonResponse({ sent: true });
});
