# Production deployment and rollback

## Release safely

1. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
2. Deploy the branch as a Vercel Preview Deployment. Do not promote it yet.
3. Check the preview on desktop and mobile, including sign-in, seller shop creation, product browsing, messaging, and password recovery.
4. Confirm any database migration has been applied and that the current and previous frontend versions both work with the resulting schema.
5. In Vercel, promote the tested deployment to Production. Vercel switches the production alias to the immutable deployment; keep the previous production deployment available.

## Roll back

1. Open the Vercel project's Deployments page and identify the last known-good Production deployment.
2. Promote that deployment back to Production. This restores the prior frontend without rebuilding it.
3. Check the production homepage, sign-in, browsing, and seller flows.
4. Investigate the failed release before promoting another deployment.

## Database compatibility

Frontend rollback does not roll back Supabase schema or data. Use expand-and-contract migrations: add backward-compatible schema first, deploy code that can use it, and remove old schema only in a later release after rollback is no longer needed. Take a database backup before destructive data migrations. Never assume reverting a Vercel deployment reverses a database migration.

Vercel rollback and Supabase migration rollback are separate operations. Record the deployment URL and migration version for each production release.
