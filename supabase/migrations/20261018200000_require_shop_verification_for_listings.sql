DROP POLICY IF EXISTS "listings_require_verified_shop_for_public_read" ON public.listings;
CREATE POLICY "listings_require_verified_shop_for_public_read"
  ON public.listings AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = listings.shop_id
        AND s.owner_id = auth.uid()
    )
    OR (
      listings.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.shops s
        WHERE s.id = listings.shop_id
          AND s.is_verified = true
      )
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_untrusted_shop_verification_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_verified
    AND COALESCE(auth.role(), '') <> 'service_role'
    AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Shop verification can only be granted by an admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_untrusted_shop_verification_insert ON public.shops;
CREATE TRIGGER prevent_untrusted_shop_verification_insert
BEFORE INSERT ON public.shops
FOR EACH ROW
EXECUTE FUNCTION public.prevent_untrusted_shop_verification_insert();

CREATE OR REPLACE FUNCTION public.notify_unverified_shop_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  shop_owner_id uuid;
  shop_is_verified boolean;
BEGIN
  SELECT s.owner_id, s.is_verified
  INTO shop_owner_id, shop_is_verified
  FROM public.shops s
  WHERE s.id = NEW.shop_id;

  IF shop_owner_id IS NOT NULL AND NOT COALESCE(shop_is_verified, false) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT
      shop_owner_id,
      'verification_required',
      'Verify your shop to show your products',
      'Your products stay hidden from buyers until ShopSharp approves your shop verification.',
      '/verification'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = shop_owner_id
        AND n.type = 'verification_required'
        AND n.read = false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_unverified_shop_listing ON public.listings;
CREATE TRIGGER notify_unverified_shop_listing
AFTER INSERT ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.notify_unverified_shop_listing();

INSERT INTO public.notifications (user_id, type, title, body, link)
SELECT DISTINCT
  s.owner_id,
  'verification_required',
  'Verify your shop to show your products',
  'Your products stay hidden from buyers until ShopSharp approves your shop verification.',
  '/verification'
FROM public.shops s
JOIN public.listings l ON l.shop_id = s.id
WHERE s.owner_id IS NOT NULL
  AND s.is_verified = false
  AND l.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = s.owner_id
      AND n.type = 'verification_required'
      AND n.read = false
  );
