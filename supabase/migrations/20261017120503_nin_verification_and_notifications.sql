/*
# NIN verification, notifications, multi-photo listings, and file storage

1. New Tables
- `notifications`: in-app notifications per user (id, user_id, type, title, body, link, read, created_at).
  Used to tell vendors to "Apply for verification" and to deliver approve/reject outcomes.

2. Modified Tables
- `verification_requests`: added `nin_number` (the vendor's National Identification Number),
  `nin_image_url` (uploaded photo of the NIN slip), and `rejection_reason` (admin's reason when rejecting).
- `listings`: added `images` (text array of photo URLs, up to 8). The existing `image_url`
  stays as the cover photo and is kept in sync with the first image.

3. Storage
- Created a public storage bucket `uploads` for product photos and NIN slip images.
- Authenticated users can upload/delete only inside their own folder (`uploads/<user-id>/...`).
- Anyone (anon + authenticated) can read uploaded files, since product photos are public.

4. Security
- RLS enabled on `notifications`.
- Notifications: each user reads/updates/deletes only their own; inserts allowed for the owner
  (self-notifications) and for admins (verification outcomes).
- Existing table policies are unchanged.
*/

-- ── 1. verification_requests: NIN details ──
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS nin_number text NOT NULL DEFAULT '';
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS nin_image_url text;
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '';

-- ── 2. listings: multi-photo support ──
ALTER TABLE listings ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';

-- ── 3. notifications table ──
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ── 4. Storage bucket for uploads ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "uploads_public_read" ON storage.objects;
CREATE POLICY "uploads_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads_owner_insert" ON storage.objects;
CREATE POLICY "uploads_owner_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "uploads_owner_delete" ON storage.objects;
CREATE POLICY "uploads_owner_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
