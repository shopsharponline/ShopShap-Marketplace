CREATE OR REPLACE FUNCTION public.notify_message_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_buyer_id uuid;
  shop_owner_id uuid;
  listing_title text;
  recipient_id uuid;
BEGIN
  SELECT c.buyer_id, s.owner_id, l.title
  INTO conversation_buyer_id, shop_owner_id, listing_title
  FROM public.conversations c
  LEFT JOIN public.shops s ON s.id = c.shop_id
  LEFT JOIN public.listings l ON l.id = c.listing_id
  WHERE c.id = NEW.conversation_id;

  IF NEW.sender_id = conversation_buyer_id THEN
    recipient_id := shop_owner_id;
  ELSIF NEW.sender_id = shop_owner_id THEN
    recipient_id := conversation_buyer_id;
  ELSE
    RETURN NEW;
  END IF;

  IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    recipient_id,
    'new_message',
    'New message',
    CASE
      WHEN listing_title IS NULL THEN 'You received a new message.'
      ELSE 'You received a new message about ' || listing_title || '.'
    END,
    '/messages/' || NEW.conversation_id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_message_recipient ON public.messages;
CREATE TRIGGER notify_message_recipient
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_message_recipient();
