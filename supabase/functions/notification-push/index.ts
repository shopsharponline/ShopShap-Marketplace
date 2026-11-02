import { createClient } from 'npm:@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

type PushRequest = { notificationId?: unknown };

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Phone notification delivery is not configured.' }, 500);
  }
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('VAPID credentials are missing from the notification push function.');
    return jsonResponse({ error: 'Phone notifications are not configured.' }, 500);
  }

  const serviceRequest = authorization === `Bearer ${serviceRoleKey}`;
  let requestingUserId: string | null = null;
  if (!serviceRequest) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'A valid signed-in user is required.' }, 401);
    requestingUserId = user.id;
  }

  let input: PushRequest;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
  if (!input || typeof input !== 'object' || typeof input.notificationId !== 'string') {
    return jsonResponse({ error: 'A notification ID is required.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select('id, user_id, type, title, body, link')
    .eq('id', input.notificationId)
    .maybeSingle();
  if (notificationError) {
    console.error('Could not look up a notification for push delivery.', notificationError);
    return jsonResponse({ error: 'Could not verify the notification.' }, 500);
  }
  if (!notification || (!serviceRequest && notification.user_id !== requestingUserId)) {
    return jsonResponse({ error: 'Notification not found or not owned by caller.' }, 404);
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', notification.user_id);
  if (subscriptionsError) {
    console.error('Could not load phone notification subscriptions.', subscriptionsError);
    return jsonResponse({ error: 'Could not load phone subscriptions.' }, 500);
  }
  if (!subscriptions?.length) return jsonResponse({ sent: 0 });

  const { data: delivery, error: deliveryError } = await admin
    .from('notification_push_deliveries')
    .upsert({ notification_id: notification.id }, { onConflict: 'notification_id', ignoreDuplicates: true })
    .select('notification_id')
    .maybeSingle();
  if (deliveryError) {
    console.error('Could not claim notification push delivery.', deliveryError);
    return jsonResponse({ error: 'Could not prepare phone notification delivery.' }, 500);
  }
  if (!delivery) return jsonResponse({ sent: 0, duplicate: true });

  const safePath = typeof notification.link === 'string'
    && notification.link.startsWith('/')
    && !notification.link.startsWith('//')
    && !notification.link.includes('\\')
    ? notification.link
    : '/';
  const payload = JSON.stringify({
    title: notification.title.slice(0, 100),
    body: notification.body.slice(0, 220),
    url: safePath,
  });

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 300, urgency: 'normal' });
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
        console.error('Phone notification delivery failed.', { statusCode });
      }
      return false;
    }
  }));

  return jsonResponse({ sent: results.filter(Boolean).length });
});
