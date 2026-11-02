ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_notifications_consent_at timestamptz;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_verified_phone_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
    SET phone = NEW.phone
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_verified_phone_to_profile ON auth.users;
CREATE TRIGGER sync_verified_phone_to_profile
AFTER UPDATE OF phone, phone_confirmed_at ON auth.users
FOR EACH ROW
WHEN (NEW.phone IS DISTINCT FROM OLD.phone OR NEW.phone_confirmed_at IS DISTINCT FROM OLD.phone_confirmed_at)
EXECUTE FUNCTION public.sync_verified_phone_to_profile();
