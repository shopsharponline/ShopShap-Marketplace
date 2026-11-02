CREATE TABLE IF NOT EXISTS public.marketplace_search_events (
  term text NOT NULL,
  category_slug text NOT NULL DEFAULT '',
  visitor_id uuid NOT NULL,
  hour_bucket timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (term, category_slug, visitor_id, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_search_events_trend
  ON public.marketplace_search_events (term, category_slug, hour_bucket);
CREATE INDEX IF NOT EXISTS idx_marketplace_search_events_cleanup
  ON public.marketplace_search_events (created_at);

ALTER TABLE public.marketplace_search_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_search_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.marketplace_search_ip_limits (
  ip_hash text NOT NULL,
  hour_bucket timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (ip_hash, hour_bucket)
);

ALTER TABLE public.marketplace_search_ip_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_search_ip_limits FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.marketplace_search_trend_alerts (
  term text NOT NULL,
  category_slug text NOT NULL DEFAULT '',
  hour_bucket timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (term, category_slug, hour_bucket)
);

ALTER TABLE public.marketplace_search_trend_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_search_trend_alerts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_marketplace_search(
  p_term text,
  p_category_slug text,
  p_visitor_id uuid,
  p_ip_hash text
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_term text;
  normalized_category text;
  hour_start timestamptz := date_trunc('hour', now());
  v_request_count integer;
  visitor_count integer;
  notification_ids uuid[];
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'A valid search rate-limit key is required';
  END IF;

  INSERT INTO public.marketplace_search_ip_limits (ip_hash, hour_bucket, request_count)
  VALUES (p_ip_hash, hour_start, 1)
  ON CONFLICT (ip_hash, hour_bucket)
  DO UPDATE SET request_count = public.marketplace_search_ip_limits.request_count + 1
  RETURNING request_count INTO v_request_count;

  IF v_request_count > 120 THEN
    RAISE EXCEPTION 'Search tracking rate limit exceeded';
  END IF;

  IF p_term IS NULL
    OR p_term ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    OR p_term ~ '[0-9]{8,}' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  normalized_term := left(
    trim(regexp_replace(lower(p_term), '[^[:alnum:]]+', ' ', 'g')),
    80
  );
  normalized_category := left(
    trim(regexp_replace(lower(COALESCE(p_category_slug, '')), '[^a-z0-9-]+', '', 'g')),
    80
  );

  IF length(normalized_term) < 3 OR p_visitor_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  INSERT INTO public.marketplace_search_events (term, category_slug, visitor_id, hour_bucket)
  VALUES (normalized_term, normalized_category, p_visitor_id, hour_start)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT count(*)::integer
  INTO visitor_count
  FROM public.marketplace_search_events
  WHERE term = normalized_term
    AND category_slug = normalized_category
    AND hour_bucket = hour_start;

  IF visitor_count < 20 THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  INSERT INTO public.marketplace_search_trend_alerts (term, category_slug, hour_bucket)
  VALUES (normalized_term, normalized_category, hour_start)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  WITH inserted_notifications AS (
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT
      profile.id,
      'search_trend',
      'Search demand is rising',
      'At least 20 search sessions looked for "' || normalized_term || '"'
        || CASE WHEN normalized_category <> '' THEN ' in ' || normalized_category ELSE '' END
        || ' within the past hour.',
      '/admin'
    FROM public.profiles profile
    WHERE profile.is_admin = true
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO notification_ids
  FROM inserted_notifications;

  RETURN notification_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.track_marketplace_search(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_marketplace_search(text, text, uuid, text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION public.cleanup_marketplace_search_trend_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.marketplace_search_events
  WHERE created_at < now() - interval '2 days';

  DELETE FROM public.marketplace_search_trend_alerts
  WHERE created_at < now() - interval '2 days';

  DELETE FROM public.marketplace_search_ip_limits
  WHERE hour_bucket < date_trunc('hour', now()) - interval '2 days';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_marketplace_search_trend_data() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'shopsharp-clean-search-trend-data';

SELECT cron.schedule(
  'shopsharp-clean-search-trend-data',
  '17 3 * * *',
  'SELECT public.cleanup_marketplace_search_trend_data();'
);
