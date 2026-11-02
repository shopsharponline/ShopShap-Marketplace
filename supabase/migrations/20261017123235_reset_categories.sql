/*
# Reset categories to the ShopSharp category set

1. Renamed / re-iconed (keeps existing listings attached):
- "Fashion & Beauty" → "Fashion" (icon Shirt)
- "Electronics" → icon changes Smartphone → Monitor
- "Home & Garden" → "Home & Furniture" (slug home-furniture, icon Sofa)
- "Food & Agriculture" → "Groceries" (slug groceries, icon ShoppingBasket)
- "Phones & Tablets" → icon Tablet → Smartphone

2. Removed (no equivalent in the new set):
- Health & Fitness, Jobs, Pets (all had zero listings)
- Real Estate (had 2 listings — those listings are kept but marked
  Uncategorized so no product data is lost; vendors can re-categorize them)

3. Added:
- Beauty (Sparkles), Sneakers (Footprints), Kids (Baby), Shops (Store)

4. Security
- No policy changes; categories keep their existing public-read rules.
*/

UPDATE categories SET name = 'Fashion', icon = 'Shirt' WHERE slug = 'fashion';
UPDATE categories SET icon = 'Monitor' WHERE slug = 'electronics';
UPDATE categories SET name = 'Home & Furniture', slug = 'home-furniture', icon = 'Sofa' WHERE slug = 'home-garden';
UPDATE categories SET name = 'Groceries', slug = 'groceries', icon = 'ShoppingBasket' WHERE slug = 'food-agriculture';
UPDATE categories SET icon = 'Smartphone' WHERE slug = 'phones-tablets';

UPDATE listings SET category_id = NULL WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('real-estate', 'health', 'jobs', 'pets'));
DELETE FROM categories WHERE slug IN ('real-estate', 'health', 'jobs', 'pets');

INSERT INTO categories (name, slug, icon) VALUES
  ('Beauty', 'beauty', 'Sparkles'),
  ('Sneakers', 'sneakers', 'Footprints'),
  ('Kids', 'kids', 'Baby'),
  ('Shops', 'shops', 'Store')
ON CONFLICT (slug) DO NOTHING;
