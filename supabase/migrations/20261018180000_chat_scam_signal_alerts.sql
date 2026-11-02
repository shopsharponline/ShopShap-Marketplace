CREATE TABLE IF NOT EXISTS public.chat_scam_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_body text NOT NULL,
  signal_codes text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_scam_alerts_status_created
  ON public.chat_scam_alerts(status, created_at DESC);

ALTER TABLE public.chat_scam_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_scam_alerts_admin_select" ON public.chat_scam_alerts;
CREATE POLICY "chat_scam_alerts_admin_select"
  ON public.chat_scam_alerts FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "chat_scam_alerts_admin_update" ON public.chat_scam_alerts;
CREATE POLICY "chat_scam_alerts_admin_update"
  ON public.chat_scam_alerts FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (
    public.is_admin()
    AND status IN ('pending', 'reviewed')
    AND (status <> 'reviewed' OR (reviewed_at IS NOT NULL AND reviewed_by = auth.uid()))
  );

GRANT SELECT, UPDATE ON public.chat_scam_alerts TO authenticated;

CREATE OR REPLACE FUNCTION public.flag_chat_scam_signals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  detected_signals text[] := ARRAY[]::text[];
  alert_id uuid;
BEGIN
  IF (
    NEW.body ~* '(send|share|tell|give|forward|provide|read out).{0,45}(otp|one[- ]time (password|code)|verification code|security code|pin)'
    OR NEW.body ~* '(otp|one[- ]time (password|code)|verification code|security code|pin).{0,45}(send|share|tell|give|forward|provide)'
  ) THEN
    detected_signals := array_append(detected_signals, 'credential_request');
  END IF;

  IF (
    NEW.body ~* '(pay|send|transfer).{0,60}(deposit|upfront|advance|clearance|release|delivery|dispatch) fee'
    OR NEW.body ~* '(deposit|advance|clearance|release|delivery|dispatch) fee.{0,45}(before|first|now|upfront)'
  ) THEN
    detected_signals := array_append(detected_signals, 'advance_payment');
  END IF;

  IF NEW.body ~* '(click|open|visit).{0,45}(link|url).{0,60}(verify|confirm|unlock|payment|account)'
    OR NEW.body ~* '(verify|confirm|unlock).{0,45}(account|payment).{0,60}(link|url)' THEN
    detected_signals := array_append(detected_signals, 'suspicious_verification_link');
  END IF;

  IF cardinality(detected_signals) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.chat_scam_alerts (
    message_id,
    conversation_id,
    sender_id,
    message_body,
    signal_codes
  )
  VALUES (
    NEW.id,
    NEW.conversation_id,
    NEW.sender_id,
    NEW.body,
    detected_signals
  )
  ON CONFLICT (message_id) DO NOTHING
  RETURNING id INTO alert_id;

  IF alert_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT
      p.id,
      'chat_scam_alert',
      'Chat safety alert',
      'A message matched common scam warning patterns. Review the flagged message in the admin panel.',
      '/admin'
    FROM public.profiles p
    WHERE p.is_admin;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flag_chat_scam_signals ON public.messages;
CREATE TRIGGER flag_chat_scam_signals
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.flag_chat_scam_signals();
