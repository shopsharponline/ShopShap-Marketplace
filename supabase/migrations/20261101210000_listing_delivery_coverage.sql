ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS delivery_coverage text NOT NULL DEFAULT 'nationwide';

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_delivery_coverage_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_delivery_coverage_check
  CHECK (delivery_coverage IN ('nationwide', 'pickup'));

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png']
WHERE id = 'product-images';
