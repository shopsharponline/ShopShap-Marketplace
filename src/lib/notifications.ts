import { useCallback, useEffect, useState } from 'react';
import { supabase, type Notification } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnread(0);
      setUnreadMessages(0);
      setError(null);
      return;
    }
    const [itemsResult, unreadResult, messagesResult] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false).eq('type', 'new_message'),
    ]);
    const queryError = itemsResult.error || unreadResult.error || messagesResult.error;
    if (queryError) {
      console.error('Could not load notifications.', queryError);
      setError('Notifications could not be loaded. Please try again.');
      return;
    }
    const rows = (itemsResult.data || []) as Notification[];
    setItems(rows);
    setUnread(unreadResult.count || 0);
    setUnreadMessages(messagesResult.count || 0);
    setError(null);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const notification = payload.new as Partial<Notification>;
          void load();
          if (!notification.id || notification.type === 'new_message') return;
          void (async () => {
            try {
              const { error: pushError } = await supabase.functions.invoke('notification-push', {
                body: { notificationId: notification.id },
              });
              if (pushError) console.error('In-app notification arrived, but phone push could not be requested.', pushError);
            } catch (pushError) {
              console.error('In-app notification arrived, but phone push could not be requested.', pushError);
            }
          })();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { void load(); }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load, user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const { error: updateError } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (updateError) {
      console.error('Could not mark notifications as read.', updateError);
      setError('Could not update notification status. Please try again.');
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    setUnreadMessages(0);
    setError(null);
  }, [user]);

  return { items, unread, unreadMessages, error, markAllRead, reload: load };
}
