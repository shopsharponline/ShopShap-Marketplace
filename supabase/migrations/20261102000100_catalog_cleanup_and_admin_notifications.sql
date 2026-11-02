DELETE FROM public.listings
WHERE title ILIKE '%netflix%'
   OR description ILIKE '%netflix%';

DELETE FROM public.categories
WHERE slug IN ('services', 'shops');

CREATE OR REPLACE FUNCTION public.notify_admin_on_verification_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  shop_name text;
BEGIN
  SELECT name INTO shop_name
  FROM public.shops
  WHERE id = NEW.shop_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT
    profile.id,
    'verification_request',
    'New shop verification request',
    COALESCE(shop_name, 'A shop') || ' submitted a verification request.',
    '/admin'
  FROM public.profiles profile
  WHERE profile.is_admin = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_admin_on_verification_request ON public.verification_requests;
CREATE TRIGGER notify_admin_on_verification_request
AFTER INSERT ON public.verification_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_on_verification_request();
