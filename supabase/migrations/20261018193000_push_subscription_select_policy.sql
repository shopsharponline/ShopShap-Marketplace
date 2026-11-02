DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.push_subscriptions TO authenticated;
