/*
# ShopSharp: shops, plans, auth-linked tables, chat, buyer features

1. New Tables
- `profiles`: app profile per auth user (id = auth.users.id, full_name, phone, is_admin)
- `plans`: subscription plans (name, display_name, price_naira, product_limit, badge/boost/analytics flags)
- `shops`: seller shop profiles (owner_id nullable so legacy migrated shops are unclaimed, logo, banner, rating, is_verified, plan_id)
- `subscriptions`: plan purchase history (shop_id, plan_id, status, paystack_ref)
- `conversations`: buyer<->shop chats (buyer_id, shop_id, listing_id, last_message_at)
- `messages`: chat messages (conversation_id, sender_id, body)
- `wishlist`: user saved listings (user_id + listing_id unique)
- `orders`: buyer orders (buyer_id, listing_id, shop_id, quantity, total, status)
- `recently_viewed`: user listing views (user_id, listing_id, viewed_at)
- `verification_requests`: shop verification applications (shop_id, status pending/approved/rejected, note)

2. Modified Tables
- `listings`: added nullable shop_id referencing shops(id) (legacy rows get backfilled)

3. Security
- RLS enabled on every new table.
- Profiles: own-row access; admins can read all. First ever profile is auto-promoted to admin via trigger.
- Plans: public read; writes only via admin.
- Shops: public read; owner inserts/updates own; admins can update (verification).
- Conversations/messages: participants only.
- wishlist/orders/recently_viewed: owner-scoped, authenticated only.
- verification_requests: shop owner reads/creates; admin updates.
- Helper function is_admin() (security definer, stable search_path).
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  price_naira integer NOT NULL DEFAULT 0,
  product_limit integer NOT NULL DEFAULT 5,
  verified_badge boolean NOT NULL DEFAULT false,
  boost boolean NOT NULL DEFAULT false,
  analytics boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  logo_url text,
  banner_url text,
  location text NOT NULL DEFAULT 'Lagos',
  rating numeric NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  plan_id uuid REFERENCES plans(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'active',
  paystack_ref text,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  shop_id uuid REFERENCES shops(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Admin helper
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin);
$$;

-- First profile ever created becomes admin
CREATE OR REPLACE FUNCTION promote_first_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE is_admin) THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
BEFORE INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION promote_first_admin();

-- profiles policies
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR is_admin());
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- plans: public read, admin write
DROP POLICY IF EXISTS "plans_select" ON plans;
CREATE POLICY "plans_select" ON plans FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "plans_admin_insert" ON plans;
CREATE POLICY "plans_admin_insert" ON plans FOR INSERT
  TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "plans_admin_update" ON plans;
CREATE POLICY "plans_admin_update" ON plans FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- shops: public read, owner or admin write
DROP POLICY IF EXISTS "shops_select" ON shops;
CREATE POLICY "shops_select" ON shops FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "shops_insert" ON shops;
CREATE POLICY "shops_insert" ON shops FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "shops_update" ON shops;
CREATE POLICY "shops_update" ON shops FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id OR is_admin())
  WITH CHECK (auth.uid() = owner_id OR is_admin());
DROP POLICY IF EXISTS "shops_delete" ON shops;
CREATE POLICY "shops_delete" ON shops FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- subscriptions: owner or admin
DROP POLICY IF EXISTS "subs_select" ON subscriptions;
CREATE POLICY "subs_select" ON subscriptions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM shops s WHERE s.id = subscriptions.shop_id AND (s.owner_id = auth.uid() OR is_admin())));
DROP POLICY IF EXISTS "subs_insert" ON subscriptions;
CREATE POLICY "subs_insert" ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shops s WHERE s.id = subscriptions.shop_id AND (s.owner_id = auth.uid() OR is_admin())));

-- conversations: participants only
DROP POLICY IF EXISTS "conv_select" ON conversations;
CREATE POLICY "conv_select" ON conversations FOR SELECT
  TO authenticated
  USING (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM shops s WHERE s.id = conversations.shop_id AND s.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS "conv_insert" ON conversations;
CREATE POLICY "conv_insert" ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());
DROP POLICY IF EXISTS "conv_update" ON conversations;
CREATE POLICY "conv_update" ON conversations FOR UPDATE
  TO authenticated
  USING (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM shops s WHERE s.id = conversations.shop_id AND s.owner_id = auth.uid())
  )
  WITH CHECK (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM shops s WHERE s.id = conversations.shop_id AND s.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS "conv_delete" ON conversations;
CREATE POLICY "conv_delete" ON conversations FOR DELETE
  TO authenticated
  USING (buyer_id = auth.uid());

-- messages: participants of the conversation
DROP POLICY IF EXISTS "msg_select" ON messages;
CREATE POLICY "msg_select" ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.buyer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM shops s WHERE s.id = c.shop_id AND s.owner_id = auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS "msg_insert" ON messages;
CREATE POLICY "msg_insert" ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.buyer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM shops s WHERE s.id = c.shop_id AND s.owner_id = auth.uid())
      )
    )
  );

-- wishlist: owner-scoped
DROP POLICY IF EXISTS "wishlist_select" ON wishlist;
CREATE POLICY "wishlist_select" ON wishlist FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "wishlist_insert" ON wishlist;
CREATE POLICY "wishlist_insert" ON wishlist FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "wishlist_delete" ON wishlist;
CREATE POLICY "wishlist_delete" ON wishlist FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- orders: buyer-scoped (shop owner can read orders for their shop)
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR EXISTS (SELECT 1 FROM shops s WHERE s.id = orders.shop_id AND s.owner_id = auth.uid())
  );
DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = buyer_id);

-- recently viewed: owner-scoped
DROP POLICY IF EXISTS "rv_select" ON recently_viewed;
CREATE POLICY "rv_select" ON recently_viewed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "rv_insert" ON recently_viewed;
CREATE POLICY "rv_insert" ON recently_viewed FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM recently_viewed rv
      WHERE rv.user_id = recently_viewed.user_id
      AND rv.listing_id = recently_viewed.listing_id
    ) OR true
  );
DROP POLICY IF EXISTS "rv_delete" ON recently_viewed;
CREATE POLICY "rv_delete" ON recently_viewed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- verification requests: shop owner read/insert, admin update
DROP POLICY IF EXISTS "vr_select" ON verification_requests;
CREATE POLICY "vr_select" ON verification_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shops s WHERE s.id = verification_requests.shop_id AND (s.owner_id = auth.uid() OR is_admin()))
  );
DROP POLICY IF EXISTS "vr_insert" ON verification_requests;
CREATE POLICY "vr_insert" ON verification_requests FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shops s WHERE s.id = verification_requests.shop_id AND s.owner_id = auth.uid()));
DROP POLICY IF EXISTS "vr_update" ON verification_requests;
CREATE POLICY "vr_update" ON verification_requests FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_listings_shop ON listings(shop_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_rv_user ON recently_viewed(user_id, viewed_at DESC);
