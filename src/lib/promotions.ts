import { supabase } from '@/lib/supabase';

let promotionSchemaUnavailable = false;

export function isPromotionSchemaUnavailable(error: { code?: string; message?: string }) {
  return ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code || '')
    || ['promoted_until', 'listing_promotions', 'listing_analytics', 'boosts_per_month', 'promote_listing', 'track_listing_event']
      .some((name) => error.message?.includes(name));
}

export async function trackListingEvent(listingId: string, event: 'view' | 'click') {
  if (promotionSchemaUnavailable) return;

  const { error } = await supabase.rpc('track_listing_event', {
    p_listing_id: listingId,
    p_event: event,
  });

  if (error) {
    if (isPromotionSchemaUnavailable(error)) {
      promotionSchemaUnavailable = true;
      console.warn('Listing analytics are unavailable until the promotion database update is applied.');
    } else {
      console.error(`Could not record listing ${event}.`, error);
    }
  }
}
