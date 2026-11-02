import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, BadgeCheck, XCircle, Clock, Store, Star, AlertTriangle, CheckCircle2,
  LayoutDashboard, Users, Bell, ChevronRight, RefreshCw, Smartphone, ShoppingBag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatTimeAgo } from '@/lib/format';
import { navigate } from '@/lib/router';
import { sanitizePlainText } from '@/lib/input';
import { enablePushNotifications } from '@/lib/push-notifications';
import { useNotifications } from '@/lib/notifications';

type RequestRow = {
  id: string;
  shop_id: string;
  status: string;
  note: string;
  nin_number: string;
  nin_image_url: string | null;
  nin_image_signed_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  shop: { id: string; name: string; slug: string; location: string; rating: number; is_verified: boolean; owner_id: string | null; created_at: string } | null;
};

type ScamAlert = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_body: string;
  signal_codes: string[];
  status: 'pending' | 'reviewed';
  created_at: string;
};

type AdminTab = 'overview' | 'verification' | 'fraud' | 'shops';

type AdminShop = {
  id: string;
  name: string;
  slug: string;
  location: string;
  is_verified: boolean;
  created_at: string;
};

const scamSignalLabels: Record<string, string> = {
  credential_request: 'Request for OTP, PIN, or security credentials',
  advance_payment: 'Request for an advance or extra fee',
  suspicious_verification_link: 'Link asking the user to verify an account or payment',
};

