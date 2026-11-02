-- Keep marketplace photos public, but require authenticated, authorized access
-- for identity documents. Make the old mixed-use bucket private.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-images', 'product-images', true),
  ('nin-verification', 'nin-verification', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

UPDATE storage.buckets
SET public = false
WHERE id = 'uploads';

DROP POLICY IF EXISTS "uploads_public_read" ON storage.objects;
DROP POLICY IF EXISTS "uploads_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "uploads_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "uploads_owner_read" ON storage.objects;
CREATE POLICY "uploads_owner_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "uploads_owner_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "uploads_owner_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_owner_delete" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');
CREATE POLICY "product_images_owner_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "product_images_owner_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "nin_verification_owner_read" ON storage.objects;
DROP POLICY IF EXISTS "nin_verification_authorized_insert" ON storage.objects;
DROP POLICY IF EXISTS "nin_verification_owner_delete" ON storage.objects;
CREATE POLICY "nin_verification_owner_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nin-verification'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin())
  );
CREATE POLICY "nin_verification_authorized_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nin-verification'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "nin_verification_owner_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nin-verification'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_admin())
  );
