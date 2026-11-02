CREATE OR REPLACE FUNCTION public.normalize_notification_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.link LIKE '#/%' THEN
    NEW.link := substring(NEW.link FROM 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_notification_link ON public.notifications;
CREATE TRIGGER normalize_notification_link
BEFORE INSERT OR UPDATE OF link ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.normalize_notification_link();

UPDATE public.notifications
SET link = substring(link FROM 2)
WHERE link LIKE '#/%';
