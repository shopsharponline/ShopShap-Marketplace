/*
# Allow admins to delete verification requests

1. Security
- Added a DELETE policy on `verification_requests` for admins.
- Reason: when a request is approved, the shop becomes verified and the request
  no longer needs to exist — the admin panel deletes it so the dashboard stays
  clean. Previously there was no delete rule, so the deletion would fail.
*/

DROP POLICY IF EXISTS "vr_delete_admin" ON verification_requests;
CREATE POLICY "vr_delete_admin" ON verification_requests FOR DELETE
  TO authenticated
  USING (is_admin());
