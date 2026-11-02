import { supabase } from '@/lib/supabase';

function decodeApplicationServerKey(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function enablePushNotifications(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('This browser does not support phone notifications. Install ShopSharp on your phone or use a supported browser.');
  }

  if (!window.isSecureContext) {
    throw new Error('Phone notifications require a secure connection. Open ShopSharp on HTTPS or localhost.');
  }

  const applicationServerKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;
  if (!applicationServerKey) {
    throw new Error('Phone notifications are not set up yet. Please contact ShopSharp support.');
  }

  const permission = Notification.permission === 'denied'
    ? 'denied'
    : Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked for this site. Open the browser’s site settings, set Notifications to Allow, then reload ShopSharp and try again.'
      : 'Allow notifications in the browser prompt to receive ShopSharp alerts.');
  }

  let subscription: PushSubscription;
  try {
    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(applicationServerKey),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      throw new Error('The browser or device denied push registration. Allow notifications for this site in browser and device settings, then reload and try again.');
    }
    throw error;
  }
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) {
    await subscription.unsubscribe();
    throw new Error('The browser did not provide the keys needed for phone notifications.');
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) {
    await subscription.unsubscribe();
    throw new Error(`Could not save this phone for alerts: ${error.message}`);
  }
}

export const enableMessagePush = enablePushNotifications;

export async function disableMessagePush() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const unsubscribed = await subscription.unsubscribe();
  if (!unsubscribed) throw new Error('The browser could not unsubscribe this phone.');

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint);
  if (error) throw new Error(`Could not turn off phone alerts: ${error.message}`);
}
