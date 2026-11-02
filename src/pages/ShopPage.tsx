import { useEffect, useState } from 'react';
import { BadgeCheck, MapPin, Star, MessageCircle, Store as StoreIcon } from 'lucide-react';
import { supabase, type ListingWithCategory } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import ListingCard from '@/components/ListingCard';
import { LoyaltyChip } from '@/components/LoyaltyBadge';
import SeoHead from '@/components/SeoHead';
import { isPromotionSchemaUnavailable } from '@/lib/promotions';

type ShopFull = {
  id: string;
  owner_id: string | null;
  name: string;
  slug: string;
  description: string;
  location: string;
  rating: number;
  is_verified: boolean;
  created_at: string;
  logo_url: string | null;
  banner_url: string | null;
  plan: { name: string } | null;
};

export default function ShopPage({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [shop, setShop] = useState<ShopFull | null>(null);
  const [listings, setListings] = useState<ListingWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    window.scrollTo(0, 0);
    (async () => {
      const { data: shopData } = await supabase.from('shops').select('*, plan:plans(name)').eq('slug', slug).maybeSingle();
      if (!shopData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setShop(shopData as ShopFull);
      const queryListings = (withPromotions: boolean) => {
        let query = supabase
          .from('listings')
          .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified)')
          .eq('shop_id', (shopData as ShopFull).id)
          .eq('status', 'active');
        if (withPromotions) {
          query = query.order('promoted_until', { ascending: false, nullsFirst: false });
        }
        return query.order('created_at', { ascending: false }).limit(24);
      };
      let listingsResult = await queryListings(true);
      if (listingsResult.error && isPromotionSchemaUnavailable(listingsResult.error)) {
        console.warn('Promotion schema is not deployed; showing organic shop listings until the migration is applied.');
        listingsResult = await queryListings(false);
      }
      if (listingsResult.error) console.error('Could not load products for this shop.', listingsResult.error);
      setListings((listingsResult.data || []) as unknown as ListingWithCategory[]);
      setLoading(false);
    })();
  }, [slug]);

  const startChat = async () => {
    if (!user) {
      navigate({ name: 'signin' });
      return;
    }
    if (!shop) return;
    setChatBusy(true);
    // Find or create a general conversation with this shop
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('buyer_id', user.id)
      .eq('shop_id', shop.id)
      .is('listing_id', null)
      .maybeSingle();

    let convId = existing?.id;
    if (!convId) {
      const { data: conv } = await supabase
        .from('conversations')
        .insert({ buyer_id: user.id, shop_id: shop.id })
        .select('id')
        .single();
      convId = conv?.id;
      if (convId) {
        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_id: user.id,
          body: `Hello ${shop.name}! I found your shop on ShopSharp and I have a question.`,
        });
      }
    }
    setChatBusy(false);
    if (convId) navigate({ name: 'messages-chat', id: convId });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-ink-50 rounded-3xl animate-pulse h-48 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-ink-50 rounded-2xl animate-pulse aspect-[3/4]" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !shop) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <StoreIcon className="w-14 h-14 mx-auto mb-4 text-ink-200" />
        <p className="text-2xl font-bold text-ink-900 mb-2">Shop not found</p>
        <button onClick={() => navigate({ name: 'browse' })} className="mt-4 bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">
          Browse products
        </button>
      </div>
    );
  }

  const isOwnShop = user && shop.owner_id === user.id;
  const isProStorefront = shop.plan?.name === 'pro';
  const shopDescription = shop.description || `Shop products from ${shop.name} on ShopSharp, Nigeria's marketplace of local stores.`;

  return (
    <>
    <SeoHead metadata={{
      title: `${shop.name} | ShopSharp Nigeria`,
      description: shopDescription.slice(0, 160),
      canonicalPath: `/shop/${encodeURIComponent(shop.slug)}`,
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Store',
        name: shop.name,
        description: shopDescription,
        url: `https://shopsharp.com.ng/shop/${encodeURIComponent(shop.slug)}`,
        ...(shop.location ? { areaServed: { '@type': 'Place', name: shop.location } } : {}),
      },
    }} />
    <div>
      {/* Shop banner */}
      <div className={`relative overflow-hidden ${isProStorefront ? 'min-h-[350px] bg-gradient-to-br from-[#062d1d] via-[#0d422b] to-[#092d20]' : 'bg-ink-900'}`}>
        {isProStorefront && shop.banner_url && (
          <img
            src={shop.banner_url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-35"
          />
        )}
        {isProStorefront && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-[#062d1d]/95 via-[#0d422b]/75 to-[#092d20]/50" />
            <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full border border-white/10" />
            <div className="absolute -right-8 -top-12 h-56 w-56 rounded-full border border-amber-300/15" />
          </>
        )}
        {shop.is_verified && <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500 opacity-25 blur-3xl" />}
        <div className={`relative z-10 mx-auto max-w-7xl px-4 sm:px-6 ${isProStorefront ? 'pb-24 pt-12 sm:pt-16' : 'py-12'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className={`flex shrink-0 items-center justify-center overflow-hidden bg-brand-500 font-extrabold text-white shadow-xl ${
              isProStorefront ? 'h-24 w-24 rounded-[1.75rem] border-2 border-amber-200/70 text-4xl ring-8 ring-white/10' : 'h-20 w-20 rounded-2xl text-3xl'
            }`}>
              {shop.logo_url
                ? <img src={shop.logo_url} alt={`${shop.name} logo`} className="h-full w-full object-cover" />
                : shop.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-extrabold text-white">{shop.name}</h1>
                {isProStorefront && (
                  <span className="rounded-full border border-amber-200/40 bg-amber-200/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-100">
                    Signature store
                  </span>
                )}
                {shop.is_verified && (
                  <span className="inline-flex items-center gap-1 bg-brand-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    <BadgeCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
                <LoyaltyChip createdAt={shop.created_at} dark />
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-white/75 flex-wrap">
                <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400" /> {shop.rating} rating</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {shop.location}</span>
                <span>Since {new Date(shop.created_at).getFullYear()}</span>
                <span>· {listings.length} products</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isOwnShop && (
                <button
                  onClick={startChat}
                  disabled={chatBusy}
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-3 rounded-xl transition-colors disabled:opacity-60"
                >
                  <MessageCircle className="w-4 h-4" /> {chatBusy ? 'Opening...' : 'Chat Shop'}
                </button>
              )}
              {isOwnShop && (
                <button
                  onClick={() => navigate({ name: 'dashboard' })}
                  className="flex items-center gap-2 bg-white text-ink-900 font-bold px-5 py-3 rounded-xl hover:bg-ink-100 transition-colors"
                >
                  Manage shop
                </button>
              )}
            </div>
          </div>
          {shop.description && !isProStorefront && (
            <p className="mt-5 text-white/70 max-w-2xl leading-relaxed">{shop.description}</p>
          )}
          {shop.is_verified && !isProStorefront && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5">
              <BadgeCheck className="h-4 w-4 text-brand-400" />
              <span className="text-sm text-white/80">Identity verified by ShopSharp — buy with confidence.</span>
            </div>
          )}
        </div>
      </div>

      {isProStorefront && (
        <div className="relative z-10 mx-auto -mt-14 max-w-7xl px-4 sm:px-6">
          <div className="grid gap-5 rounded-3xl border border-brand-100 bg-white p-5 shadow-[0_24px_70px_rgba(5,46,29,0.16)] sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-700">A little about this store</p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-700">{shopDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
              {shop.is_verified && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-800">
                  <BadgeCheck className="h-4 w-4 text-brand-600" /> Identity verified
                </span>
              )}
              <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> {shop.rating} shop rating
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand-700">{isProStorefront ? 'Curated collection' : 'Shop catalogue'}</p>
            <h2 className="text-2xl font-extrabold text-ink-900">Products from this shop</h2>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800">{listings.length} items</span>
        </div>
        {listings.length === 0 ? (
          <div className="text-center py-16">
            <StoreIcon className="w-12 h-12 mx-auto mb-3 text-ink-200" />
            <p className="text-ink-500">This shop has no active products yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
