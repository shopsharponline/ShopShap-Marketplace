UPDATE public.subscriptions s
SET expires_at = s.started_at + interval '1 month'
FROM public.plans p
WHERE p.id = s.plan_id
  AND p.price_naira > 0
  AND s.status = 'active'
  AND s.expires_at IS NULL;

CREATE OR REPLACE FUNCTION public.expire_paid_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.subscriptions s
  SET status = 'expired'
  FROM public.plans p
  WHERE p.id = s.plan_id
    AND p.price_naira > 0
    AND s.status = 'active'
    AND s.expires_at <= now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  UPDATE public.shops shop
  SET plan_id = (SELECT id FROM public.plans WHERE name = 'free')
  WHERE EXISTS (
    SELECT 1
    FROM public.plans current_plan
    WHERE current_plan.id = shop.plan_id
      AND current_plan.price_naira > 0
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.subscriptions subscription
      JOIN public.plans paid_plan ON paid_plan.id = subscription.plan_id
      WHERE subscription.shop_id = shop.id
        AND subscription.status = 'active'
        AND subscription.expires_at > now()
        AND paid_plan.price_naira > 0
    );

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_paid_subscriptions() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.activate_paid_subscription(
  p_shop_id uuid,
  p_plan_id uuid,
  p_paystack_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_subscription public.subscriptions%ROWTYPE;
  renewal_base timestamptz;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the trusted payment service can activate a paid plan';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shops s
    JOIN public.plans p ON p.id = p_plan_id
    WHERE s.id = p_shop_id
      AND p.price_naira > 0
  ) THEN
    RAISE EXCEPTION 'Paid plan or shop was not found';
  END IF;

  PERFORM 1
  FROM public.shops
  WHERE id = p_shop_id
  FOR UPDATE;

  SELECT *
  INTO existing_subscription
  FROM public.subscriptions
  WHERE paystack_ref = p_paystack_ref
  FOR UPDATE;

  IF FOUND THEN
    IF existing_subscription.shop_id <> p_shop_id
      OR existing_subscription.plan_id <> p_plan_id THEN
      RAISE EXCEPTION 'Payment reference is already associated with another subscription';
    END IF;

    UPDATE public.shops SET plan_id = p_plan_id WHERE id = p_shop_id;
    RETURN;
  END IF;

  SELECT GREATEST(COALESCE(MAX(expires_at), now()), now())
  INTO renewal_base
  FROM public.subscriptions
  WHERE shop_id = p_shop_id
    AND status = 'active'
    AND expires_at > now();

  INSERT INTO public.subscriptions (shop_id, plan_id, status, paystack_ref, started_at, expires_at)
  VALUES (
    p_shop_id,
    p_plan_id,
    'active',
    p_paystack_ref,
    now(),
    renewal_base + interval '1 month'
  )
  ON CONFLICT (paystack_ref) WHERE paystack_ref IS NOT NULL DO NOTHING;

  SELECT *
  INTO existing_subscription
  FROM public.subscriptions
  WHERE paystack_ref = p_paystack_ref
  FOR UPDATE;

  IF NOT FOUND
    OR existing_subscription.shop_id <> p_shop_id
    OR existing_subscription.plan_id <> p_plan_id THEN
    RAISE EXCEPTION 'Payment reference is already associated with another subscription';
  END IF;

  UPDATE public.shops SET plan_id = p_plan_id WHERE id = p_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_paid_subscription(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_subscription(uuid, uuid, text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'shopsharp-expire-paid-subscriptions';

SELECT cron.schedule(
  'shopsharp-expire-paid-subscriptions',
  '0 * * * *',
  'SELECT public.expire_paid_subscriptions();'
);

UPDATE public.notifications
SET link = substring(link FROM 2)
WHERE link LIKE '#/%';
