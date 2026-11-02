-- Remove first-signup admin promotion. Create ordinary profiles from Auth signups;
-- privileged admin assignment must be performed by a trusted operator.
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
DROP FUNCTION IF EXISTS public.promote_first_admin();

CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_auth_user();

INSERT INTO public.profiles (id, full_name, phone, is_admin)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data ->> 'full_name', ''),
  u.raw_user_meta_data ->> 'phone',
  false
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.prevent_profile_admin_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'is_admin can only be changed by a trusted server';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_admin_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_admin_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_admin_escalation();

-- Public visitors may browse, but only a shop owner or admin may change listings.
DROP POLICY IF EXISTS "anon_insert_listings" ON public.listings;
DROP POLICY IF EXISTS "anon_update_listings" ON public.listings;
DROP POLICY IF EXISTS "anon_delete_listings" ON public.listings;
DROP POLICY IF EXISTS "listings_owner_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_owner_update" ON public.listings;
DROP POLICY IF EXISTS "listings_owner_delete" ON public.listings;
CREATE POLICY "listings_owner_insert" ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.shops s WHERE s.id = listings.shop_id AND s.owner_id = auth.uid())
  );
CREATE POLICY "listings_owner_update" ON public.listings FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.shops s WHERE s.id = listings.shop_id AND s.owner_id = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.shops s WHERE s.id = listings.shop_id AND s.owner_id = auth.uid())
  );
CREATE POLICY "listings_owner_delete" ON public.listings FOR DELETE
  TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.shops s WHERE s.id = listings.shop_id AND s.owner_id = auth.uid())
  );

-- Category writes are administrative, while reads remain public.
DROP POLICY IF EXISTS "anon_insert_categories" ON public.categories;
DROP POLICY IF EXISTS "anon_update_categories" ON public.categories;
DROP POLICY IF EXISTS "anon_delete_categories" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_update" ON public.categories;
DROP POLICY IF EXISTS "categories_admin_delete" ON public.categories;
CREATE POLICY "categories_admin_insert" ON public.categories FOR INSERT
  TO authenticated WITH CHECK (is_admin());
CREATE POLICY "categories_admin_update" ON public.categories FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "categories_admin_delete" ON public.categories FOR DELETE
  TO authenticated USING (is_admin());

-- Prevent shop owners from granting themselves verification or a paid plan.
CREATE OR REPLACE FUNCTION public.prevent_shop_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated')
     OR COALESCE(auth.role(), '') = 'service_role'
     OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'Shop verification can only be changed by an admin';
  END IF;

  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     AND NOT EXISTS (
       SELECT 1 FROM public.plans p
       WHERE p.id = NEW.plan_id AND p.price_naira = 0
     ) THEN
    RAISE EXCEPTION 'Paid plans can only be activated by a trusted server';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_shop_privilege_changes ON public.shops;
CREATE TRIGGER prevent_shop_privilege_changes
BEFORE UPDATE ON public.shops
FOR EACH ROW EXECUTE FUNCTION public.prevent_shop_privilege_changes();

-- A client may record only a free-plan subscription; paid subscriptions require
-- server-side payment verification.
DROP POLICY IF EXISTS "subs_insert" ON public.subscriptions;
CREATE POLICY "subs_insert" ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin()
    OR (
      paystack_ref IS NULL
      AND EXISTS (
        SELECT 1 FROM public.shops s
        JOIN public.plans p ON p.id = subscriptions.plan_id
        WHERE s.id = subscriptions.shop_id
          AND s.owner_id = auth.uid()
          AND p.price_naira = 0
      )
    )
  );

-- Correct the unconditional allow in the original recently_viewed policy.
DROP POLICY IF EXISTS "rv_insert" ON public.recently_viewed;
CREATE POLICY "rv_insert" ON public.recently_viewed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Buyers may cancel only their own pending orders.
DROP POLICY IF EXISTS "orders_buyer_cancel" ON public.orders;
CREATE POLICY "orders_buyer_cancel" ON public.orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = buyer_id AND status = 'pending')
  WITH CHECK (auth.uid() = buyer_id AND status = 'cancelled');
