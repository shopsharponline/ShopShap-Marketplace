DROP POLICY IF EXISTS "listings_require_verified_shop_for_public_read" ON public.listings;

DROP TRIGGER IF EXISTS notify_unverified_shop_listing ON public.listings;
DROP FUNCTION IF EXISTS public.notify_unverified_shop_listing();

DELETE FROM public.notifications
WHERE type = 'verification_required'
  AND title = 'Verify your shop to show your products'
  AND body = 'Your products stay hidden from buyers until ShopSharp approves your shop verification.';
