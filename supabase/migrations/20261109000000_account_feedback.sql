CREATE TABLE IF NOT EXISTS public.account_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_feedback_created
  ON public.account_feedback (created_at DESC);

ALTER TABLE public.account_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_feedback_owner_insert" ON public.account_feedback;
CREATE POLICY "account_feedback_owner_insert"
  ON public.account_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "account_feedback_admin_select" ON public.account_feedback;
CREATE POLICY "account_feedback_admin_select"
  ON public.account_feedback FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.account_feedback FROM anon, authenticated;
GRANT INSERT, SELECT ON public.account_feedback TO authenticated;
