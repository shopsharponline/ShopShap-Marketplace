import { useEffect, useState } from 'react';
import { Check, Crown, Zap, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase, type Plan, type ShopWithPlan } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';

export default function SubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [shop, setShop] = useState<ShopWithPlan | null>(null);
  const [activeListingCount, setActiveListingCount] = useState(0);
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const [plansRes, shopRes] = await Promise.all([
        supabase.from('plans').select('*').order('price_naira'),
        supabase.from('shops').select('*, plan:plans(*)').eq('owner_id', user.id).maybeSingle(),
      ]);
      setPlans((plansRes.data || []) as Plan[]);
      if (shopRes.data) {
        const s = shopRes.data as unknown as ShopWithPlan;
        setShop(s);
        const [{ count }, { data: subscription }] = await Promise.all([
          supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', s.id)
          .eq('status', 'active'),
          supabase
            .from('subscriptions')
            .select('expires_at')
            .eq('shop_id', s.id)
            .eq('status', 'active')
            .not('expires_at', 'is', null)
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        setActiveListingCount(count || 0);
        setPlanExpiresAt(subscription?.expires_at ?? null);
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paystack') !== '1') return;
    if (authLoading || !user) return;

    const reference = params.get('reference') || params.get('trxref');
    if (!reference) {
      setMessage({ type: 'error', text: 'Paystack did not return a payment reference. Your plan has not been changed.' });
      window.history.replaceState({}, document.title, '/dashboard/subscription');
      return;
    }

    let cancelled = false;
    setPaying('verification');
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('paystack-subscription', {
          body: { action: 'verify', reference },
        });
        if (cancelled) return;

        window.history.replaceState({}, document.title, '/dashboard/subscription');
        setPaying(null);
        if (error || !data?.success) {
          setMessage({ type: 'error', text: error?.message || data?.error || 'Paystack could not verify this payment. Your plan has not been changed.' });
          return;
        }

        const { data: refreshedShop, error: refreshError } = await supabase
          .from('shops')
          .select('*, plan:plans(*)')
          .eq('owner_id', user.id)
          .maybeSingle();
        if (refreshError) {
          console.error('Payment succeeded, but the activated plan could not be reloaded.', refreshError);
        } else if (refreshedShop) {
          setShop(refreshedShop as unknown as ShopWithPlan);
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('expires_at')
            .eq('shop_id', refreshedShop.id)
            .eq('status', 'active')
            .not('expires_at', 'is', null)
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setPlanExpiresAt(subscription?.expires_at ?? null);
        }
        setMessage({ type: 'success', text: `${data.planName || 'Paid'} plan activated!` });
      } catch (error) {
        if (cancelled) return;
        window.history.replaceState({}, document.title, '/dashboard/subscription');
        setPaying(null);
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Could not verify this Paystack payment.',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, user]);

  const startPayment = async (plan: Plan) => {
    if (!user || !shop) {
      navigate({ name: 'signin' });
      return;
    }
    if (plan.price_naira === 0) {
      // Downgrade request — record free subscription immediately
      void applyPlan(plan);
      return;
    }

    setPaying(plan.id);
    setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('paystack-subscription', {
        body: { action: 'initialize', planId: plan.id },
      });
      if (error || typeof data?.authorizationUrl !== 'string') {
        setPaying(null);
        setMessage({
          type: 'error',
          text: error?.message || data?.error || 'Could not start secure checkout. Paystack may not be configured yet.',
        });
        return;
      }
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setPaying(null);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not start secure Paystack checkout.',
      });
    }
  };

  const applyPlan = async (plan: Plan) => {
    if (!shop) return;
    const { error: subError } = await supabase.from('subscriptions').insert({
      shop_id: shop.id,
      plan_id: plan.id,
      status: 'active',
      paystack_ref: null,
      started_at: new Date().toISOString(),
    });
    if (subError) {
      setMessage({ type: 'error', text: `Could not switch to the free plan: ${subError.message}` });
      return;
    }
    const { error: shopError } = await supabase
      .from('shops')
      .update({ plan_id: plan.id })
      .eq('id', shop.id);

    if (shopError) {
      setMessage({ type: 'error', text: `Subscription was recorded but the shop plan could not be updated: ${shopError.message}` });
      return;
    }
    setMessage({ type: 'success', text: `Switched to the ${plan.display_name} plan.` });
    // Refresh shop
    const { data } = await supabase.from('shops').select('*, plan:plans(*)').eq('id', shop.id).maybeSingle();
    if (data) setShop(data as unknown as ShopWithPlan);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Crown className="w-14 h-14 mx-auto mb-4 text-amber-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Subscription plans</h1>
        <p className="text-ink-500 mb-6">Sign in to manage your shop's plan.</p>
        <button onClick={() => navigate({ name: 'signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Sign in</button>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-8"><div className="bg-ink-50 rounded-2xl animate-pulse h-64" /></div>;
  }

  if (!shop) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-extrabold text-ink-900 mb-2">No shop yet</p>
        <p className="text-ink-500 mb-6">Open your free shop first, then pick a plan.</p>
        <button onClick={() => navigate({ name: 'dashboard' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Open free shop</button>
      </div>
    );
  }

  const activeCount = activeListingCount;
  const limit = shop.plan?.product_limit ?? 5;
  const usagePct = Math.min(100, Math.round((activeCount / limit) * 100));
  const currentPlan = shop.plan;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => navigate({ name: 'dashboard' })} className="flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-ink-900">Subscription</h1>
        <p className="text-ink-500 mt-1">Pick a shop plan built around product volume, boosts, and visibility. Boosts improve placement without guaranteeing a sale.</p>
      </div>

      {message && (
        <div className={`mb-6 flex items-start gap-3 rounded-xl p-4 border ${message.type === 'success' ? 'bg-brand-50 border-brand-200 text-brand-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* Usage */}
      <div className="bg-white rounded-2xl border border-ink-100 p-6 mb-8">
        <p className="font-bold text-ink-900">Current usage — {currentPlan?.display_name || 'Free'} plan</p>
        <p className="text-sm text-ink-500 mt-0.5 mb-3">{activeCount} of {limit === 100000 ? 'unlimited' : limit} products used</p>
        {planExpiresAt && currentPlan?.price_naira ? (
          <p className="text-sm text-ink-500 mb-3">
            Paid through {new Date(planExpiresAt).toLocaleDateString()} · renew manually to keep this plan.
          </p>
        ) : null}
        <div className="h-3 bg-ink-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-400' : 'bg-brand-500'}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const isCurrent = currentPlan?.id === plan.id;
          const isPro = plan.name === 'pro';
          const boostCount = plan.boosts_per_month;
          const planStats = plan.name === 'starter'
            ? 'Basic total product views and inquiries'
            : plan.name === 'pro'
              ? 'Branded storefront and full per-product analytics'
              : 'Storefront and buyer chats';
          const analytics = plan.name === 'pro';
          return (
            <div
              key={plan.id}
              className={`relative rounded-3xl border p-6 flex flex-col transition-all ${
                isPro
                  ? 'border-brand-500 bg-ink-900 text-white shadow-xl md:-translate-y-2'
                  : 'border-ink-100 bg-white hover:border-brand-300 hover:shadow-lg'
              }`}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Most Popular
                </span>
              )}
              <div className="flex items-center gap-2 mb-3">
                {isPro ? <Crown className="w-5 h-5 text-amber-400" /> : <Zap className={`w-5 h-5 ${isCurrent ? 'text-brand-500' : 'text-ink-400'}`} />}
                <h3 className={`font-extrabold text-xl ${isPro ? 'text-white' : 'text-ink-900'}`}>{plan.display_name}</h3>
              </div>
              <p className={`text-3xl font-extrabold ${isPro ? 'text-white' : 'text-ink-900'}`}>
                {plan.price_naira === 0 ? 'Free' : `₦${plan.price_naira.toLocaleString()}`}
                {plan.price_naira > 0 && <span className={`text-sm font-medium ${isPro ? 'text-white/50' : 'text-ink-400'}`}>/month</span>}
              </p>

              <ul className="mt-5 space-y-2.5 flex-1">
                <li className={`flex items-start gap-2 text-sm ${isPro ? 'text-white/80' : 'text-ink-600'}`}>
                  <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                  Up to {plan.product_limit} products
                </li>
                <li className={`flex items-start gap-2 text-sm ${isPro ? 'text-white/80' : 'text-ink-600'}`}>
                  <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                  {boostCount > 0 ? `${boostCount} sponsored listing boosts per month · 7 days each` : 'Buyer chats in the app'}
                </li>
                <li className={`flex items-start gap-2 text-sm ${isPro ? 'text-white/80' : 'text-ink-600'}`}>
                  <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                  {planStats}
                </li>
                {analytics && (
                  <li className={`flex items-start gap-2 text-sm ${isPro ? 'text-white/80' : 'text-ink-600'}`}>
                    <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                    Per-product views, clicks, and buyer inquiries
                  </li>
                )}
              </ul>

              <button
                onClick={() => startPayment(plan)}
                disabled={isCurrent || paying !== null}
                className={`mt-6 w-full font-bold py-3.5 rounded-xl transition-colors disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'bg-ink-100 text-ink-400'
                    : isPro
                      ? 'bg-brand-500 text-white hover:bg-brand-400'
                      : 'bg-brand-500 text-white hover:bg-brand-600'
                } ${paying === plan.id ? 'opacity-60' : ''}`}
              >
                {isCurrent ? 'Current Plan' : paying === 'verification' ? 'Verifying payment...' : paying === plan.id ? 'Processing...' : plan.price_naira === 0 ? 'Switch to Free' : `Pay ₦${plan.price_naira.toLocaleString()}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-400 mt-8">
        Each paid plan purchase covers one month and does not renew automatically. Renew manually before it expires to keep your current plan.
      </p>
    </div>
  );
}
