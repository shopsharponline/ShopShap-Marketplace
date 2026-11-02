ALTER TABLE public.newsletter_subscribers
ADD COLUMN IF NOT EXISTS consent_at timestamptz;

DROP POLICY IF EXISTS "newsletter_insert" ON public.newsletter_subscribers;

CREATE TABLE IF NOT EXISTS public.newsletter_rate_limits (
  rate_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.newsletter_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_newsletter_rate_limit(
  p_ip_key text,
  p_email_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ip_count integer;
  email_count integer;
BEGIN
  IF p_ip_key IS NULL OR p_email_key IS NULL
     OR length(p_ip_key) < 32 OR length(p_email_key) < 32 THEN
    RETURN false;
  END IF;

  DELETE FROM public.newsletter_rate_limits
  WHERE window_started_at < now() - interval '1 day';

  INSERT INTO public.newsletter_rate_limits AS limits (rate_key, window_started_at, request_count)
  VALUES (p_ip_key, now(), 1)
  ON CONFLICT (rate_key) DO UPDATE
  SET request_count = CASE
        WHEN limits.window_started_at < now() - interval '1 hour' THEN 1
        ELSE limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN limits.window_started_at < now() - interval '1 hour' THEN now()
        ELSE limits.window_started_at
      END
  RETURNING request_count INTO ip_count;

  INSERT INTO public.newsletter_rate_limits AS limits (rate_key, window_started_at, request_count)
  VALUES (p_email_key, now(), 1)
  ON CONFLICT (rate_key) DO UPDATE
  SET request_count = CASE
        WHEN limits.window_started_at < now() - interval '1 hour' THEN 1
        ELSE limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN limits.window_started_at < now() - interval '1 hour' THEN now()
        ELSE limits.window_started_at
      END
  RETURNING request_count INTO email_count;

  RETURN ip_count <= 10 AND email_count <= 3;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_newsletter_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_newsletter_rate_limit(text, text) TO service_role;
