import { createClient } from 'npm:@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

type MessageRequest = { messageId?: unknown };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Message push is not configured.' }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'A valid signed-in user is required.' }, 401);

  let input: MessageRequest;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
  if (typeof input.messageId !== 'string') return jsonResponse({ error: 'A message ID is required.' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: message, error: messageError } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', input.messageId)
    .maybeSingle();
  if (messageError) {
    console.error('Could not look up a message for push delivery.', messageError);
    return jsonResponse({ error: 'Could not verify the message.' }, 500);
  }
  if (!message || message.sender_id !== user.id) {
    return jsonResponse({ error: 'Message not found or not owned by caller.' }, 404);
  }

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('buyer_id, shop:shops(owner_id)')
    .eq('id', message.conversation_id)
    .maybeSingle();
  if (conversationError || !conversation) {
    console.error('Could not look up a message conversation.', conversationError);
    return jsonResponse({ error: 'Could not verify the conversation.' }, 500);
  }

  const shop = Array.isArray(conversation.shop) ? conversation.shop[0] : conversation.shop;
  const shopOwnerId = shop?.owner_id ?? null;
  const recipientId = message.sender_id === conversation.buyer_id
    ? shopOwnerId
    : message.sender_id === shopOwnerId
      ? conversation.buyer_id
      : null;
  if (!recipientId || recipientId === user.id) return jsonResponse({ sent: 0 });

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', recipientId);
  if (subscriptionsError) {
    console.error('Could not load message push subscriptions.', subscriptionsError);
    return jsonResponse({ error: 'Could not load phone subscriptions.' }, 500);
  }
  if (!subscriptions?.length) return jsonResponse({ sent: 0 });

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('VAPID credentials are missing from the message push function.');
    return jsonResponse({ error: 'Phone notifications are not configured.' }, 500);
  }

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: 'New ShopSharp message',
    body: 'You received a new message. Open ShopSharp to read it.',
    url: `/messages/${message.conversation_id}`,
  });

  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60, urgency: 'high' });
      return true;
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await admin
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);
        if (deleteError) console.error('Could not remove an expired push subscription.', deleteError);
      } else {
        console.error('Push delivery failed.', { statusCode });
      }
      return false;
    }
  }));

  return jsonResponse({ sent: results.filter(Boolean).length });
});
