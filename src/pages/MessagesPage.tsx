import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Send, MessageSquare, Store, Image as ImageIcon } from 'lucide-react';
import { supabase, type Message } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatPrice, formatTimeAgo } from '@/lib/format';
import { buildListingSlug, navigate } from '@/lib/router';
import { sanitizePlainText } from '@/lib/input';

type ConvRow = {
  id: string;
  buyer_id: string;
  shop_id: string | null;
  listing_id: string | null;
  last_message_at: string;
  buyer_last_read_at: string;
  shop_last_read_at: string;
  hasUnread?: boolean;
  shop: { id: string; name: string; slug: string; is_verified: boolean; created_at: string } | null;
  listing: { id: string; title: string; price: number; image_url: string | null } | null;
  buyer: { full_name: string } | null;
  last_message: string | null;
};

type ConvDetail = ConvRow & { messages: Message[]; shopOwner: string | null };

export default function MessagesPage({ conversationId }: { conversationId?: string }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [active, setActive] = useState<ConvDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, buyer_id, shop_id, listing_id, last_message_at, buyer_last_read_at, shop_last_read_at,
        shop:shops(id, name, slug, is_verified),
        listing:listings(id, title, price, image_url)
      `)
      .order('last_message_at', { ascending: false });

    const rows = (data || []) as unknown as ConvRow[];
    // Only show conversations where the user is buyer or shop owner
    const { data: myShops } = await supabase.from('shops').select('id').eq('owner_id', user.id);
    const myShopIds = new Set((myShops || []).map((shop) => shop.id));
    const mine = rows.filter((c) => c.buyer_id === user.id || (c.shop_id && myShopIds.has(c.shop_id)));

    // Get last message for each conversation
    const withLast = await Promise.all(mine.map(async (c) => {
      const { data: msg } = await supabase
        .from('messages')
        .select('body, sender_id, created_at')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1);
      // Resolve buyer name for shop-owner view
      let buyerName: string | null = null;
      if (c.buyer_id !== user.id) {
        const { data: bp } = await supabase.from('profiles').select('full_name').eq('id', c.buyer_id).maybeSingle();
        buyerName = bp?.full_name || 'Buyer';
      }
      const lastMessage = msg?.[0];
      const lastReadAt = c.buyer_id === user.id ? c.buyer_last_read_at : c.shop_last_read_at;
      const hasUnread = Boolean(
        lastMessage
        && lastMessage.sender_id !== user.id
        && Date.parse(lastMessage.created_at) > Date.parse(lastReadAt),
      );
      return {
        ...c,
        last_message: lastMessage?.body || null,
        hasUnread,
        buyer: { full_name: buyerName || 'You' },
      };
    }));
    setConversations(withLast);
    setLoading(false);
  }, [user]);

  const loadConversation = useCallback(async (convId: string) => {
    if (!user) return;
    const { data, error: conversationError } = await supabase
      .from('conversations')
      .select(`
        id, buyer_id, shop_id, listing_id, last_message_at, buyer_last_read_at, shop_last_read_at,
        shop:shops(id, name, slug, is_verified),
        listing:listings(id, title, price, image_url)
      `)
      .eq('id', convId)
      .maybeSingle();
    if (conversationError) {
      setMessageError(`Could not load this conversation: ${conversationError.message}`);
      return;
    }
    if (!data) {
      setMessageError('This conversation is unavailable for your account.');
      return;
    }
    const row = data as unknown as ConvRow;
    const { data: msgs, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (messagesError) {
      setMessageError(`Could not load messages: ${messagesError.message}`);
      return;
    }
    const messages = (msgs || []).reverse() as Message[];
    const latestLoadedMessage = messages[messages.length - 1];
    const { error: readError } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: convId,
      p_read_through: latestLoadedMessage?.created_at ?? null,
    });
    if (!readError) {
      setConversations((current) => current.map((conversation) => (
        conversation.id === convId ? { ...conversation, hasUnread: false } : conversation
      )));
    }
    const { error: notificationReadError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('type', 'new_message')
      .eq('link', `/messages/${convId}`)
      .eq('read', false);
    setMessageError(readError
      ? 'Messages loaded, but unread status could not be updated. Please reopen the chat.'
      : notificationReadError
        ? 'Messages loaded, but the notification badge could not be cleared.'
        : null);
    setActive({ ...row, messages, shopOwner: null });
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadConversations();
  }, [user, loadConversations]);

  useEffect(() => {
    if (conversationId && user) {
      loadConversation(conversationId);
    } else {
      setActive(null);
    }
  }, [conversationId, user, loadConversation]);

  // Realtime subscription for new messages in active conversation
  const activeConversationId = active?.id;
  useEffect(() => {
    if (!activeConversationId) return;
    const channel = supabase
      .channel(`conv-${activeConversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setActive((prev) => prev && !prev.messages.some((message) => message.id === newMsg.id)
            ? { ...prev, messages: [...prev.messages, newMsg] }
            : prev);
          if (newMsg.sender_id !== user?.id) {
            void supabase.rpc('mark_conversation_read', {
              p_conversation_id: activeConversationId,
              p_read_through: newMsg.created_at,
            }).then(({ error }) => {
              if (error) setMessageError('A new message arrived, but its read status could not be updated.');
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = sanitizePlainText(newMessage, 2000);
    if (!body || !active || !user || sending) return;
    setSending(true);
    setMessageError(null);
    const { data: savedMessage, error } = await supabase.from('messages').insert({
      conversation_id: active.id,
      sender_id: user.id,
      body,
    }).select('*').single();
    if (error) {
      setMessageError(`Message was not sent: ${error.message}`);
      setSending(false);
      return;
    }

    setNewMessage('');
    setActive((prev) => prev && !prev.messages.some((message) => message.id === savedMessage.id)
      ? { ...prev, messages: [...prev.messages, savedMessage as Message] }
      : prev);
    void supabase.functions.invoke('brevo-sms', {
      body: { type: 'new_message', messageId: savedMessage.id },
    }).then(({ error: smsError }) => {
      if (smsError) console.error('Message was sent, but SMS delivery could not be requested.', smsError);
    }).catch((error: unknown) => {
      console.error('Message was sent, but SMS delivery could not be requested.', error);
    });
    void supabase.functions.invoke('message-push', {
      body: { messageId: savedMessage.id },
    }).then(({ error: pushError }) => {
      if (pushError) console.error('Message was sent, but phone notification could not be requested.', pushError);
    }).catch((error: unknown) => {
      console.error('Message was sent, but phone notification could not be requested.', error);
    });
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', active.id);
    if (updateError) setMessageError(`Message sent, but conversation time could not be updated: ${updateError.message}`);
    await loadConversations();
    setSending(false);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <MessageSquare className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Your messages</h1>
        <p className="text-ink-500 mb-6">Sign in to chat with shops about products you're interested in.</p>
        <button onClick={() => navigate({ name: 'signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Sign in</button>
      </div>
    );
  }

  const isShopOwnerView = active && active.buyer_id !== user.id;
  const otherPartyName = active
    ? isShopOwnerView
      ? active.buyer?.full_name || 'Buyer'
      : active.shop?.name || 'Shop'
    : '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <button onClick={() => window.history.back()} className="lg:hidden flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-extrabold text-ink-900 mb-6">Messages</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation list */}
        <div className={`lg:col-span-1 ${active ? 'hidden lg:block' : ''}`}>
          <div className="bg-white rounded-2xl border border-ink-100 overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-ink-50 rounded-xl animate-pulse" />)}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-ink-200" />
                <p className="text-sm text-ink-500 font-medium">No conversations yet.</p>
                <p className="text-xs text-ink-400 mt-1">Tap "Chat Seller" on any product to start one.</p>
                <button onClick={() => navigate({ name: 'browse' })} className="mt-4 text-brand-600 font-semibold text-sm hover:text-brand-700">
                  Browse products
                </button>
              </div>
            ) : (
              <div className="divide-y divide-ink-50">
                {conversations.map((c) => {
                  const isActive = active?.id === c.id;
                  const otherName = c.buyer_id === user.id ? (c.shop?.name || 'Shop') : (c.buyer?.full_name || 'Buyer');
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate({ name: 'messages-chat', id: c.id })}
                      className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${isActive ? 'bg-brand-50' : 'hover:bg-ink-50'}`}
                    >
                      <div className="relative w-11 h-11 shrink-0">
                        {c.listing?.image_url ? (
                          <img
                            src={c.listing.image_url}
                            alt={c.listing.title || 'Product'}
                            className="w-11 h-11 rounded-xl object-cover border-2 border-white shadow-sm"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold">
                            {otherName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {c.hasUnread && (
                          <div className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full bg-brand-500 border-2 border-white"></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink-900 truncate flex items-center gap-1.5">
                          {otherName}
                          {c.shop?.is_verified && <span className="text-brand-500 text-[10px]">✓</span>}
                        </p>
                        <p className="text-xs text-ink-500 truncate mt-0.5 leading-tight">
                          {c.last_message || (c.listing ? `About: ${c.listing.title}` : 'New conversation')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-ink-400 block">{formatTimeAgo(c.last_message_at)}</span>
                        {c.hasUnread && (
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 text-[10px] font-bold">
                            New
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat window */}
        <div className={`lg:col-span-2 ${!active ? 'hidden lg:block' : ''}`}>
          {!active ? (
            <div className="bg-white rounded-2xl border border-ink-100 h-[500px] flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-ink-200" />
                <p className="text-ink-500 text-sm">Select a conversation to start chatting.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-ink-100 flex flex-col h-[600px] overflow-hidden">
              {/* Chat header */}
              <div className="flex items-center gap-3 p-4 border-b border-ink-100 bg-white">
                <button onClick={() => navigate({ name: 'messages' })} className="lg:hidden p-1 text-ink-500">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold shrink-0">
                  {otherPartyName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink-900 text-sm truncate">{otherPartyName}</p>
                  {active.listing && (
                    <button
                      onClick={() => navigate({ name: 'listing', id: active.listing!.id, slug: buildListingSlug(active.listing!.title) })}
                      className="text-xs text-brand-600 hover:text-brand-700 truncate flex items-center gap-1 max-w-full"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span className="truncate">{active.listing.title} · {formatPrice(Number(active.listing.price))}</span>
                    </button>
                  )}
                  {isShopOwnerView && active.shop && (
                    <button onClick={() => navigate({ name: 'shop', slug: active.shop!.slug })} className="text-xs text-brand-600 flex items-center gap-1">
                      <Store className="w-3 h-3" /> Your shop
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-ink-50/50">
                {messageError && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {messageError}
                  </p>
                )}
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  For safety, ShopSharp automatically checks new messages for common scam signals. Messages are not blocked, but flagged messages may be reviewed by an admin. Automated checks can make mistakes.
                </p>
                {active.messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          mine
                            ? 'bg-brand-500 text-white rounded-br-md'
                            : 'bg-white border border-ink-100 text-ink-800 rounded-bl-md'
                        }`}
                      >
                        <p className="whitespace-pre-line break-words">{m.body}</p>
                        <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-ink-400'}`}>
                          {formatTimeAgo(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="p-3 border-t border-ink-100 bg-white flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  maxLength={2000}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Message ${otherPartyName}...`}
                  className="flex-1 h-11 px-4 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="w-11 h-11 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
