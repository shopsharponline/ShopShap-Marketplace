/*
# Newsletter subscribers table

1. New Tables
- `newsletter_subscribers`: stores emails from the footer newsletter form
  (id, email unique, created_at).

2. Security
- RLS enabled.
- Anyone (anon or authenticated) can subscribe (insert their email).
- Only admins can read the subscriber list. No updates or deletes for regular users.
*/

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_insert" ON newsletter_subscribers;
CREATE POLICY "newsletter_insert" ON newsletter_subscribers FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "newsletter_select_admin" ON newsletter_subscribers;
CREATE POLICY "newsletter_select_admin" ON newsletter_subscribers FOR SELECT
  TO authenticated
  USING (is_admin());
