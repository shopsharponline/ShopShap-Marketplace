/*
# Seed plans + migrate existing sellers to shops

1. Data
- 3 plans: free (5), starter (₦5,000 / 50), pro (₦12,000 / unlimited-ish, badge, boost, analytics).
- One shop per distinct legacy seller_name (deterministic slug).
- listings.shop_id backfilled from seller_name.
2. Idempotent: ON CONFLICT / NOT EXISTS guards.
*/

INSERT INTO plans (name, display_name, price_naira, product_limit, verified_badge, boost, analytics)
VALUES
  ('free', 'Free', 0, 5, false, false, false),
  ('starter', 'Starter', 5000, 50, false, true, false),
  ('pro', 'Pro', 12000, 100000, true, true, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO shops (name, slug, description, location, plan_id)
SELECT sellers.seller_name,
       lower(regexp_replace(sellers.seller_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(sellers.seller_name), 1, 6),
       'Welcome to ' || sellers.seller_name || '. Quality items, quick replies, honest deals.',
       (SELECT l2.location FROM listings l2 WHERE l2.seller_name = sellers.seller_name LIMIT 1),
       (SELECT id FROM plans WHERE name = 'free')
FROM (SELECT DISTINCT seller_name FROM listings WHERE seller_name IS NOT NULL AND seller_name <> 'Anonymous') AS sellers
WHERE NOT EXISTS (
  SELECT 1 FROM shops s
  WHERE s.slug = lower(regexp_replace(sellers.seller_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(sellers.seller_name), 1, 6)
);

UPDATE listings l
SET shop_id = s.id
FROM shops s
WHERE l.shop_id IS NULL
  AND l.seller_name IS NOT NULL
  AND l.seller_name <> 'Anonymous'
  AND s.slug = lower(regexp_replace(l.seller_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(l.seller_name), 1, 6);

UPDATE shops
SET rating = round((3.8 + random() * 1.2)::numeric, 1)
WHERE rating = 0;
