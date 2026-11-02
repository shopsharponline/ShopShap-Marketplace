# ShopSharp Marketplace

A React + Vite marketplace for browsing listings, seller shops, chats, subscriptions, and admin moderation.

## Project map

- `src/App.tsx` — route setup, mobile navigation, breadcrumbs, and app shell.
- `src/pages/` — buyer, seller, auth, dashboard, admin, and recovery pages.
- `src/components/` — shared UI blocks such as the header, footer, cards, SEO tags, and notification components.
- `src/lib/` — Supabase client, auth, sanitization, router helpers, validation, and mobile helpers.
- `api/` — serverless endpoints such as the sitemap generator.
- `supabase/` — database migrations and edge-function config.
- `public/` — static files such as `llms.txt` and marketing assets.

## Local development

1. Install dependencies: `npm install`
2. Add the required env values in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Start the app: `npm run dev`
4. Validate before shipping:
   - `npm run typecheck`
   - `npm run build`

## Route conventions

- Public product links use a readable format: `/product/{slug}-{listing-id}`
- Legacy `/listing/:id` paths still resolve for backward compatibility.
- Old `#/...` links are treated as legacy compatibility redirects and are not used for new links.
- Seller signup route: `/create-your-shop`
- Seller sign-in route: `/seller-signin`
- Password recovery: `/forgot-password` and `/reset-password`

## Notes for engineers

- The app uses Supabase for auth, listings, shops, chats, and notifications.
- The admin route has its own responsive navigation and does not render the marketplace footer or phone navigation.
- Admin verification and chat-safety alerts, plus listing-promotion notices, use the in-app notification table. Phone delivery requires the `notification-push` Edge Function and VAPID secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`).
- Submitted product searches are counted once per temporary browser session, term, category, and hour. At 20 sessions, the `track-search` Edge Function sends admins an in-app and phone alert; raw email addresses and phone-number searches are excluded.
- The account screen links My Products to the seller's product listings and has local dark-mode preferences, shop name/description and photo settings, and a feedback form backed by the `account_feedback` migration.
- Sponsored listing boosts are issued by the `promote_listing` database function; each included boost lasts 7 days and promotions are ranked before organic listings within matching results.
- Listing view, click, and inquiry totals are recorded in `listing_analytics`; owners can read only analytics for their own shops.
- SEO metadata is route-based through the `SeoHead` component.
- Keep database changes in `supabase/migrations/` so deployments stay consistent.
- Shareable product URLs must keep a stable slug and a valid listing ID to work across previews and social cards.
