/*
# Create Jiji marketplace schema (single-tenant, no auth)

1. New Tables
- `categories`: id, name, slug, icon, created_at
- `listings`: id, title, description, price, currency, category_id, location, image_url, condition, seller_name, seller_phone, status, created_at
2. Security
- RLS enabled on both, anon+authenticated full CRUD (public marketplace)
3. Seed data: 12 categories + 10 sample listings
*/

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  icon text NOT NULL DEFAULT 'Tag',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  location text NOT NULL DEFAULT 'Lagos',
  image_url text,
  condition text NOT NULL DEFAULT 'used',
  seller_name text NOT NULL DEFAULT 'Anonymous',
  seller_phone text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_listings" ON listings;
CREATE POLICY "anon_select_listings" ON listings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_listings" ON listings;
CREATE POLICY "anon_insert_listings" ON listings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_listings" ON listings;
CREATE POLICY "anon_update_listings" ON listings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_listings" ON listings;
CREATE POLICY "anon_delete_listings" ON listings FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

INSERT INTO categories (name, slug, icon) VALUES
  ('Vehicles', 'vehicles', 'Car'),
  ('Real Estate', 'real-estate', 'Home'),
  ('Electronics', 'electronics', 'Smartphone'),
  ('Fashion & Beauty', 'fashion', 'Shirt'),
  ('Phones & Tablets', 'phones-tablets', 'Tablet'),
  ('Health & Fitness', 'health', 'HeartPulse'),
  ('Home & Garden', 'home-garden', 'Sofa'),
  ('Sports', 'sports', 'Dumbbell'),
  ('Jobs', 'jobs', 'Briefcase'),
  ('Services', 'services', 'Wrench'),
  ('Food & Agriculture', 'food-agriculture', 'Wheat'),
  ('Pets', 'pets', 'PawPrint')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO listings (title, description, price, category_id, location, condition, seller_name, seller_phone, status)
SELECT v.title, v.description, v.price, c.id, v.location, v.condition, v.seller_name, v.seller_phone, v.status
FROM (VALUES
  ('iPhone 14 Pro Max 256GB', 'Clean UK used iPhone 14 Pro Max, 256GB storage. Comes with original charger and earpods. No faults.', 850000, 'phones-tablets', 'Lekki, Lagos', 'used', 'Chidi Okonkwo', '08031234567', 'active'),
  ('Toyota Camry 2018', 'Tokunbo Toyota Camry 2018, full option. Accident free, clean interior and exterior. AC chilling.', 12500000, 'vehicles', 'Surulere, Lagos', 'used', 'Adebayo Motors', '08029876543', 'active'),
  ('2 Bedroom Flat for Rent', 'Spacious 2 bedroom flat in a serene estate. All rooms ensuite with BQ. POP ceiling, fitted kitchen.', 2500000, 'real-estate', 'Lekki Phase 1, Lagos', 'new', 'Grace Properties', '08055567123', 'active'),
  ('MacBook Pro M2 16GB', 'MacBook Pro with M2 chip, 16GB RAM, 512GB SSD. Lightly used for 6 months. Perfect condition.', 1500000, 'electronics', 'Yaba, Lagos', 'used', 'Tech Hub NG', '07012345678', 'active'),
  ('Nike Air Force 1 White', 'Brand new Nike Air Force 1 in white. Size 42. Never worn. Box included.', 85000, 'fashion', 'Ikeja, Lagos', 'new', 'Sneaker Store', '08123456789', 'active'),
  ('Samsung Galaxy S23 Ultra', 'Samsung Galaxy S23 Ultra 512GB. Phantom Black. Sealed in box with all accessories.', 950000, 'phones-tablets', 'Port Harcourt', 'new', 'Phone Plaza', '08087654321', 'active'),
  ('Honda Civic 2020', 'Nigerian used Honda Civic 2020. Sport trim. Low mileage. Full service history available.', 15000000, 'vehicles', 'Abuja', 'used', 'Auto Deals NG', '07099887766', 'active'),
  ('LG Double Door Fridge', 'LG double door refrigerator 250L. Energy efficient. In excellent working condition.', 320000, 'home-garden', 'Enugu', 'used', 'Home Appliances', '09011223344', 'active'),
  ('Sony WH-1000XM4 Headphones', 'Sony noise cancelling wireless headphones. Industry leading noise cancellation. Used for 3 months.', 180000, 'electronics', 'Victoria Island, Lagos', 'used', 'Audio Mart', '08187654321', 'active'),
  ('3 Bedroom Detached Duplex', 'Newly built 3 bedroom detached duplex with 2 BQ. Located in a gated estate. All rooms ensuite.', 75000000, 'real-estate', 'Banana Island, Lagos', 'new', 'Luxury Homes', '08065544332', 'active')
) AS v(title, description, price, cat_slug, location, condition, seller_name, seller_phone, status)
JOIN categories c ON c.slug = v.cat_slug
ON CONFLICT DO NOTHING;
