import { Image as ImageIcon, MapPin, Heart, BadgeCheck, Store, ArrowUpRight, MessageCircle, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ListingWithCategory } from '@/lib/supabase';
import { formatPrice, formatTimeAgo } from '@/lib/format';
import { buildListingSlug, navigate, routeToPath } from '@/lib/router';
import { LoyaltyChip } from '@/components/LoyaltyBadge';
import { normalizeNigerianPhone } from '@/lib/phone';
import { trackListingEvent } from '@/lib/promotions';

type Props = {
  listing: ListingWithCategory;
  saved?: boolean;
  onToggleSave?: (id: string) => void;
};

const conditionStyles: Record<string, string> = {
  new: 'bg-brand-50 text-brand-700 border-brand-200',
  used: 'bg-blue-50 text-blue-700 border-blue-200',
  fair: 'bg-amber-50 text-amber-700 border-amber-200',
};

const FRESH_LISTING_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

function isFreshListing(createdAt: string) {
  const createdAtMs = Date.parse(createdAt);
  const ageMs = Date.now() - createdAtMs;
  return Number.isFinite(createdAtMs) && ageMs >= 0 && ageMs < FRESH_LISTING_DURATION_MS;
}

export default function ListingCard({ listing, saved = false, onToggleSave }: Props) {
  const [bump, setBump] = useState(0);
  const [isFresh, setIsFresh] = useState(() => isFreshListing(listing.created_at));
  const whatsappNumber = listing.seller_phone
    ? normalizeNigerianPhone(listing.seller_phone)?.replace('+', '')
    : null;
  const promoted = Boolean(listing.promoted_until && Date.parse(listing.promoted_until) > Date.now());
  const productUrl = `${window.location.origin}${routeToPath({
    name: 'listing',
    id: listing.id,
    slug: buildListingSlug(listing.title),
  })}`;
  const whatsappMessage = [
    `Hi ${listing.shop?.name || listing.seller_name}, I'm interested in "${listing.title}" listed for ${formatPrice(Number(listing.price), listing.currency)} on ShopSharp. Is it still available?`,
    productUrl,
  ].filter(Boolean).join('\n');

  useEffect(() => {
    const createdAtMs = Date.parse(listing.created_at);
    const expiresInMs = createdAtMs + FRESH_LISTING_DURATION_MS - Date.now();
    if (!Number.isFinite(createdAtMs) || expiresInMs <= 0) {
      setIsFresh(false);
      return;
    }

    setIsFresh(true);
    const timeoutId = window.setTimeout(() => setIsFresh(false), expiresInMs);
    return () => window.clearTimeout(timeoutId);
  }, [listing.created_at]);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBump((b) => b + 1);
    onToggleSave?.(listing.id);
  };

  const openListing = () => {
    void trackListingEvent(listing.id, 'click');
    navigate({ name: 'listing', id: listing.id, slug: buildListingSlug(listing.title) });
  };

  return (
    <div
      onClick={openListing}
      className="group bg-white rounded-2xl overflow-hidden border border-ink-100 hover:border-brand-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col transition-all duration-200"
    >
      <div className="relative aspect-[4/3] bg-gradient-to-br from-ink-50 to-ink-100 overflow-hidden">
        {listing.image_url ? (
          <img
            src={listing.image_url}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-ink-200" />
          </div>
        )}

        <span className={`absolute top-3 left-3 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${conditionStyles[listing.condition] || conditionStyles.used}`}>
          {listing.condition === 'fair' ? 'Fairly Used' : listing.condition === 'new' ? 'New' : 'Used'}
        </span>

        {isFresh && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[#008751] px-2 py-1 text-[10px] font-bold text-white shadow-sm">
            <Sparkles className="h-3 w-3" /> Fresh arrival
          </span>
        )}

        {promoted && (
          <span className="absolute left-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-brand-600/90 px-2 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm">
            <Sparkles className="h-3 w-3" /> Sponsored
          </span>
        )}

        {onToggleSave && (
          <button
            key={bump}
            onClick={handleSave}
            className={`absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white ${bump > 0 ? 'heart-pop' : ''}`}
          >
            <Heart className={`w-4 h-4 ${saved ? 'fill-red-500 text-red-500' : 'text-ink-400 hover:text-red-400'}`} />
          </button>
        )}

        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-ink-900/70 to-transparent pt-8 pb-2.5 px-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
          <span className="flex items-center gap-1.5 text-white text-xs font-bold">
            <ArrowUpRight className="w-3.5 h-3.5" /> View product
          </span>
        </div>
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        <p className="text-ink-900 font-extrabold text-lg leading-tight">
          {formatPrice(Number(listing.price), listing.currency)}
        </p>
        <p className="text-ink-700 text-sm font-medium mt-1 line-clamp-2 leading-snug group-hover:text-brand-700 transition-colors">
          {listing.title}
        </p>

        {listing.shop && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate({ name: 'shop', slug: listing.shop!.slug }); }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 w-fit"
          >
            <Store className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px]">{listing.shop.name}</span>
            {listing.shop.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-brand-500 shrink-0" />}
            <LoyaltyChip createdAt={listing.shop.created_at} />
          </button>
        )}

        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-ink-500">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate max-w-[100px]">{listing.location}</span>
          </span>
          <span className="text-xs text-ink-400">{formatTimeAgo(listing.created_at)}</span>
        </div>
        {whatsappNumber ? (
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.stopPropagation();
              void trackListingEvent(listing.id, 'click');
            }}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-2 text-xs font-bold text-white transition hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp seller
          </a>
        ) : (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); openListing(); }}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2 text-xs font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-100"
          >
            View seller details
          </button>
        )}
      </div>
    </div>
  );
}
