import { useEffect, useState, useRef } from 'react';
import {
  ArrowRight, ShieldCheck, Store, BadgeCheck, Sparkles, Search, X,
  MessageSquare, Truck, HeartHandshake,
} from 'lucide-react';
import { supabase, type Category, type ListingWithCategory } from '@/lib/supabase';
import { getIcon } from '@/lib/icons';
import { buildListingSlug, navigate } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import ListingCard from '@/components/ListingCard';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { ShimmerGrid } from '@/components/Shimmer';
import { buildPostgrestOrFilter, sanitizeSearchTerm } from '@/lib/input';
import { isPromotionSchemaUnavailable } from '@/lib/promotions';

const HERO_WORDS = ['The', 'Easiest', 'Way', 'to', 'Sell', 'Online', 'in', 'Nigeria'];

function FloatingBadge({
  className,
  icon: Icon,
  label,
  sub,
  duration = 4,
  delay = 0,
}: {
  className: string;
  icon: typeof ShieldCheck;
  label: string;
  sub: string;
  duration?: number;
  delay?: number;
}) {
  return (
    <div className={`absolute z-20 anim-fade-up ${className}`} style={{ animationDelay: `${delay}s` }}>
      <div className="float-y flex items-center gap-2.5 bg-white rounded-2xl shadow-xl border border-ink-100 px-4 py-3" style={{ animationDuration: `${duration}s` }}>
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
        </div>
        <div className="text-left">
          <p className="text-sm font-extrabold text-ink-900 leading-tight">{label}</p>
          <p className="text-[11px] text-ink-500 leading-tight">{sub}</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<ListingWithCategory[]>([]);
  const [verifiedShops, setVerifiedShops] = useState<{ id: string; name: string; slug: string; is_verified: boolean; rating: number }[]>([]);
  const [verifiedShopCount, setVerifiedShopCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [liveQuery, setLiveQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ListingWithCategory[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    (async () => {
      const [catRes, shopRes, shopCountRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('shops').select('id, name, slug, is_verified, rating').eq('is_verified', true).limit(4),
        supabase.from('shops').select('id', { count: 'exact', head: true }).eq('is_verified', true),
      ]);
      const queryListings = (withPromotions: boolean) => {
        let query = supabase
          .from('listings')
          .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
          .eq('status', 'active');
        if (withPromotions) {
          query = query.order('promoted_until', { ascending: false, nullsFirst: false });
        }
        return query.order('created_at', { ascending: false }).limit(12);
      };
      let listRes = await queryListings(true);
      if (listRes.error && isPromotionSchemaUnavailable(listRes.error)) {
        console.warn('Promotion schema is not deployed; showing organic homepage results until the database migration is applied.');
        listRes = await queryListings(false);
      }
      if (listRes.error) console.error('Could not load homepage listings.', listRes.error);
      setCategories(catRes.data || []);
      setListings((listRes.data || []) as unknown as ListingWithCategory[]);
      setVerifiedShops(shopRes.data || []);
      if (shopCountRes.error) {
        console.error('Could not count verified shops for the homepage.', shopCountRes.error);
      } else {
        setVerifiedShopCount(shopCountRes.count || 0);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const searchTerm = sanitizeSearchTerm(liveQuery);
    if (!searchTerm) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const querySuggestions = (withPromotions: boolean) => {
        let query = supabase
        .from('listings')
        .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
        .eq('status', 'active')
        .or(buildPostgrestOrFilter(['title', 'description'], searchTerm));
        if (withPromotions) {
          query = query.order('promoted_until', { ascending: false, nullsFirst: false });
        }
        return query.limit(5);
      };
      let result = await querySuggestions(true);
      if (result.error && isPromotionSchemaUnavailable(result.error)) {
        console.warn('Promotion schema is not deployed; showing organic search suggestions until the migration is applied.');
        result = await querySuggestions(false);
      }
      if (result.error) {
        console.error('Could not load product search suggestions.', result.error);
        setSuggestions([]);
        return;
      }
      setSuggestions((result.data || []) as unknown as ListingWithCategory[]);
    }, 250);
  }, [liveQuery]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (q: string) => {
    setShowSuggest(false);
    navigate({ name: 'browse', search: q || undefined });
  };

  return (
    <div>
      {/* ═══════════ HERO ═══════════ */}
      <section className="relative hidden bg-white border-b border-ink-100 overflow-hidden lg:block">
        <AnimatedBackground />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* LEFT — text, search, stats */}
            <div className="max-w-xl mx-auto lg:mx-0 text-center lg:text-left w-full">
              <span className="anim-fade-up inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-sm font-semibold px-4 py-2 rounded-full mb-6 border border-brand-100" style={{ animationDelay: '0.05s' }}>
                <Sparkles className="w-4 h-4" /> Real shops. Real trust. No wahala.
              </span>

              <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold text-ink-900 leading-[1.08] tracking-tight">
                {HERO_WORDS.map((word, i) => (
                  <span key={i} className="anim-fade-up inline-block mr-3" style={{ animationDelay: `${0.15 + i * 0.18}s` }}>
                    {word}
                  </span>
                ))}
              </h1>

              <p className="anim-fade-up mt-5 text-lg text-ink-500 leading-relaxed max-w-lg mx-auto lg:mx-0" style={{ animationDelay: '0.9s' }}>
                Open a free online store, list your products, and connect directly with buyers across Nigeria.
              </p>

              {/* Search bar with glow pulse */}
              <div ref={searchRef} className="relative mt-8 max-w-xl mx-auto lg:mx-0 anim-fade-up" style={{ animationDelay: '1.05s' }}>
                <div className="absolute -inset-1 rounded-2xl bg-brand-400/40 blur-md glow-pulse" />
                <form
                  onSubmit={(e) => { e.preventDefault(); submitSearch(liveQuery); }}
                  className="relative flex items-center bg-white rounded-2xl border-2 border-brand-500"
                >
                  <Search className="absolute left-5 w-5 h-5 text-brand-500" />
                  <input
                    type="text"
                    value={liveQuery}
                    onChange={(e) => { setLiveQuery(e.target.value); setShowSuggest(true); }}
                    onFocus={() => setShowSuggest(true)}
                    placeholder="What are you looking for? Try 'iPhone'..."
                    className="w-full h-14 pr-12 rounded-2xl text-ink-800 placeholder:text-ink-400 text-base focus:outline-none bg-transparent"
                    style={{ paddingLeft: '3.25rem' }}
                  />
                  {liveQuery && (
                    <button type="button" onClick={() => setLiveQuery('')} className="absolute right-4 text-ink-400 hover:text-ink-600">
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </form>

                {showSuggest && suggestions.length > 0 && (
                  <div className="animate-fade-slide-up absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-ink-100 shadow-xl overflow-hidden z-30 text-left">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setShowSuggest(false); navigate({ name: 'listing', id: s.id, slug: buildListingSlug(s.title) }); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 transition-colors text-left border-b border-ink-50 last:border-0"
                      >
                        <div className="w-10 h-10 rounded-lg bg-ink-50 overflow-hidden shrink-0 flex items-center justify-center">
                          {s.image_url ? <img src={s.image_url} alt="" className="w-full h-full object-cover" /> : <Search className="w-4 h-4 text-ink-300" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink-800 truncate">{s.title}</p>
                          <p className="text-xs text-ink-400 truncate">{s.shop?.name || s.location}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-ink-300 shrink-0" />
                      </button>
                    ))}
                    <button
                      onClick={() => submitSearch(liveQuery)}
                      className="w-full py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors"
                    >
                      See all results for "{liveQuery}"
                    </button>
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <div className="anim-fade-up mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-3" style={{ animationDelay: '1.25s' }}>
                <button
                  onClick={() => navigate({ name: 'browse' })}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-brand-500/25 transition-all hover:scale-105 active:scale-95"
                >
                  Start shopping <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'seller-signup' })}
                  className="flex items-center gap-2 bg-white border-2 border-ink-200 text-ink-800 font-bold px-7 py-3.5 rounded-xl hover:border-brand-400 transition-all hover:scale-105 active:scale-95"
                >
                  <Store className="w-5 h-5 text-brand-500" /> Sell Now — Free
                </button>
              </div>

              {/* Stats */}
              <Stagger className="mt-10 grid grid-cols-3 gap-4 sm:gap-6 max-w-lg mx-auto lg:mx-0">
                {[
                  { icon: Store, label: 'Verified Shops', display: verifiedShopCount > 20 ? `${verifiedShopCount}+` : 'Growing' },
                  { icon: ShieldCheck, label: 'Buyer Trust', display: '100%' },
                  { icon: MessageSquare, label: 'Fast Replies', display: 'In-app' },
                ].map((stat) => (
                  <StaggerItem key={stat.label}>
                    <div className="text-center lg:text-left">
                      <stat.icon className="w-5 h-5 text-brand-500 mx-auto lg:mx-0 mb-2" />
                      <p className="text-xl sm:text-2xl font-extrabold text-ink-900">{stat.display}</p>
                      <p className="text-xs sm:text-sm text-ink-500 mt-1">{stat.label}</p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>

            {/* RIGHT — photo in green blob with floating badges */}
            <div className="relative flex items-center justify-center anim-fade-up" style={{ animationDelay: '0.6s' }}>
              {/* Green blob behind */}
              <div className="absolute w-[115%] h-[115%] max-w-[560px] max-h-[560px] rounded-full bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 blob-a blur-[2px]" />
              <div className="absolute w-[125%] h-[125%] max-w-[620px] max-h-[620px] rounded-full bg-brand-200/40 blur-3xl blob-b" />

              {/* Photo */}
              <div className="float-y relative w-full max-w-[420px]" style={{ animationDuration: '6s' }}>
                <div className="rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white aspect-[4/5]">
                  <img
                    src="/shopsharp-yaba-market-hero.png"
                    alt="Nigerian seller celebrating a new order and payment on her phone"
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                </div>
              </div>

              {/* Floating badges */}
              <FloatingBadge className="top-8 -left-2 sm:left-0" icon={BadgeCheck} label="Verified Shop" sub="Admin-approved seller" duration={4} delay={1.4} />
              <FloatingBadge className="bottom-10 -right-2 sm:right-0" icon={MessageSquare} label="Chat Direct" sub="Instant in-app replies" duration={4.8} delay={1.7} />
            </div>
          </div>
        </div>
      </section>

      {/* Phone users land directly in the marketplace. */}
      <section className="lg:hidden bg-white pb-6">
        <div className="border-y border-ink-100 py-3">
          <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-1">
            {categories.map((cat) => {
              const Icon = getIcon(cat.icon);
              return (
                <button
                  key={cat.id}
                  onClick={() => navigate({ name: 'category', slug: cat.slug })}
                  className="flex min-w-[76px] flex-col items-center gap-2 text-center text-xs font-medium text-ink-700"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="max-w-[84px] truncate">{cat.name}</span>
                </button>
              );
            })}
            <button
              onClick={() => navigate({ name: 'category', slug: 'shops' })}
              className="flex min-w-[76px] flex-col items-center gap-2 text-center text-xs font-medium text-ink-700"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Store className="h-5 w-5" />
              </span>
              <span>Shops</span>
            </button>
          </div>
        </div>

        <div className="px-4 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">ShopSharp marketplace</p>
              <h1 className="mt-1 text-xl font-extrabold text-ink-900">Discover products</h1>
            </div>
            <button onClick={() => navigate({ name: 'browse' })} className="text-sm font-semibold text-brand-600">
              See all
            </button>
          </div>

          {loading ? (
            <ShimmerGrid count={6} />
          ) : listings.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-500">
              <Search className="mx-auto mb-3 h-10 w-10 text-ink-200" />
              <p>No products yet. Be the first shop to sell!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="hidden max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:block">
        <Reveal>
          <h2 className="text-3xl font-extrabold text-ink-900 text-center">How ShopSharp works</h2>
          <p className="text-ink-500 text-center mt-2 max-w-xl mx-auto">Three steps between you and a deal you can trust.</p>
        </Reveal>

        <Stagger className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { n: 1, icon: Search, title: 'Find it', desc: 'Search thousands of products from real shops across Nigeria.' },
            { n: 2, icon: MessageSquare, title: 'Chat directly', desc: 'Message the shop in-app — instant replies, no phone number wahala.' },
            { n: 3, icon: ShieldCheck, title: 'Buy with confidence', desc: 'Verified shops, real ratings, and direct deals with no middlemen.' },
          ].map((step) => (
            <StaggerItem key={step.n}>
              <div className="h-full bg-white rounded-3xl border border-ink-100 p-7 relative overflow-hidden group hover:scale-105 hover:shadow-2xl hover:shadow-brand-500/20 transition-all duration-300">
                <span className="absolute -right-3 -top-5 text-[110px] font-extrabold text-brand-50 leading-none select-none group-hover:text-brand-100 transition-colors">
                  {step.n}
                </span>
                <div className="relative z-10 w-[52px] h-[52px] rounded-2xl bg-brand-500 flex items-center justify-center mb-4 group-hover:rotate-12 transition-transform duration-300">
                  <step.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="relative z-10 text-xl font-extrabold text-ink-900">{step.title}</h3>
                <p className="relative z-10 text-ink-500 text-sm mt-2 leading-relaxed">{step.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ═══════════ VERIFIED SHOPS ═══════════ */}
      {verifiedShops.length > 0 && (
        <section className="hidden max-w-7xl mx-auto px-4 sm:px-6 pb-16 lg:block">
          <Reveal><h2 className="text-2xl font-extrabold text-ink-900 mb-6">Verified Shops</h2></Reveal>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {verifiedShops.map((shop) => (
              <StaggerItem key={shop.id}>
                <button
                  onClick={() => navigate({ name: 'shop', slug: shop.slug })}
                  className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border border-ink-100 hover:border-brand-300 hover:shadow-lg hover:scale-[1.03] transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-500 text-white flex items-center justify-center font-extrabold text-lg shrink-0">
                    {shop.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-ink-900 flex items-center gap-1 truncate">
                      {shop.name} <BadgeCheck className="w-4 h-4 text-brand-500 shrink-0" />
                    </p>
                    <p className="text-xs text-ink-500">★ {shop.rating} · Verified shop</p>
                  </div>
                </button>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* ═══════════ FRESH ARRIVALS ═══════════ */}
      <section className="hidden max-w-7xl mx-auto px-4 sm:px-6 pb-16 lg:block">
        <div className="flex items-center justify-between mb-6">
          <Reveal><h2 className="text-2xl font-extrabold text-ink-900">Fresh Arrivals</h2></Reveal>
          <button onClick={() => navigate({ name: 'browse' })} className="text-sm font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
            See all <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <ShimmerGrid count={8} />
        ) : listings.length === 0 ? (
          <Reveal>
            <div className="text-center py-16 text-ink-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-ink-200" />
              <p>No products yet. Be the first shop to sell!</p>
            </div>
          </Reveal>
        ) : (
          <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((listing) => (
              <StaggerItem key={listing.id}>
                <ListingCard listing={listing} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {/* ═══════════ TRUST BAND ═══════════ */}
      <section className="hidden max-w-7xl mx-auto px-4 sm:px-6 pb-16 lg:block">
        <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: ShieldCheck, title: 'Shop verification', desc: 'Admins verify real shops so you always know who you\'re buying from.' },
            { icon: HeartHandshake, title: 'Direct deals', desc: 'Chat and buy direct — no escrow wahala, no hidden middlemen fees.' },
            { icon: Truck, title: 'Nationwide reach', desc: 'From Lagos to Kano, discover shops and products near you.' },
          ].map((item) => (
            <StaggerItem key={item.title}>
              <div className="h-full bg-white rounded-2xl border border-ink-100 p-6 flex items-start gap-4 hover:border-brand-300 hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <p className="font-bold text-ink-900">{item.title}</p>
                  <p className="text-sm text-ink-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ═══════════ CTA BANNER ═══════════ */}
      <section className="hidden max-w-7xl mx-auto px-4 sm:px-6 pb-16 lg:block">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl p-8 sm:p-12 bg-ink-900">
            <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500 blur-3xl blob-a" />
            <div className="absolute -left-20 -bottom-20 w-64 h-64 rounded-full bg-emerald-400 opacity-15 blur-3xl blob-b" />
            <div className="relative z-10 max-w-lg">
              <span className="inline-flex items-center gap-1.5 text-brand-400 text-sm font-semibold mb-3">
                <BadgeCheck className="w-4 h-4" /> For vendors
              </span>
              <h3 className="text-3xl font-extrabold text-white leading-tight">Your shop deserves more than an anonymous listing.</h3>
              <p className="mt-3 text-white/70 text-lg">Open a free shop, get a verified badge, chat with buyers in-app, and grow with monthly plans.</p>
              <button
                onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'seller-signup' })}
                className="mt-6 inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold px-6 py-3.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                Open your free shop <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
