CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paystack_ref_unique
  ON public.subscriptions (paystack_ref)
  WHERE paystack_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_paid_subscription(
  p_shop_id uuid,
  p_plan_id uuid,
  p_paystack_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_subscription public.subscriptions%ROWTYPE;
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

  INSERT INTO public.subscriptions (shop_id, plan_id, status, paystack_ref, started_at)
  VALUES (p_shop_id, p_plan_id, 'active', p_paystack_ref, now())
  ON CONFLICT DO NOTHING;

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

  UPDATE public.shops
  SET plan_id = p_plan_id
  WHERE id = p_shop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_paid_subscription(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_subscription(uuid, uuid, text) TO service_role;