export default function AdminPage() {
  const { user, profile } = useAuth();
  const { items: notifications, unread: unreadNotifications } = useNotifications();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [scamAlerts, setScamAlerts] = useState<ScamAlert[]>([]);
  const [scamLoading, setScamLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState({ users: 0, shops: 0, verifiedShops: 0 });
  const [recentShops, setRecentShops] = useState<AdminShop[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [phoneAlertsEnabled, setPhoneAlertsEnabled] = useState(false);
  const [phoneAlertsBusy, setPhoneAlertsBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('verification_requests')
      .select('*, shop:shops(id, name, slug, location, rating, is_verified, owner_id, created_at)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setMessage('Could not load verification requests. Please try again.');
      setLoading(false);
      return;
    }

    const requestsWithSignedImages = await Promise.all((data || []).map(async (request) => {
      if (!request.nin_image_url) {
        return { ...request, nin_image_signed_url: null };
      }
      const { data: signedImage, error: signedImageError } = await supabase.storage
        .from('nin-verification')
        .createSignedUrl(request.nin_image_url, 300);
      if (signedImageError) {
        setMessage('Could not securely load a verification image. Check the private bucket policies.');
        return { ...request, nin_image_signed_url: null };
      }
      return { ...request, nin_image_signed_url: signedImage.signedUrl };
    }));

    setRequests(requestsWithSignedImages as unknown as RequestRow[]);
    setLoading(false);
  }, []);

  const loadScamAlerts = useCallback(async () => {
    const { data, error } = await supabase
      .from('chat_scam_alerts')
      .select('id, conversation_id, sender_id, message_body, signal_codes, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setMessage('Could not load chat safety alerts. Please try again.');
      setScamLoading(false);
      return;
    }
    setScamAlerts((data || []) as ScamAlert[]);
    setScamLoading(false);
  }, []);

  const loadOverview = useCallback(async () => {
    const [usersResult, shopsResult, verifiedResult, recentShopsResult] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('shops').select('id', { count: 'exact', head: true }),
      supabase.from('shops').select('id', { count: 'exact', head: true }).eq('is_verified', true),
      supabase
        .from('shops')
        .select('id, name, slug, location, is_verified, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    const overviewError = usersResult.error || shopsResult.error || verifiedResult.error || recentShopsResult.error;
    if (overviewError) {
      console.error('Could not load the admin dashboard summary.', overviewError);
      setMessage('Some dashboard totals could not be loaded. Refresh to try again.');
    } else {
      setOverview({
        users: usersResult.count || 0,
        shops: shopsResult.count || 0,
        verifiedShops: verifiedResult.count || 0,
      });
      setRecentShops((recentShopsResult.data || []) as AdminShop[]);
    }
    setOverviewLoading(false);
  }, []);

  useEffect(() => {
    if (!profile?.is_admin) {
      setLoading(false);
      setScamLoading(false);
      return;
    }
    void loadRequests();
    void loadScamAlerts();
    void loadOverview();
    const channel = supabase
      .channel(`admin-alerts-${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verification_requests' }, () => { void loadRequests(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_scam_alerts' }, () => { void loadScamAlerts(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, () => { void loadOverview(); })
      .subscribe();
    const refreshTimer = window.setInterval(() => {
      void loadRequests();
      void loadScamAlerts();
      void loadOverview();
    }, 30000);
    return () => {
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [profile?.is_admin, user?.id, loadRequests, loadScamAlerts, loadOverview]);

  useEffect(() => {
    if (!profile?.is_admin || !('serviceWorker' in navigator)) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setPhoneAlertsEnabled(Boolean(subscription));
      })
      .catch((error: unknown) => console.error('Could not check phone alert subscription.', error));
    return () => { active = false; };
  }, [profile?.is_admin]);

  const markScamAlertReviewed = async (alert: ScamAlert) => {
    setBusyId(alert.id);
    setMessage(null);
    const { error } = await supabase
      .from('chat_scam_alerts')
      .update({
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      })
      .eq('id', alert.id);
    setBusyId(null);
    if (error) {
      setMessage('Could not mark this chat alert reviewed. Please try again.');
      return;
    }
    await loadScamAlerts();
  };

  const review = async (req: RequestRow, approve: boolean, reason?: string) => {
    setBusyId(req.id);
    setMessage(null);
    const newStatus = approve ? 'approved' : 'rejected';

    let reqErr: { message: string } | null = null;
    if (approve) {
      // Verified shops don't need the request around anymore — remove it from the admin panel
      const { error } = await supabase.from('verification_requests').delete().eq('id', req.id);
      reqErr = error;
    } else {
      const { error } = await supabase
        .from('verification_requests')
        .update({ status: newStatus, reviewed_at: new Date().toISOString(), rejection_reason: sanitizePlainText(reason || '', 300) })
        .eq('id', req.id);
      reqErr = error;
    }

    let shopErr = null;
    if (req.shop) {
      if (approve) {
        const { error } = await supabase.from('shops').update({ is_verified: true }).eq('id', req.shop.id);
        shopErr = error;
      }
      // Notify the shop owner of the outcome
      let owner = req.shop.owner_id;
      if (!owner) {
        const { data: s } = await supabase.from('shops').select('owner_id').eq('id', req.shop.id).maybeSingle();
        owner = (s as { owner_id: string | null } | null)?.owner_id ?? null;
      }
      if (owner) {
        const { data: notification, error: notificationError } = await supabase.from('notifications').insert({
          user_id: owner,
          type: approve ? 'verification_approved' : 'verification_rejected',
          title: approve ? 'Your shop is verified!' : 'Verification declined',
          body: approve
            ? 'Congratulations — the green tick now shows on your shop and all your products.'
            : `Your verification application was not approved${reason ? `: ${reason}` : '. You can reapply anytime.'}`,
          link: approve ? null : '/verification',
        }).select('id').single();
        if (notificationError) {
          console.error('Could not create a shop verification notification.', notificationError);
        } else {
          const { error: smsError } = await supabase.functions.invoke('brevo-sms', {
            body: { type: 'verification_update', notificationId: notification.id },
          });
          if (smsError) console.error('Verification was saved, but SMS delivery could not be requested.', smsError);
        }
      }
    }

    setBusyId(null);
    if (reqErr || shopErr) {
      setMessage('Something went wrong while saving the review. Please try again.');
      return;
    }
    setMessage(approve ? `${req.shop?.name} is now verified.` : `Verification request from ${req.shop?.name} rejected.`);
    loadRequests();
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <ShieldCheck className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Admin panel</h1>
        <p className="text-ink-500 mb-6">Sign in with an admin account to review verification requests.</p>
        <button onClick={() => navigate({ name: 'signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Sign in</button>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <XCircle className="w-14 h-14 mx-auto mb-4 text-red-400" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Admins only</h1>
        <p className="text-ink-500">Your account doesn't have admin access.</p>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');
  const pendingScamCount = scamAlerts.filter((alert) => alert.status === 'pending').length;
  const attentionCount = pending.length + pendingScamCount;
  const notificationCount = Math.max(attentionCount, unreadNotifications);
  const adminNav: { id: AdminTab; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'verification', label: 'Verification', icon: BadgeCheck, badge: pending.length },
    { id: 'fraud', label: 'Fraud alerts', icon: ShieldCheck, badge: pendingScamCount },
    { id: 'shops', label: 'Shops', icon: ShoppingBag },
  ];

  const handleEnablePhoneAlerts = async () => {
    if (!user || phoneAlertsBusy) return;
    setPhoneAlertsBusy(true);
    setMessage(null);
    try {
      await enablePushNotifications(user.id);
      setPhoneAlertsEnabled(true);
    } catch (error) {
      console.error('Could not enable admin phone alerts.', error);
      setMessage(error instanceof Error ? error.message : 'Phone alerts could not be enabled. Please try again.');
    } finally {
      setPhoneAlertsBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-ink-900 px-4 py-6 text-white lg:flex">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-extrabold leading-tight">ShopSharp</p>
              <p className="text-xs text-white/60">Admin workspace</p>
            </div>
          </div>
          <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Manage marketplace</p>
          <nav aria-label="Admin navigation" className="space-y-1">
            {adminNav.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${
                  activeTab === id ? 'bg-brand-500 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {!!badge && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-brand-700">{badge}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-bold">ShopSharp safety</p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">Review seller identity checks and buyer protection alerts.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[76px]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 lg:hidden">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-extrabold text-ink-900">Admin dashboard</p>
                  <p className="hidden text-xs text-ink-500 sm:block">Marketplace operations and safety</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleEnablePhoneAlerts()}
                  disabled={phoneAlertsEnabled || phoneAlertsBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100 disabled:cursor-default disabled:opacity-70 sm:px-3"
                >
                  <Smartphone className="h-4 w-4" />
                  <span className="hidden sm:inline">{phoneAlertsEnabled ? 'Phone alerts on' : phoneAlertsBusy ? 'Enabling...' : 'Enable phone alerts'}</span>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`${notificationCount} admin notifications`}
                    aria-expanded={notificationOpen}
                    onClick={() => setNotificationOpen((open) => !open)}
                    className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-ink-100 text-ink-600 hover:bg-ink-50"
                  >
                    <Bell className="h-5 w-5" />
                    {notificationCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">{notificationCount}</span>}
                  </button>
                  {notificationOpen && (
                    <div className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-ink-100 bg-white p-2 shadow-xl">
                      <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-400">Recent notifications</p>
                      {notifications.slice(0, 4).map((notification) => (
                        <div key={notification.id} className="rounded-xl px-3 py-2.5 hover:bg-ink-50">
                          <p className="text-sm font-bold text-ink-800">{notification.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{notification.body}</p>
                          <p className="mt-1 text-[10px] text-ink-400">{formatTimeAgo(notification.created_at)}</p>
                        </div>
                      ))}
                      {notifications.length === 0 && <p className="px-3 pb-2 text-sm text-ink-500">No recent notifications.</p>}
                      <p className="px-3 pt-2 text-xs font-bold uppercase tracking-wider text-ink-400">Needs attention</p>
                      <button type="button" onClick={() => { setActiveTab('verification'); setNotificationOpen(false); }} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-ink-50">
                        <span>Shop verifications</span><span className="font-extrabold text-brand-700">{pending.length}</span>
                      </button>
                      <button type="button" onClick={() => { setActiveTab('fraud'); setNotificationOpen(false); }} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm hover:bg-ink-50">
                        <span>Fraud and chat alerts</span><span className="font-extrabold text-amber-700">{pendingScamCount}</span>
                      </button>
                      {attentionCount === 0 && <p className="px-3 pb-3 text-sm text-ink-500">You are all caught up.</p>}
                    </div>
                  )}
                </div>
                <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-800 sm:flex">
                  {(profile?.full_name || user.email || 'A').charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">ShopSharp Admin</p>
                <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">
                  {adminNav.find((item) => item.id === activeTab)?.label || 'Overview'}
                </h1>
                <p className="mt-1 text-sm text-ink-500">Manage sellers, verification, and marketplace safety.</p>
              </div>
              <button
                type="button"
                onClick={() => { void loadRequests(); void loadScamAlerts(); void loadOverview(); }}
                aria-label="Refresh admin dashboard"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {message && (
              <div role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                {message}
              </div>
            )}

            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {[
                    { label: 'Total users', value: overview.users, icon: Users, tone: 'bg-sky-50 text-sky-700' },
                    { label: 'Seller shops', value: overview.shops, icon: Store, tone: 'bg-brand-50 text-brand-700' },
                    { label: 'Verified shops', value: overview.verifiedShops, icon: BadgeCheck, tone: 'bg-emerald-50 text-emerald-700' },
                    { label: 'Needs attention', value: attentionCount, icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700' },
                  ].map(({ label, value, icon: Icon, tone }) => (
                    <article key={label} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">All time</span>
                      </div>
                      <p className="mt-4 text-2xl font-extrabold text-ink-900">{overviewLoading ? '—' : value.toLocaleString()}</p>
                      <p className="mt-1 text-xs font-semibold text-ink-500 sm:text-sm">{label}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
                    <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                      <div>
                        <h2 className="font-extrabold text-ink-900">Verification queue</h2>
                        <p className="mt-0.5 text-xs text-ink-500">{pending.length} request{pending.length === 1 ? '' : 's'} waiting</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('verification')} className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800">View queue <ChevronRight className="h-4 w-4" /></button>
                    </div>
                    {loading ? <div className="h-24 animate-pulse bg-ink-50" /> : pending.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-ink-500">No pending verification requests.</p>
                    ) : pending.slice(0, 4).map((request) => (
                      <button key={request.id} type="button" onClick={() => setActiveTab('verification')} className="flex w-full items-center gap-3 border-b border-ink-50 px-5 py-3.5 text-left last:border-0 hover:bg-ink-50">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-extrabold text-brand-700">{request.shop?.name.charAt(0) || '?'}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink-800">{request.shop?.name || 'Unknown shop'}</span><span className="block text-xs text-ink-400">{formatTimeAgo(request.created_at)}</span></span>
                        <ChevronRight className="h-4 w-4 text-ink-300" />
                      </button>
                    ))}
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
                    <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                      <div>
                        <h2 className="font-extrabold text-ink-900">Safety alerts</h2>
                        <p className="mt-0.5 text-xs text-ink-500">{pendingScamCount} alert{pendingScamCount === 1 ? '' : 's'} need review</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('fraud')} className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800">View alerts <ChevronRight className="h-4 w-4" /></button>
                    </div>
                    {scamLoading ? <div className="h-24 animate-pulse bg-ink-50" /> : pendingScamCount === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-ink-500">No unresolved safety alerts.</p>
                    ) : scamAlerts.filter((alert) => alert.status === 'pending').slice(0, 4).map((alert) => (
                      <button key={alert.id} type="button" onClick={() => setActiveTab('fraud')} className="flex w-full items-center gap-3 border-b border-ink-50 px-5 py-3.5 text-left last:border-0 hover:bg-ink-50">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink-800">{scamSignalLabels[alert.signal_codes[0]] || 'Potential scam signal'}</span><span className="block text-xs text-ink-400">{formatTimeAgo(alert.created_at)}</span></span>
                        <ChevronRight className="h-4 w-4 text-ink-300" />
                      </button>
                    ))}
                  </section>
                </div>
              </>
            )}

            {activeTab === 'shops' && (
              <section className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
                <div className="border-b border-ink-100 px-5 py-4">
                  <h2 className="font-extrabold text-ink-900">Recently created shops</h2>
                  <p className="mt-0.5 text-xs text-ink-500">Latest seller storefronts on ShopSharp.</p>
                </div>
                {overviewLoading ? <div className="h-28 animate-pulse bg-ink-50" /> : recentShops.length === 0 ? (
                  <p className="p-8 text-center text-sm text-ink-500">No seller shops yet.</p>
                ) : recentShops.map((shop) => (
                  <div key={shop.id} className="flex items-center gap-3 border-b border-ink-50 px-5 py-4 last:border-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Store className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-900">{shop.name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500">{shop.location} · created {formatTimeAgo(shop.created_at)}</p>
                    </div>
                    {shop.is_verified && <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>}
                  </div>
                ))}
              </section>
            )}

            {activeTab === 'fraud' && (
              <section aria-labelledby="chat-safety-heading">
        <h2 id="chat-safety-heading" className="text-xl font-extrabold text-ink-900 mt-8 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> Chat Safety Alerts
          {scamAlerts.filter((alert) => alert.status === 'pending').length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {scamAlerts.filter((alert) => alert.status === 'pending').length}
            </span>
          )}
        </h2>
        {scamLoading ? (
          <div className="h-20 bg-ink-50 rounded-2xl animate-pulse" />
        ) : scamAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-ink-100 p-6 text-center">
            <p className="text-sm text-ink-600 font-semibold">No chat safety alerts.</p>
            <p className="text-xs text-ink-400 mt-1">Only messages matching common scam warning patterns appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scamAlerts.map((alert) => (
              <article key={alert.id} className="bg-white rounded-2xl border border-amber-200 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        alert.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700'
                      }`}>
                        {alert.status === 'pending' ? 'Needs review' : 'Reviewed'}
                      </span>
                      <span className="text-xs text-ink-400">{formatTimeAgo(alert.created_at)}</span>
                    </div>
                    <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-800 break-words">
                      {alert.message_body}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {alert.signal_codes.map((code) => (
                        <li key={code} className="text-xs font-semibold text-amber-800">
                          {scamSignalLabels[code] || 'Potential scam signal detected'}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-ink-400">Sender ID: {alert.sender_id}</p>
                  </div>
                  {alert.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => void markScamAlertReviewed(alert)}
                      disabled={busyId === alert.id}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {busyId === alert.id ? 'Saving...' : 'Mark reviewed'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
              </section>
            )}

            {activeTab === 'verification' && (
              <section aria-labelledby="verification-heading">
      <h2 id="verification-heading" className="text-xl font-extrabold text-ink-900 mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-amber-500" /> Pending Requests
        {pending.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>}
      </h2>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 bg-ink-50 rounded-2xl animate-pulse" />)}</div>
      ) : pending.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-100 p-8 text-center">
          <BadgeCheck className="w-10 h-10 mx-auto mb-2 text-brand-500" />
          <p className="text-ink-600 font-semibold">All caught up — no pending requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((req) => (
            <div key={req.id} className="bg-white rounded-2xl border border-ink-100 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-500 text-white flex items-center justify-center font-extrabold text-lg shrink-0">
                  {req.shop?.name.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink-900">{req.shop?.name}</p>
                  <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1"><Store className="w-3 h-3" /> {req.shop?.location}</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {req.shop?.rating}</span>
                    <span>· requested {formatTimeAgo(req.created_at)}</span>
                  </p>
                  <p className="text-xs text-ink-700 mt-1.5 font-semibold">
                    NIN: <span className="tracking-widest">{req.nin_number}</span>
                  </p>
                  {rejectingId === req.id ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        maxLength={300}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason (e.g. NIN slip unclear)"
                        className="flex-1 h-9 px-3 rounded-lg border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                      />
                      <button
                        onClick={() => { review(req, false, rejectReason.trim()); setRejectingId(null); setRejectReason(''); }}
                        className="bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-red-600"
                      >
                        Confirm reject
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectReason(''); }}
                        className="text-xs font-semibold text-ink-500 hover:text-ink-700 px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {req.nin_image_signed_url && (
                    <a href={req.nin_image_signed_url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={req.nin_image_signed_url}
                        alt={`NIN slip for ${req.shop?.name}`}
                        className="w-20 h-20 object-cover rounded-xl border border-ink-100 hover:border-brand-300 transition-colors"
                      />
                    </a>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => review(req, true)}
                      disabled={busyId === req.id}
                      className="flex items-center gap-1.5 bg-brand-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-brand-600 disabled:opacity-60"
                    >
                      <BadgeCheck className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => { setRejectingId(req.id); setRejectReason(''); }}
                      disabled={busyId === req.id}
                      className="flex items-center gap-1.5 border border-ink-200 text-ink-600 font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-extrabold text-ink-900">Reviewed history</h2>
          <div className="space-y-2">
            {reviewed.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white px-5 py-3.5">
                <p className="text-sm font-semibold text-ink-800">{req.shop?.name}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                  req.status === 'approved' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'
                }`}>{req.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
              </section>
            )}
          </main>

          <nav aria-label="Admin mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(16,24,40,0.06)] lg:hidden">
            {adminNav.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-bold ${
                  activeTab === id ? 'text-brand-700' : 'text-ink-400'
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {!!badge && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-extrabold text-white">{badge}</span>}
                </span>
                <span>{label === 'Fraud alerts' ? 'Fraud' : label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
