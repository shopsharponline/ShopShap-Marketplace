ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS buyer_last_read_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS shop_last_read_at timestamptz NOT NULL DEFAULT now();

REVOKE UPDATE (buyer_last_read_at, shop_last_read_at)
  ON public.conversations FROM authenticated;

CREATE OR REPLACE FUNCTION public.protect_conversation_read_markers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated'
    AND (
      NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at
      OR NEW.shop_last_read_at IS DISTINCT FROM OLD.shop_last_read_at
    ) THEN
    RAISE EXCEPTION 'Conversation read status must be updated through the read-status function';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_conversation_read_markers ON public.conversations;
CREATE TRIGGER protect_conversation_read_markers
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.protect_conversation_read_markers();

CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  p_conversation_id uuid,
  p_read_through timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  latest_message_at timestamptz;
  safe_read_at timestamptz;
BEGIN
  SELECT max(m.created_at)
  INTO latest_message_at
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE c.id = p_conversation_id
    AND (
      c.buyer_id = actor_id
      OR EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = c.shop_id AND s.owner_id = actor_id
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation is not available to this account';
  END IF;

  safe_read_at := LEAST(
    COALESCE(p_read_through, latest_message_at, clock_timestamp()),
    COALESCE(latest_message_at, clock_timestamp())
  );

  UPDATE public.conversations c
  SET
    buyer_last_read_at = CASE
      WHEN c.buyer_id = actor_id THEN GREATEST(c.buyer_last_read_at, safe_read_at)
      ELSE c.buyer_last_read_at
    END,
    shop_last_read_at = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = c.shop_id AND s.owner_id = actor_id
      ) THEN GREATEST(c.shop_last_read_at, safe_read_at)
      ELSE c.shop_last_read_at
    END
  WHERE c.id = p_conversation_id
    AND (
      c.buyer_id = actor_id
      OR EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = c.shop_id AND s.owner_id = actor_id
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation is not available to this account';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_shop_chat_count(p_shop_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  unread_count integer;
BEGIN
  IF actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops s WHERE s.id = p_shop_id AND s.owner_id = actor_id
  ) THEN
    RAISE EXCEPTION 'Shop is not available to this account';
  END IF;

  SELECT count(*)::integer
  INTO unread_count
  FROM public.conversations c
  WHERE c.shop_id = p_shop_id
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_id <> actor_id
        AND m.created_at > c.shop_last_read_at
    );

  RETURN unread_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unread_shop_chat_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_shop_chat_count(uuid) TO authenticated;
