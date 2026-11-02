import { useEffect, useState } from 'react';
import {
  Store, Plus, Package, BarChart3, Crown, BadgeCheck,
  AlertCircle, Building2, MessageSquare, TrendingUp, Sparkles, Copy, Share2, X, Eye, MousePointerClick,
} from 'lucide-react';
import { supabase, type ShopWithPlan, type ListingWithCategory } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatPrice, formatNumber } from '@/lib/format';
import { navigate } from '@/lib/router';
import ListingCard from '@/components/ListingCard';
import { sanitizePlainText } from '@/lib/input';
import { isPromotionSchemaUnavailable } from '@/lib/promotions';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [shop, setShop] = useState<ShopWithPlan | null>(null);
  const [listings, setListings] = useState<ListingWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newShop, setNewShop] = useState({ name: '', description: '', location: 'Lagos' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shopLinkOpen, setShopLinkOpen] = useState(false);
  const [shopLinkMessage, setShopLinkMessage] = useState<string | null>(null);
  const [shopLinkCopied, setShopLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [showVerifiedNotice, setShowVerifiedNotice] = useState(false);
  const [verification, setVerification] = useState<{ status: string; rejection_reason: string | null } | null>(null);
  const [listingStats, setListingStats] = useState<Record<string, { views: number; clicks: number; inquiries: number }>>({});
  const [promotionUsage, setPromotionUsage] = useState(0);
  const [promotionsAvailable, setPromotionsAvailable] = useState(true);
  const [promotingListingId, setPromotingListingId] = useState<string | null>(null);
  const [promotionFeedback, setPromotionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadShop = async (userId: string) => {
    setLoading(true);
    setLoadError(null);
    setPromotionFeedback(null);
    setPromotionsAvailable(true);
    const { data, error: shopError } = await supabase
      .from('shops')
      .select('*, plan:plans(*)')
      .eq('owner_id', userId)
      .maybeSingle();
    if (shopError) {
      console.error('Could not load the seller shop.', shopError);
      setLoadError('We could not load your shop. Please retry before making changes.');
      setLoading(false);
      return;
    }
    if (data) {
      const s = data as unknown as ShopWithPlan;
      setShop(s);
      const { data: listData, error: listingsError } = await supabase
        .from('listings')
        .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
        .eq('shop_id', s.id)
        .order('created_at', { ascending: false });
      if (listingsError) {
        console.error('Could not load seller listings.', listingsError);
        setLoadError('Your shop loaded, but its products could not be loaded. Please retry.');
      }
      setListings((listData || []) as unknown as ListingWithCategory[]);
      const analyticsResult = await supabase
          .from('listing_analytics')
          .select('listing_id, view_count, click_count, inquiry_count')
          .eq('shop_id', s.id);
      if (analyticsResult.error) {
        if (isPromotionSchemaUnavailable(analyticsResult.error)) {
          setPromotionsAvailable(false);
          setListingStats({});
          console.warn('Listing promotion schema is not deployed; promote controls will stay unavailable until the migration is applied.');
        } else {
          console.error('Could not load listing analytics.', analyticsResult.error);
          setPromotionFeedback({ type: 'error', text: 'Listing analytics could not be loaded.' });
        }
      } else {
        setListingStats(Object.fromEntries((analyticsResult.data || []).map((row) => [
          row.listing_id,
          {
            views: Number(row.view_count),
            clicks: Number(row.click_count),
            inquiries: Number(row.inquiry_count),
          },
        ])));
      }
      if (s.plan?.price_naira) {
        const { data: activeSubscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('started_at, expires_at')
          .eq('shop_id', s.id)
          .eq('plan_id', s.plan_id)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subscriptionError) {
          console.error('Could not load the active plan period.', subscriptionError);
          setPromotionFeedback({ type: 'error', text: 'Your paid plan period could not be checked.' });
        } else if (activeSubscription?.started_at && activeSubscription.expires_at) {
          const { count, error: boostsError } = await supabase
            .from('listing_promotions')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', s.id)
            .gte('created_at', activeSubscription.started_at)
            .lt('created_at', activeSubscription.expires_at);
          if (boostsError) {
            if (isPromotionSchemaUnavailable(boostsError)) {
              setPromotionsAvailable(false);
              console.warn('Listing promotion schema is not deployed; monthly boost usage is unavailable.');
            } else {
              console.error('Could not load monthly promotion usage.', boostsError);
              setPromotionFeedback({ type: 'error', text: 'Monthly promotion usage could not be loaded.' });
            }
          } else {
            setPromotionUsage(count || 0);
          }
        } else {
          setPromotionUsage(0);
        }
      } else {
        setPromotionUsage(0);
      }
      const { data: vr } = await supabase
        .from('verification_requests')
        .select('status, rejection_reason')
        .eq('shop_id', s.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (vr) setVerification(vr as { status: string; rejection_reason: string | null });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadShop(user.id);
  }, [user]);

  useEffect(() => {
    if (!user || !shop) return;
    (async () => {
      const { data: count, error } = await supabase.rpc('get_unread_shop_chat_count', {
        p_shop_id: shop.id,
      });
      if (error) {
        console.error('Could not load unread seller chats.', error);
        setLoadError('Your unread chat count could not be loaded.');
        return;
      }
      setUnreadChats(Number(count) || 0);
    })();
  }, [user, shop]);

  useEffect(() => {
    if (!shop?.is_verified) {
      setShowVerifiedNotice(false);
      return;
    }
    setShowVerifiedNotice(true);
    const timer = window.setTimeout(() => setShowVerifiedNotice(false), 15000);
    return () => window.clearTimeout(timer);
  }, [shop?.id, shop?.is_verified]);

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreateError(null);
    const shopName = sanitizePlainText(newShop.name, 80);
    const description = sanitizePlainText(newShop.description, 500);
    const location = sanitizePlainText(newShop.location, 80);
    if (shopName.length < 2 || !location) {
      setCreateError('Enter a shop name with at least 2 characters and a location.');
      return;
    }
    setBusy(true);

    const slugBase = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase || 'shop'}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: freePlan, error: planError } = await supabase.from('plans').select('id').eq('name', 'free').maybeSingle();
    if (planError || !freePlan) {
      console.error('Could not load the free plan before creating the shop.', planError);
      setCreateError('Could not prepare your free shop. Please try again.');
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from('shops')
      .insert({
        owner_id: user.id,
        name: shopName,
        slug,
        description: description || `Welcome to ${shopName}. Quality items, quick replies, honest deals.`,
        location,
        plan_id: freePlan.id,
      })
      .select('*, plan:plans(*)')
      .single();

    setBusy(false);
    if (error || !data) {
      console.error('Could not create the seller shop.', error);
      setCreateError('Could not create your shop. Please try again.');
      return;
    }
    setShop(data as unknown as ShopWithPlan);
    setShopLinkOpen(true);
  };

  const shopUrl = shop ? `${window.location.origin}/shop/${encodeURIComponent(shop.slug)}` : '';

  const copyShopLink = async () => {
    try {
      await navigator.clipboard.writeText(shopUrl);
      setShopLinkCopied(true);
      setShopLinkMessage('Shop link copied. Share it with your customers.');
    } catch (error) {
      console.error('Could not copy the shop link.', error);
      setShopLinkMessage('Could not copy automatically. Select and copy the link above.');
    }
  };

  const shareShopLink = async () => {
    setShopLinkMessage(null);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${shop?.name} on ShopSharp`, text: `Visit ${shop?.name} on ShopSharp`, url: shopUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Could not open the shop sharing menu.', error);
        setShopLinkMessage('Could not open sharing. Copy the link to share it manually.');
        return;
      }
    }
    await copyShopLink();
  };

  const promoteListing = async (listingId: string) => {
    if (!shop) return;
    if (!promotionsAvailable) {
      setPromotionFeedback({
        type: 'error',
        text: 'Sponsored listings are not available yet because the promotion database update has not been applied.',
      });
      return;
    }
    if (!shop.is_verified) {
      navigate({ name: 'verification' });
      return;
    }
    const boostLimit = shop.plan?.boosts_per_month ?? 0;
    if (boostLimit <= 0) {
      navigate({ name: 'dashboard-subscription' });
      return;
    }
    if (!window.confirm('Use one monthly boost to sponsor this listing for 7 days? It improves placement but does not guarantee a sale.')) {
      return;
    }

    setPromotionFeedback(null);
    setPromotingListingId(listingId);
    try {
      const { error } = await supabase.rpc('promote_listing', { p_listing_id: listingId });
      if (error) {
        if (isPromotionSchemaUnavailable(error)) {
          setPromotionsAvailable(false);
          setPromotionFeedback({
            type: 'error',
            text: 'Sponsored listings are not available yet because the promotion database update has not been applied.',
          });
          return;
        }
        console.error('Could not promote the seller listing.', error);
        setPromotionFeedback({ type: 'error', text: error.message });
        return;
      }

      const promotedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      setListings((current) => current.map((listing) => (
        listing.id === listingId ? { ...listing, promoted_until: promotedUntil } : listing
      )));
      setPromotionUsage((count) => count + 1);
      setPromotionFeedback({
        type: 'success',
        text: 'Listing promoted for 7 days. It can appear in the sponsored position near the top of matching category and search results.',
      });
    } catch (error) {
      console.error('Could not send the listing promotion request.', error);
      setPromotionFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not promote this listing. Please try again.',
      });
    } finally {
      setPromotingListingId(null);
    }
  };

  const deleteListing = async (id: string) => {
    if (!confirm('Remove this product from your shop?')) return;
    setDeleteError(null);
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) {
      console.error('Could not delete the seller listing.', error);
      setDeleteError('Could not remove this product. Please try again.');
      return;
    }
    setListings((prev) => prev.filter((l) => l.id !== id));
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Store className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Vendor dashboard</h1>
        <p className="text-ink-500 mb-6">Sign in to manage your shop, products, plan and buyer chats.</p>
        <button onClick={() => navigate({ name: 'signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">
          Sign in
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-ink-50 rounded-2xl animate-pulse h-40 mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-ink-50 rounded-2xl animate-pulse h-24" />
          <div className="bg-ink-50 rounded-2xl animate-pulse h-24" />
          <div className="bg-ink-50 rounded-2xl animate-pulse h-24" />
        </div>
      </div>
    );
  }

  if (loadError && !shop) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center" role="alert">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" aria-hidden="true" />
        <h1 className="text-2xl font-extrabold text-ink-900">Shop details unavailable</h1>
        <p className="mt-2 text-ink-600">{loadError}</p>
        <button type="button" onClick={() => void loadShop(user.id)} className="mt-6 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
          Try again
        </button>
      </section>
    );
  }

  // ── Create shop screen ──
  if (!shop) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand-500 text-white flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-ink-900">Open your free shop</h1>
          <p className="text-ink-500 mt-2">Turn your selling into a real brand — with a shop page, in-app chats and growth tools.</p>
        </div>

        <form onSubmit={handleCreateShop} className="bg-white rounded-3xl border border-ink-100 p-6 sm:p-8 space-y-5">
          {createError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{createError}</p>
            </div>
          )}
          <div>
            <label className="text-sm font-semibold text-ink-700 block mb-2">Shop Name *</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={newShop.name}
              onChange={(e) => setNewShop({ ...newShop, name: e.target.value })}
              placeholder="e.g. Chidi Gadgets NG"
              className="w-full h-12 px-4 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-ink-700 block mb-2">Shop Location *</label>
            <select
              value={newShop.location}
              onChange={(e) => setNewShop({ ...newShop, location: e.target.value })}
              className="w-full h-12 px-4 rounded-xl border border-ink-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
            >
              {['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu'].map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-ink-700 block mb-2">About your shop</label>
            <textarea
              value={newShop.description}
              maxLength={500}
              onChange={(e) => setNewShop({ ...newShop, description: e.target.value })}
              placeholder="What do you sell? What makes your shop trusted?"
              rows={3}
              className="w-full p-4 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 resize-none"
            />
          </div>
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-sm text-brand-800">
            You start on the <span className="font-bold">Free plan</span> — up to 5 active products. Upgrade anytime.
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-extrabold py-4 rounded-xl transition-colors disabled:opacity-60"
          >
            {busy ? 'Creating your shop...' : 'Create My Shop — Free'}
          </button>
        </form>
      </div>
    );
  }

  // ── Dashboard ──
  const activeCount = listings.filter((l) => l.status === 'active').length;
  const limit = shop.plan?.product_limit ?? 5;
  const usagePct = Math.min(100, Math.round((activeCount / limit) * 100));
  const totalValue = listings.reduce((sum, l) => sum + Number(l.price), 0);
  const atLimit = activeCount >= limit;
  const totalViews = Object.values(listingStats).reduce((sum, stats) => sum + stats.views, 0);
  const totalClicks = Object.values(listingStats).reduce((sum, stats) => sum + stats.clicks, 0);
  const totalInquiries = Object.values(listingStats).reduce((sum, stats) => sum + stats.inquiries, 0);
  const boostLimit = shop.plan?.boosts_per_month ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 text-white flex items-center justify-center font-extrabold text-xl">
            {shop.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-ink-900 flex items-center gap-2">
              {shop.name}
              {shop.is_verified && <BadgeCheck className="w-5 h-5 text-brand-500" />}
            </h1>
            <p className="text-sm text-ink-500">Welcome back, {profile?.full_name || 'vendor'} 👋</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => navigate({ name: 'shop', slug: shop.slug })}
            className="flex items-center gap-2 bg-white border border-ink-200 text-ink-700 font-semibold px-4 py-2.5 rounded-xl text-sm hover:border-brand-300 transition-colors"
          >
            <Store className="w-4 h-4" /> View shop page
          </button>
          <button
            onClick={() => navigate({ name: 'messages' })}
            className="flex items-center gap-2 bg-white border border-ink-200 text-ink-700 font-semibold px-4 py-2.5 rounded-xl text-sm hover:border-brand-300 transition-colors"
          >
            <MessageSquare className="w-4 h-4" /> Buyer chats {unreadChats > 0 && <span className="bg-brand-500 text-white text-xs px-1.5 rounded-full">{unreadChats}</span>}
          </button>
        </div>
      </div>

      {/* Verification banner / card */}
      {shop.is_verified && showVerifiedNotice ? (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5 mb-8 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-500 text-white flex items-center justify-center shrink-0">
            <BadgeCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="font-extrabold text-ink-900">Your shop is verified</p>
            <p className="text-sm text-ink-500">Buyers see the green tick on your shop and every product.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-ink-100 p-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${verification?.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-brand-50 text-brand-600'}`}>
            <BadgeCheck className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-extrabold text-ink-900">
              {verification?.status === 'pending' ? 'Verification under review' : verification?.status === 'rejected' ? 'Verification declined' : 'Get the verified badge — free' }
            </p>
            <p className="text-sm text-ink-500">
              {verification?.status === 'pending'
                ? "We're reviewing your NIN details. You'll be notified of the outcome."
                : verification?.status === 'rejected'
                  ? `${verification.rejection_reason || 'Your NIN could not be confirmed.'} You can reapply anytime.`
                  : 'Apply with your NIN — free for every shop, and buyers trust verified sellers more.'}
            </p>
          </div>
          {verification?.status !== 'pending' && (
            <button
              onClick={() => navigate({ name: 'verification' })}
              className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-3 rounded-xl transition-colors text-sm"
            >
              {verification?.status === 'rejected' ? 'Reapply' : 'Apply for Verification'}
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      {loadError && (
        <p role="alert" className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
          <button type="button" onClick={() => void loadShop(user.id)} className="shrink-0 font-bold underline">Retry</button>
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Package, label: 'Active Products', value: `${activeCount}`, sub: `of ${limit === 100000 ? 'unlimited' : limit} on ${shop.plan?.display_name || 'Free'}` },
          { icon: BarChart3, label: 'Catalogue Value', value: formatPrice(totalValue), sub: 'total listed price' },
          { icon: MessageSquare, label: 'Buyer Chats', value: formatNumber(unreadChats), sub: 'conversations' },
          { icon: TrendingUp, label: 'Shop Rating', value: `${shop.rating}`, sub: shop.is_verified ? 'verified shop' : 'unverified' },
          ...(shop.plan?.name === 'starter'
            ? [
                { icon: Eye, label: 'Product Views', value: formatNumber(totalViews), sub: 'all product views' },
                { icon: MessageSquare, label: 'Inquiries', value: formatNumber(totalInquiries), sub: 'buyer conversations' },
              ]
            : []),
          ...(shop.plan?.name === 'pro'
            ? [
                { icon: Eye, label: 'Product Views', value: formatNumber(totalViews), sub: 'all product views' },
                { icon: MousePointerClick, label: 'Product Clicks', value: formatNumber(totalClicks), sub: 'all listing clicks' },
              ]
            : []),
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-ink-100 p-5">
            <stat.icon className="w-5 h-5 text-brand-500 mb-3" />
            <p className="text-2xl font-extrabold text-ink-900">{stat.value}</p>
            <p className="text-xs font-semibold text-ink-600 mt-0.5">{stat.label}</p>
            <p className="text-xs text-ink-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Plan usage bar */}
      <div className="bg-white rounded-2xl border border-ink-100 p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-ink-900 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" /> {shop.plan?.display_name || 'Free'} Plan
            </p>
            <p className="text-sm text-ink-500 mt-0.5">
              {activeCount} of {limit === 100000 ? 'unlimited' : limit} products used
            </p>
            {boostLimit > 0 && (
              <p className="mt-1 text-sm text-ink-500">
                {Math.max(0, boostLimit - promotionUsage)} of {boostLimit} monthly listing boosts remaining · 7 days each
              </p>
            )}
          </div>
          <button
            onClick={() => navigate({ name: 'dashboard-subscription' })}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            {atLimit ? 'Upgrade Required' : 'Upgrade Plan'}
          </button>
        </div>
        <div className="h-3 bg-ink-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-400' : 'bg-brand-500'}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        {atLimit && (
          <p className="text-sm text-red-600 font-semibold mt-3 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> Plan limit reached — you can't post new products until you upgrade.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => navigate({ name: 'post-ad' })}
          disabled={atLimit}
          className="flex items-center gap-2 bg-brand-500 text-white font-bold px-5 py-3 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Post New Product
        </button>
        <button
          onClick={() => navigate({ name: 'dashboard-subscription' })}
          className="flex items-center gap-2 bg-white border border-ink-200 text-ink-700 font-semibold px-5 py-3 rounded-xl hover:border-brand-300 transition-colors text-sm"
        >
          <Sparkles className="w-4 h-4" /> Subscription & Boosts
        </button>
      </div>

      {/* Products */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-extrabold text-ink-900">Your Products</h2>
      </div>
      {deleteError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</p>}
      {promotionFeedback && (
        <p
          role={promotionFeedback.type === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-xl border p-4 text-sm ${promotionFeedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-brand-200 bg-brand-50 text-brand-800'}`}
        >
          {promotionFeedback.text}
        </p>
      )}
      {!promotionsAvailable && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Sponsored placement is being set up and will appear here after the promotion database update is applied.
        </p>
      )}
      {listings.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-ink-100">
          <Package className="w-12 h-12 mx-auto mb-3 text-ink-200" />
          <p className="text-ink-500 font-medium mb-4">No products yet.</p>
          <button
            onClick={() => navigate({ name: 'post-ad' })}
            className="bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-600 text-sm"
          >
            Post your first product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {listings.map((listing) => {
            const isPromoted = Boolean(listing.promoted_until && Date.parse(listing.promoted_until) > Date.now());
            const stats = listingStats[listing.id] || { views: 0, clicks: 0, inquiries: 0 };
            const planName = shop.plan?.name;
            const showDetailedStats = planName === 'pro';
            return (
              <div key={listing.id} className="min-w-0">
                <ListingCard listing={listing} />
                {showDetailedStats && (
                  <p className="mt-2 text-center text-xs text-ink-500">
                    {formatNumber(stats.views)} views · {formatNumber(stats.clicks)} clicks · {formatNumber(stats.inquiries)} inquiries
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void promoteListing(listing.id)}
                    disabled={!promotionsAvailable || isPromoted || promotingListingId !== null || (boostLimit > 0 && promotionUsage >= boostLimit)}
                    className="min-w-0 flex-1 rounded-full border border-brand-100 bg-white px-2 py-2 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {promotingListingId === listing.id
                      ? 'Promoting...'
                      : isPromoted
                        ? `Sponsored until ${new Date(listing.promoted_until!).toLocaleDateString()}`
                        : !promotionsAvailable
                          ? 'Promotion setup pending'
                        : !shop.is_verified
                          ? 'Verify shop to promote'
                          : boostLimit <= 0
                            ? 'Upgrade to promote'
                            : promotionUsage >= boostLimit
                              ? 'No boosts left'
                              : 'Promote listing'}
                  </button>
                  <button
                    onClick={() => deleteListing(listing.id)}
                    className="rounded-full border border-red-100 bg-white px-2.5 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shopLinkOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-900/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="shop-link-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="shop-link-title" className="text-xl font-extrabold text-ink-900">Your shop is open!</h2>
                <p className="mt-1 text-sm text-ink-500">Share your shop link so customers can find your products.</p>
              </div>
              <button onClick={() => setShopLinkOpen(false)} aria-label="Close shop link dialog" className="rounded-full p-2 text-ink-500 hover:bg-ink-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label htmlFor="shop-public-link" className="mt-5 block text-sm font-semibold text-ink-700">Your public shop link</label>
            <input id="shop-public-link" readOnly value={shopUrl} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-3 text-sm text-ink-700" />
            {shopLinkMessage && <p role="status" className="mt-3 text-sm text-brand-700">{shopLinkMessage}</p>}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button onClick={() => void copyShopLink()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 py-3 text-sm font-bold text-ink-700 hover:bg-ink-50">
                <Copy className="h-4 w-4" /> {shopLinkCopied ? 'Copied' : 'Copy link'}
              </button>
              <button onClick={() => void shareShopLink()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600">
                <Share2 className="h-4 w-4" /> Share shop
              </button>
            </div>
            <button onClick={() => { setShopLinkOpen(false); navigate({ name: 'shop', slug: shop!.slug }); }} className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              View my shop
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
