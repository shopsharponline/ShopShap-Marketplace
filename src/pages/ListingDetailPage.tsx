import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, MapPin, MessageCircle, ShieldCheck, Image as ImageIcon,
  Tag, Clock, Share2, Heart, BadgeCheck, Star, ArrowRight, Copy, Truck,
} from 'lucide-react';
import { supabase, type ListingWithCategory, type Listing } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatPrice, formatTimeAgo } from '@/lib/format';
import { buildListingSlug, navigate, routeToPath } from '@/lib/router';
import ListingCard from '@/components/ListingCard';
import { LoyaltyChip } from '@/components/LoyaltyBadge';
import SeoHead from '@/components/SeoHead';
import { isPromotionSchemaUnavailable, trackListingEvent } from '@/lib/promotions';

const conditionLabels: Record<string, string> = { new: 'New', used: 'Used', fair: 'Fairly Used' };

type ShopFull = { id: string; name: string; slug: string; is_verified: boolean; rating: number; location: string; logo_url: string | null; banner_url: string | null; description: string; created_at: string };

function getWhatsAppNumber(phone: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? `234${digits}` : null;
}

export default function ListingDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const [listing, setListing] = useState<ListingWithCategory | null>(null);
  const [shop, setShop] = useState<ShopFull | null>(null);
  const [related, setRelated] = useState<ListingWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [shopProductCount, setShopProductCount] = useState(0);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const trackedPromotionViews = useRef(new Set<string>());

  const handleShare = async () => {
    if (!listing) return;
    const shareUrl = `${window.location.origin}${routeToPath({ name: 'listing', id: listing.id, slug: buildListingSlug(listing.title) })}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: listing.title,
          text: `Check out "${listing.title}" on ShopSharp`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage('Link copied!');
        setTimeout(() => setShareMessage(null), 2000);
      }
    } catch {
      // Fallback: copy to clipboard if Web Share API fails
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage('Link copied!');
        setTimeout(() => setShareMessage(null), 2000);
      } catch {
        setShareMessage('Could not copy link.');
        setTimeout(() => setShareMessage(null), 2000);
      }
    }
  };

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setChatError(null);
    setActiveImageIndex(0);
    window.scrollTo(0, 0);

    (async () => {
      const { data } = await supabase
        .from('listings')
        .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
        .eq('id', id)
        .maybeSingle();

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const l = data as unknown as ListingWithCategory;
      setListing(l);

      // Track recently viewed
      if (user) {
        await supabase.from('recently_viewed').upsert(
          { user_id: user.id, listing_id: id, viewed_at: new Date().toISOString() },
          { onConflict: 'user_id,listing_id' }
        );
        const { data: wl } = await supabase.from('wishlist').select('id').eq('user_id', user.id).eq('listing_id', id).maybeSingle();
        setSaved(!!wl);
      }

      // Load full shop profile
      if (l.shop) {
        const { data: shopData } = await supabase.from('shops').select('*').eq('id', l.shop.id).maybeSingle();
        if (shopData) {
          setShop(shopData as ShopFull);
          const { count } = await supabase.from('listings').select('*', { count: 'exact', head: true }).eq('shop_id', l.shop.id).eq('status', 'active');
          setShopProductCount(count || 0);
        }
      }

      // Prefer products in the same category, then fill from the same shop.
      const currentListing = data as Listing;
      let relatedItems: ListingWithCategory[] = [];
      if (currentListing.category_id) {
        const categoryQuery = (withPromotions: boolean) => {
          let query = supabase
            .from('listings')
            .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
            .eq('status', 'active')
            .eq('category_id', currentListing.category_id)
            .neq('id', id);
          if (withPromotions) {
            query = query.order('promoted_until', { ascending: false, nullsFirst: false });
          }
          return query.order('created_at', { ascending: false }).limit(4);
        };
        let categoryResult = await categoryQuery(true);
        if (categoryResult.error && isPromotionSchemaUnavailable(categoryResult.error)) {
          categoryResult = await categoryQuery(false);
        }
        if (categoryResult.error) console.error('Could not load related category products.', categoryResult.error);
        const categoryItems = categoryResult.data;
        relatedItems = (categoryItems || []) as unknown as ListingWithCategory[];
      }

      if (relatedItems.length < 4 && currentListing.shop_id) {
        const shopQuery = (withPromotions: boolean) => {
          let query = supabase
            .from('listings')
            .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
            .eq('status', 'active')
            .eq('shop_id', currentListing.shop_id)
            .neq('id', id);
          if (withPromotions) {
            query = query.order('promoted_until', { ascending: false, nullsFirst: false });
          }
          return query.order('created_at', { ascending: false }).limit(8);
        };
        let shopResult = await shopQuery(true);
        if (shopResult.error && isPromotionSchemaUnavailable(shopResult.error)) {
          shopResult = await shopQuery(false);
        }
        if (shopResult.error) console.error('Could not load related products from the seller.', shopResult.error);
        const shopItems = shopResult.data;
        const existingIds = new Set(relatedItems.map((item) => item.id));
        relatedItems = [
          ...relatedItems,
          ...((shopItems || []) as unknown as ListingWithCategory[])
            .filter((item) => !existingIds.has(item.id))
            .slice(0, 4 - relatedItems.length),
        ];
      }
      setRelated(relatedItems);
      setLoading(false);
    })();
  }, [id, user]);

  useEffect(() => {
    if (
      listing
      && !trackedPromotionViews.current.has(listing.id)
    ) {
      trackedPromotionViews.current.add(listing.id);
      void trackListingEvent(listing.id, 'view');
    }
  }, [listing]);

  const toggleWishlist = async () => {
    if (!user) {
      navigate({ name: 'signin' });
      return;
    }
    if (saved) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('listing_id', id);
      setSaved(false);
    } else {
      await supabase.from('wishlist').insert({ user_id: user.id, listing_id: id });
      setSaved(true);
    }
  };

  const startChat = async () => {
    if (!user) {
      navigate({ name: 'signin' });
      return;
    }
    if (!listing?.shop) return;
    setChatBusy(true);
    setChatError(null);

    // Reuse existing conversation with this shop about this listing if any
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('buyer_id', user.id)
      .eq('shop_id', listing.shop.id)
      .eq('listing_id', listing.id)
      .maybeSingle();

    let convId = existing?.id;

    if (!convId) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ buyer_id: user.id, shop_id: listing.shop.id, listing_id: listing.id })
        .select('id')
        .single();
      if (convErr || !conv) {
        setChatBusy(false);
        setChatError('Could not start the chat. Please try again.');
        return;
      }
      convId = conv.id;
      const { data: initialMessage, error: initialMessageError } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        body: `Hi, I'm interested in "${listing.title}" (${formatPrice(Number(listing.price), listing.currency)}). Is it still available?`,
      }).select('id').single();
      if (initialMessageError) {
        console.error('Could not send the initial chat message.', initialMessageError);
        const { error: cleanupError } = await supabase
          .from('conversations')
          .delete()
          .eq('id', convId)
          .eq('buyer_id', user.id);
        if (cleanupError) {
          console.error('Could not remove the empty conversation after message failure.', cleanupError);
        }
        setChatBusy(false);
        setChatError('The chat could not be started. Please try again.');
        return;
      } else {
        void supabase.functions.invoke('message-push', {
          body: { messageId: initialMessage.id },
        }).then(({ error: pushError }) => {
          if (pushError) console.error('Message was sent, but phone notification could not be requested.', pushError);
        }).catch((error: unknown) => {
          console.error('Message was sent, but phone notification could not be requested.', error);
        });
      }
    }

    setChatBusy(false);
    navigate({ name: 'messages-chat', id: convId });
  };

  const whatsAppNumber = getWhatsAppNumber(listing?.seller_phone ?? null);
  const whatsAppMessage = listing
    ? [
      `Hi, I'm interested in "${listing.title}" listed for ${formatPrice(Number(listing.price), listing.currency)}. Is it still available?`,
      listing.image_url || listing.images?.[0],
    ].filter(Boolean).join('\n')
    : '';
  const whatsAppUrl = whatsAppNumber
    ? `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(whatsAppMessage)}`
    : null;
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-ink-50 rounded-2xl animate-pulse h-96 mb-6" />
        <div className="space-y-3">
          <div className="h-8 bg-ink-50 rounded animate-pulse w-1/3" />
          <div className="h-6 bg-ink-50 rounded animate-pulse w-1/2" />
          <div className="h-32 bg-ink-50 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-bold text-ink-900 mb-2">Product not found</p>
        <p className="text-ink-500 mb-6">This item may have been removed.</p>
        <button onClick={() => navigate({ name: 'browse' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">
          Back to browsing
        </button>
      </div>
    );
  }

  const galleryImages = Array.from(new Set([
    ...(listing.images || []),
    listing.image_url,
  ].filter((image): image is string => Boolean(image))));
  const activeImage = galleryImages[activeImageIndex];

  return (
    <>
    <SeoHead metadata={{
      title: `${listing.title} | ShopSharp`,
      description: listing.description.slice(0, 160),
      canonicalPath: routeToPath({ name: 'listing', id: listing.id, slug: buildListingSlug(listing.title) }),
      image: activeImage || undefined,
      type: 'product',
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: listing.title,
        description: listing.description,
        ...(galleryImages.length > 0 ? { image: galleryImages } : {}),
        url: `https://shopsharp.com.ng${routeToPath({ name: 'listing', id: listing.id, slug: buildListingSlug(listing.title) })}`,
        ...(listing.category ? { category: listing.category.name } : {}),
        ...(listing.shop ? { brand: { '@type': 'Brand', name: listing.shop.name } } : {}),
        ...(Number.isFinite(Number(listing.price)) && Number(listing.price) >= 0
          ? { offers: { '@type': 'Offer', price: Number(listing.price), priceCurrency: listing.currency || 'NGN', url: `https://shopsharp.com.ng${routeToPath({ name: 'listing', id: listing.id, slug: buildListingSlug(listing.title) })}` } }
          : {}),
      },
    }} />
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-gradient-to-br from-ink-50 to-ink-100 border border-ink-100">
            {activeImage ? (
              <img src={activeImage} alt={`${listing.title}, photo ${activeImageIndex + 1}`} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-20 h-20 text-ink-200" />
              </div>
            )}
            {galleryImages.length > 1 && (
              <span className="absolute bottom-4 left-4 rounded-full bg-ink-900/75 px-3 py-1 text-xs font-semibold text-white">
                {activeImageIndex + 1} / {galleryImages.length}
              </span>
            )}
            <button
              onClick={toggleWishlist}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white"
            >
              <Heart className={`w-5 h-5 ${saved ? 'fill-red-500 text-red-500' : 'text-ink-500'}`} />
            </button>
          </div>
          {galleryImages.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2" aria-label="Product photos">
              {galleryImages.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Show photo ${index + 1} of ${galleryImages.length}`}
                  aria-pressed={activeImageIndex === index}
                  className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                    activeImageIndex === index ? 'border-brand-500' : 'border-ink-100 hover:border-brand-300'
                  }`}
                >
                  <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 bg-white rounded-2xl border border-ink-100 p-6">
            <h2 className="font-bold text-lg text-ink-900 mb-4">Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-ink-500 flex items-center gap-1.5"><Tag className="w-4 h-4" /> Category</span>
                <p className="font-semibold text-ink-800 mt-1">{listing.category?.name || 'Uncategorized'}</p>
              </div>
              <div>
                <span className="text-ink-500 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Condition</span>
                <p className="font-semibold text-ink-800 mt-1">{conditionLabels[listing.condition] || listing.condition}</p>
              </div>
              <div>
                <span className="text-ink-500 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Location</span>
                <p className="font-semibold text-ink-800 mt-1">{listing.location}</p>
              </div>
              <div>
                <span className="text-ink-500 flex items-center gap-1.5"><Truck className="w-4 h-4" /> Delivery</span>
                <p className="font-semibold text-ink-800 mt-1">
                  {listing.delivery_coverage === 'pickup' ? 'Local pickup only' : 'Nationwide'}
                </p>
              </div>
              <div>
                <span className="text-ink-500 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Posted</span>
                <p className="font-semibold text-ink-800 mt-1">{formatTimeAgo(listing.created_at)}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-2xl border border-ink-100 p-6">
            <h2 className="font-bold text-lg text-ink-900 mb-3">Description</h2>
            <p className="text-ink-700 leading-relaxed whitespace-pre-line">{listing.description}</p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2">
          <div className="sticky top-32 space-y-4">
            <div className="bg-white rounded-2xl border border-ink-100 p-6 shadow-sm">
              <p className="text-3xl font-extrabold text-ink-900">{formatPrice(Number(listing.price), listing.currency)}</p>
              <h1 className="text-xl font-bold text-ink-900 mt-2 leading-snug">{listing.title}</h1>
              <div className="flex items-center gap-1.5 text-sm text-ink-500 mt-2">
                <MapPin className="w-4 h-4" /> {listing.location}
              </div>

              <div className="mt-5 space-y-3">
                <button
                  onClick={startChat}
                  disabled={chatBusy}
                  className="flex items-center justify-center gap-2 w-full bg-brand-500 text-white font-bold py-3.5 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-60"
                >
                  <MessageCircle className="w-5 h-5" /> {chatBusy ? 'Starting chat...' : 'Chat Seller'}
                </button>
                <p className="text-xs leading-relaxed text-ink-500">
                 New in-app messages are automatically checked for common scam signals. Suspicious messages are not blocked, but may be reviewed by a ShopSharp admin.
                </p>
                {whatsAppUrl ? (
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" /> WhatsApp Seller
                  </a>
                ) : (
                  <p className="text-sm text-ink-500 text-center">
                    Seller has not provided a WhatsApp number.
                  </p>
                )}
                <button onClick={handleShare} className="flex items-center justify-center gap-2 w-full bg-ink-50 border border-ink-200 text-ink-600 font-semibold py-3 rounded-xl hover:bg-ink-100 transition-colors">
                  {shareMessage ? <Copy className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                  {shareMessage ? 'Copied!' : 'Share'}
                </button>
                {shareMessage && (
                  <p role="status" className="text-sm text-brand-700 mt-3 text-center" aria-live="polite">
                    {shareMessage}
                  </p>
                )}
              </div>

              {chatError && <p className="text-sm text-red-600 mt-3">{chatError}</p>}
            </div>

            {/* Shop card — ShopSharp trust model */}
            {shop && (
              <div className="bg-white rounded-2xl border border-ink-100 p-5">
                <h3 className="font-bold text-ink-900 mb-3 text-sm uppercase tracking-wide text-ink-500">Sold by</h3>
                <button
                  onClick={() => navigate({ name: 'shop', slug: shop.slug })}
                  className="w-full flex items-center gap-3 hover:bg-ink-50 rounded-xl p-2 -m-2 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-500 text-white flex items-center justify-center font-extrabold text-lg shrink-0">
                    {shop.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink-900 flex items-center gap-1 truncate">
                      {shop.name}
                      {shop.is_verified && <BadgeCheck className="w-4 h-4 text-brand-500 shrink-0" />}
                      <LoyaltyChip createdAt={shop.created_at} />
                    </p>
                    <p className="text-xs text-ink-500 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {shop.rating} · {shopProductCount} products
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-300" />
                </button>
                {shop.is_verified && (
                  <div className="mt-3 flex items-start gap-2 bg-brand-50 border border-brand-100 rounded-xl p-3">
                    <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-brand-800">Verified shop — identity confirmed by ShopSharp.</p>
                  </div>
                )}
              </div>
            )}

            {/* Safety tip */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 leading-relaxed">
                  Chat in the app, meet in a safe public place, and inspect before you pay. Never pay in advance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-ink-900 mb-5">Similar items</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {related.map((item) => (
              <ListingCard key={item.id} listing={item} />
            ))}
          </div>
        </section>
      )}
    </div>
    </>
  );
}
