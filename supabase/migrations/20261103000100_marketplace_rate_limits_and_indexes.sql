CREATE INDEX IF NOT EXISTS idx_listings_active_created
  ON public.listings (created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_listings_active_category_created
  ON public.listings (category_id, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_shops_owner_id
  ON public.shops (owner_id);

CREATE INDEX IF NOT EXISTS idx_verification_requests_shop_created
  ON public.verification_requests (shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_rate_limit_buckets (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (actor_id, action, window_start)
);

ALTER TABLE public.user_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_rate_limit_buckets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_user_write_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  action_name text;
  limit_count integer;
  window_seconds integer;
  bucket_start timestamptz;
  updated_count integer;
BEGIN
  IF actor IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'listings' THEN
      action_name := 'listing_create';
      limit_count := 10;
      window_seconds := 3600;
    WHEN 'messages' THEN
      action_name := 'message_send';
      limit_count := 30;
      window_seconds := 60;
    WHEN 'shops' THEN
      action_name := 'shop_create';
      limit_count := 3;
      window_seconds := 86400;
    WHEN 'verification_requests' THEN
      action_name := 'verification_request';
      limit_count := 3;
      window_seconds := 86400;
    ELSE
      RETURN NEW;
  END CASE;

  bucket_start := to_timestamp(
    floor(extract(epoch FROM now()) / window_seconds) * window_seconds
  );

  DELETE FROM public.user_rate_limit_buckets
  WHERE actor_id = actor
    AND action = action_name
    AND window_start < bucket_start - interval '1 day';

  INSERT INTO public.user_rate_limit_buckets (actor_id, action, window_start, request_count)
  VALUES (actor, action_name, bucket_start, 1)
  ON CONFLICT (actor_id, action, window_start)
  DO UPDATE SET request_count = public.user_rate_limit_buckets.request_count + 1
  RETURNING request_count INTO updated_count;

  IF updated_count > limit_count THEN
    RAISE EXCEPTION 'Rate limit exceeded for %; try again later.', action_name
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_user_write_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS limit_listing_creates ON public.listings;
CREATE TRIGGER limit_listing_creates
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_write_rate_limit();

DROP TRIGGER IF EXISTS limit_message_sends ON public.messages;
CREATE TRIGGER limit_message_sends
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_write_rate_limit();

DROP TRIGGER IF EXISTS limit_shop_creates ON public.shops;
CREATE TRIGGER limit_shop_creates
  BEFORE INSERT ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_write_rate_limit();

DROP TRIGGER IF EXISTS limit_verification_requests ON public.verification_requests;
CREATE TRIGGER limit_verification_requests
  BEFORE INSERT ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_write_rate_limit();
