-- Paid boosts are issued transactionally and their results are visible to shoppers.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS boosts_per_month integer NOT NULL DEFAULT 0
  CHECK (boosts_per_month >= 0);

UPDATE public.plans
SET product_limit = 5, boosts_per_month = 0
WHERE name = 'free';

UPDATE public.plans
SET product_limit = 30, boosts_per_month = 2
WHERE name = 'starter';

UPDATE public.plans
SET product_limit = 100, boosts_per_month = 5
WHERE name = 'pro';

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_listings_promoted_until
  ON public.listings (promoted_until DESC)
  WHERE promoted_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.listing_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  click_count bigint NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_promotions_shop_created
  ON public.listing_promotions (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_promotions_listing_active
  ON public.listing_promotions (listing_id, expires_at DESC);

ALTER TABLE public.listing_promotions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.listing_analytics (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  click_count bigint NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  inquiry_count bigint NOT NULL DEFAULT 0 CHECK (inquiry_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_analytics_shop
  ON public.listing_analytics (shop_id);

INSERT INTO public.listing_analytics (listing_id, shop_id)
SELECT l.id, l.shop_id
FROM public.listings l
WHERE l.shop_id IS NOT NULL
ON CONFLICT (listing_id) DO NOTHING;

INSERT INTO public.listing_analytics (listing_id, shop_id, inquiry_count)
SELECT l.id, l.shop_id, count(c.id)
FROM public.listings l
JOIN public.conversations c ON c.listing_id = l.id
WHERE l.shop_id IS NOT NULL
GROUP BY l.id, l.shop_id
ON CONFLICT (listing_id)
DO UPDATE SET inquiry_count = EXCLUDED.inquiry_count;

ALTER TABLE public.listing_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listing_analytics_owner_select" ON public.listing_analytics;
CREATE POLICY "listing_analytics_owner_select"
  ON public.listing_analytics FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = listing_analytics.shop_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "listing_promotions_owner_select" ON public.listing_promotions;
CREATE POLICY "listing_promotions_owner_select"
  ON public.listing_promotions FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.shops s
      WHERE s.id = listing_promotions.shop_id
        AND s.owner_id = auth.uid()
    )
  );

REVOKE ALL ON public.listing_promotions FROM anon, authenticated;
GRANT SELECT ON public.listing_promotions TO authenticated;
REVOKE ALL ON public.listing_analytics FROM anon, authenticated;
GRANT SELECT ON public.listing_analytics TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_direct_listing_promotion_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.promoted_until IS DISTINCT FROM OLD.promoted_until
    AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Listing promotions must be managed through the promotion service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_listing_promotion_change ON public.listings;
CREATE TRIGGER prevent_direct_listing_promotion_change
BEFORE UPDATE OF promoted_until ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_direct_listing_promotion_change();

CREATE OR REPLACE FUNCTION public.promote_listing(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id uuid;
  v_plan_name text;
  v_plan_price integer;
  v_boost_limit integer;
  v_boosts_used integer;
  v_shop_is_verified boolean;
  v_subscription_started_at timestamptz;
  v_subscription_expires_at timestamptz;
  v_promoted_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to promote a listing';
  END IF;

  SELECT l.shop_id
  INTO v_shop_id
  FROM public.listings l
  WHERE l.id = p_listing_id
    AND l.status = 'active'
  FOR UPDATE;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'This active listing could not be found';
  END IF;

  PERFORM 1
  FROM public.shops s
  WHERE s.id = v_shop_id
    AND s.owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only promote a listing from your own shop';
  END IF;

  SELECT p.name, p.price_naira, p.boosts_per_month, s.is_verified,
         sub.started_at, sub.expires_at
  INTO v_plan_name, v_plan_price, v_boost_limit, v_shop_is_verified,
       v_subscription_started_at, v_subscription_expires_at
  FROM public.shops s
  JOIN public.plans p ON p.id = s.plan_id
  LEFT JOIN LATERAL (
    SELECT subscription.started_at, subscription.expires_at
    FROM public.subscriptions subscription
    WHERE subscription.shop_id = s.id
      AND subscription.plan_id = s.plan_id
      AND subscription.status = 'active'
      AND subscription.expires_at > now()
    ORDER BY subscription.expires_at DESC
    LIMIT 1
  ) sub ON true
  WHERE s.id = v_shop_id;

  IF NOT COALESCE(v_shop_is_verified, false) THEN
    RAISE EXCEPTION 'Your shop must be verified before promoting products';
  END IF;

  IF v_plan_name IS NULL
    OR v_plan_price = 0
    OR COALESCE(v_boost_limit, 0) = 0 THEN
    RAISE EXCEPTION 'Upgrade to a paid plan to promote listings';
  END IF;

  IF v_subscription_started_at IS NULL OR v_subscription_expires_at IS NULL THEN
    RAISE EXCEPTION 'Your paid plan has expired. Renew it before promoting listings';
  END IF;

  SELECT l.promoted_until
  INTO v_promoted_until
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_promoted_until > now() THEN
    RAISE EXCEPTION 'This listing is already sponsored';
  END IF;

  SELECT count(*)::integer
  INTO v_boosts_used
  FROM public.listing_promotions lp
  WHERE lp.shop_id = v_shop_id
    AND lp.created_at >= v_subscription_started_at
    AND lp.created_at < v_subscription_expires_at;

  IF v_boosts_used >= v_boost_limit THEN
    RAISE EXCEPTION 'You have used all your monthly boosts';
  END IF;

  UPDATE public.listings
  SET promoted_until = now() + interval '7 days'
  WHERE id = p_listing_id
  RETURNING promoted_until INTO v_promoted_until;

  IF v_promoted_until IS NULL OR v_promoted_until <= now() THEN
    RAISE EXCEPTION 'The subscription promotion period is invalid';
  END IF;

  INSERT INTO public.listing_promotions (listing_id, shop_id, starts_at, expires_at)
  VALUES (p_listing_id, v_shop_id, now(), v_promoted_until);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_listing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.track_listing_event(
  p_listing_id uuid,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_event NOT IN ('view', 'click') THEN
    RAISE EXCEPTION 'Unsupported promotion event';
  END IF;

  INSERT INTO public.listing_analytics (listing_id, shop_id)
  SELECT l.id, l.shop_id
  FROM public.listings l
  WHERE l.id = p_listing_id
    AND l.shop_id IS NOT NULL
    AND l.status = 'active'
  ON CONFLICT (listing_id) DO NOTHING;

  IF p_event = 'view' THEN
    UPDATE public.listing_analytics
    SET view_count = view_count + 1, updated_at = now()
    WHERE listing_id = p_listing_id
      AND EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = p_listing_id AND l.status = 'active'
      );

    UPDATE public.listing_promotions
    SET view_count = view_count + 1
    WHERE listing_id = p_listing_id
      AND starts_at <= now()
      AND expires_at > now();
  ELSE
    UPDATE public.listing_analytics
    SET click_count = click_count + 1, updated_at = now()
    WHERE listing_id = p_listing_id
      AND EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = p_listing_id AND l.status = 'active'
      );

    UPDATE public.listing_promotions
    SET click_count = click_count + 1
    WHERE listing_id = p_listing_id
      AND starts_at <= now()
      AND expires_at > now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.track_listing_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_listing_event(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_listing_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.listing_id IS NOT NULL AND NEW.shop_id IS NOT NULL THEN
    INSERT INTO public.listing_analytics (listing_id, shop_id, inquiry_count)
    SELECT l.id, l.shop_id, 1
    FROM public.listings l
    WHERE l.id = NEW.listing_id
      AND l.shop_id IS NOT NULL
    ON CONFLICT (listing_id)
    DO UPDATE SET inquiry_count = listing_analytics.inquiry_count + 1,
                  updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_listing_inquiry ON public.conversations;
CREATE TRIGGER track_listing_inquiry
AFTER INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.track_listing_inquiry();

CREATE OR REPLACE FUNCTION public.expire_listing_promotions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.listings
  SET promoted_until = NULL
  WHERE promoted_until <= now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_listing_promotions() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'shopsharp-expire-listing-promotions';

SELECT cron.schedule(
  'shopsharp-expire-listing-promotions',
  '*/15 * * * *',
  'SELECT public.expire_listing_promotions();'
);
