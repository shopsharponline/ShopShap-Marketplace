CREATE TABLE IF NOT EXISTS public.notification_push_deliveries (
  notification_id uuid PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.notification_push_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_listing_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  listing_title text;
  owner_id uuid;
BEGIN
  SELECT l.title, s.owner_id
  INTO listing_title, owner_id
  FROM public.listings l
  JOIN public.shops s ON s.id = NEW.shop_id
  WHERE l.id = NEW.listing_id;

  IF owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      owner_id,
      'listing_promoted',
      'Your listing is sponsored',
      COALESCE(listing_title, 'Your listing') || ' is now promoted for 7 days.',
      '/dashboard'
    );
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT
    profile.id,
    'listing_promoted',
    'A listing was promoted',
    COALESCE(listing_title, 'A listing') || ' was promoted for 7 days.',
    '/admin'
  FROM public.profiles profile
  WHERE profile.is_admin = true
    AND profile.id IS DISTINCT FROM owner_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_listing_promotion ON public.listing_promotions;
CREATE TRIGGER notify_on_listing_promotion
AFTER INSERT ON public.listing_promotions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_listing_promotion();
