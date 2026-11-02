import { useEffect } from 'react';
import { ArrowRight, Store, ShieldCheck, Zap, MapPin } from 'lucide-react';
import { navigate } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';

export default function BecomeASellerPage() {
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (shop) {
        navigate({ name: 'post-ad' });
      }
    })();
  }, [authLoading, user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      <header className="bg-white border-b border-ink-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate({ name: 'home' })}
            className="shrink-0 p-2 hover:bg-ink-50 rounded-full transition-colors"
          >
            <Logo light size="sm" />
          </button>
          <div className="ml-auto flex items-center gap-4 text-sm text-ink-600">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              Nigeria
            </span>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative py-12 sm:py-20 px-4 sm:px-6 overflow-hidden">
          <div className="absolute inset-0 bg-brand-500/5 pointer-events-none" />
          <div className="relative max-w-4xl mx-auto text-center z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold mb-6 animate-fade-slide-up">
              <Zap className="w-3 h-3" />
              Now accepting sellers nationwide
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6 sm:mb-8 animate-fade-slide-up" style={{ animationDelay: '100ms' }}>
              Do You Sell Anything? Put Your Store Where Buyers Are Searching.
            </h1>
            <p className="text-lg sm:text-xl text-ink-600 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-slide-up" style={{ animationDelay: '200ms' }}>
              Join ShopSharp - Nigeria&rsquo;s growing marketplace. Post your products once and reach buyers ready to buy from you every day.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-slide-up" style={{ animationDelay: '300ms' }}>
              <button
                onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'seller-signup' })}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl text-lg shadow-lg shadow-brand-500/25 transition-all hover:shadow-lg hover:-translate-y-1 active:scale-95"
              >
                <Store className="w-5 h-5" /> Start Selling Now
              </button>
              <button
                onClick={() => navigate({ name: 'info', slug: 'how-it-works' })}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-4 bg-white hover:bg-ink-50 text-ink-800 font-bold rounded-xl border border-ink-200 text-lg transition-all hover:-translate-y-1 active:scale-95"
              >
                <ArrowRight className="w-4 h-4" /> How It Works
              </button>
            </div>
          </div>
        </section>

        {/* ── How it Works ── */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12 animate-fade-slide-up">
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">How It Works</h2>
              <p className="text-ink-500">Start selling in three simple steps</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  num: '1',
                  title: 'Create your free seller account',
                  body: 'Sign up as a seller and open your free ShopSharp shop in under 2 minutes.',
                },
                {
                  num: '2',
                  title: 'Upload your products with photos and prices',
                  body: 'List fashion, electronics, beauty, home items and more with clear photos and prices.',
                },
                {
                  num: '3',
                  title: 'Start getting orders and chats from buyers',
                  body: 'Buyers across Nigeria find your products and chat with you directly in the app.',
                },
              ].map((step, i) => (
                <div key={step.num} className="bg-ink-50 rounded-2xl p-6 text-center animate-fade-slide-up" style={{ animationDelay: `${300 + i * 100}ms` }}>
                  <div className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center mx-auto mb-4 font-bold text-brand-500 shadow-lg shadow-brand-500/30">
                    {step.num}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                  <p className="text-ink-600 text-sm leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why Sell ── */}
        <section className="py-12 sm:py-20 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12 animate-fade-slide-up">
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">Why Sell on ShopSharp</h2>
              <p className="text-ink-500">Built for Nigerian vendors who want to grow.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: 'More buyers',
                  body: 'Get discovered beyond WhatsApp and Instagram — buyers across Nigeria search ShopSharp daily.',
                },
                {
                  title: 'Open 24/7',
                  body: 'Your online store never closes. Customers can browse and message you anytime.',
                },
                {
                  title: 'Simple dashboard',
                  body: 'Manage products, prices and orders from one clean seller dashboard.',
                },
                {
                  title: 'Free for first 50 sellers',
                  body: 'Early sellers join free and get extra visibility in search results.',
                },
              ].map((benefit, i) => (
                <div key={i} className="bg-white rounded-2xl border border-ink-100 p-6 hover:border-brand-200 transition-colors animate-fade-slide-up" style={{ animationDelay: `${300 + i * 100}ms` }}>
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold mb-2">{benefit.title}</h3>
                  <p className="text-ink-600 text-sm leading-relaxed">{benefit.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Social Proof ── */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 bg-ink-50">
          <div className="max-w-2xl mx-auto text-center animate-fade-slide-up">
            <p className="text-lg sm:text-xl text-ink-600 font-semibold italic mb-6">
              &ldquo;Join our early sellers building with ShopSharp &mdash; be among the first and get all the attention.&rdquo;
            </p>
            <div className="flex flex-wrap justify-center gap-4 opacity-60 grayscale">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-16 h-16 rounded-2xl border border-ink-200 bg-white flex items-center justify-center text-ink-400 font-bold text-sm">
                  S{i}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-16 sm:py-24 px-4 sm:px-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-brand-500 rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-4">Ready to grow your sales?</h2>
                <p className="text-brand-100 text-sm sm:text-base mb-8 max-w-md mx-auto leading-relaxed">
                  It takes less than 2 minutes to open your shop and start listing products.
                </p>
                <button
                    onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'seller-signup' })}
                  className="w-full sm:w-auto px-8 py-4 bg-white text-brand-600 font-bold rounded-xl text-lg shadow-xl hover:shadow-brand-500/40 transition-all hover:-translate-y-1 active:scale-95"
                >
                  Become a Seller Now <ArrowRight className="w-4 h-4 ml-1" />
                </button>
                <p className="mt-4 text-sm text-brand-100">
                  Already have a seller account?{' '}
                  <button
                    onClick={() => navigate({ name: 'seller-signin' })}
                    className="font-bold text-white underline underline-offset-2"
                  >
                    Sign in
                  </button>
                </p>
                <p className="mt-4 text-xs text-brand-100/80">Takes less than 2 minutes &bull; Free to join</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-ink-100 py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-ink-500">
          <p>ShopSharp Marketplace &middot; Nigeria</p>
          <div className="flex gap-6">
            <button onClick={() => navigate({ name: 'home' })} className="hover:text-brand-600 transition-colors">Home</button>
            <button onClick={() => navigate({ name: 'browse' })} className="hover:text-brand-600 transition-colors">Browse Products</button>
          </div>
        </div>
      </footer>
    </div>
  );
}