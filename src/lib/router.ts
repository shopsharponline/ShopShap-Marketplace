export type Route =
  | { name: 'home' }
  | { name: 'browse'; category?: string; search?: string; location?: string }
  | { name: 'listing'; id: string; slug?: string }
  | { name: 'post-ad' }
  | { name: 'become-a-seller' }
  | { name: 'category'; slug: string }
  | { name: 'shop'; slug: string }
  | { name: 'dashboard' }
  | { name: 'account' }
  | { name: 'dashboard-subscription' }
  | { name: 'messages' }
  | { name: 'messages-chat'; id: string }
  | { name: 'wishlist' }
  | { name: 'admin' }
  | { name: 'verification' }
  | { name: 'info'; slug: string }
  | { name: 'signin' }
  | { name: 'signup' }
  | { name: 'seller-signin' }
  | { name: 'seller-signup' }
  | { name: 'forgot-password' }
  | { name: 'reset-password' }
  | { name: 'not-found' };

export function buildListingSlug(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  return slug || 'product';
}

function extractListingId(rawValue: string) {
  const match = rawValue.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match ? match[1] : rawValue;
}

function parseListingRouteValue(rawValue: string) {
  const normalized = rawValue.trim();
  const listingId = extractListingId(normalized);
  const slug = normalized === listingId ? undefined : normalized.slice(0, -(listingId.length + 1)).replace(/-+$/, '');
  return { id: listingId, slug: slug || undefined };
}

function routeFromPath(pathname: string, search: string): Route {
  const segments = pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(search);

  if (
    params.get('paystack') === '1'
    && (
      params.has('reference')
      || params.has('trxref')
      || (segments[0] === 'dashboard' && segments[1] === 'subscription')
    )
  ) {
    return { name: 'dashboard-subscription' };
  }

  if (segments.length === 0) return { name: 'home' };

  switch (segments[0]) {
    case 'browse':
      return {
        name: 'browse',
        category: params.get('category') || undefined,
        search: params.get('search') || undefined,
        location: params.get('location') || undefined,
      };
    case 'listing':
      return segments[1] ? { name: 'listing', ...parseListingRouteValue(segments[1]) } : { name: 'not-found' };
    case 'product':
      return segments[1] ? { name: 'listing', ...parseListingRouteValue(segments[1]) } : { name: 'not-found' };
    case 'post-ad':
      return { name: 'post-ad' };
    case 'become-a-seller':
      return { name: 'become-a-seller' };
    case 'category':
      return segments[1] ? { name: 'category', slug: segments[1] } : { name: 'not-found' };
    case 'shop':
      return segments[1] ? { name: 'shop', slug: segments[1] } : { name: 'not-found' };
    case 'dashboard':
      return segments[1] === 'subscription'
        ? { name: 'dashboard-subscription' }
        : { name: 'dashboard' };
    case 'account':
      return { name: 'account' };
    case 'messages':
      return segments[1] ? { name: 'messages-chat', id: segments[1] } : { name: 'messages' };
    case 'wishlist':
      return { name: 'wishlist' };
    case 'admin':
      return { name: 'admin' };
    case 'verification':
      return { name: 'verification' };
    case 'info':
      return segments[1] ? { name: 'info', slug: segments[1] } : { name: 'not-found' };
    case 'signin':
      return { name: 'signin' };
    case 'signup':
      return { name: 'signup' };
    case 'seller-signin':
      return { name: 'seller-signin' };
    case 'seller-signup':
    case 'create-your-shop':
      return { name: 'seller-signup' };
    case 'forgot-password':
      return { name: 'forgot-password' };
    case 'reset-password':
      return { name: 'reset-password' };
    case '404':
      return { name: 'not-found' };
    default:
      return { name: 'not-found' };
  }
}

export function parseLocation(): Route {
  const legacyHash = window.location.hash;
  if (!legacyHash.startsWith('#/')) {
    return routeFromPath(window.location.pathname, window.location.search);
  }

  const legacyUrl = new URL(legacyHash.slice(1), window.location.origin);
  const params = new URLSearchParams(window.location.search);
  new URLSearchParams(legacyUrl.search).forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return routeFromPath(legacyUrl.pathname, params.toString());
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'browse': {
      const params = new URLSearchParams();
      if (route.category) params.set('category', route.category);
      if (route.search) params.set('search', route.search);
      if (route.location) params.set('location', route.location);
      const query = params.toString();
      return `/browse${query ? `?${query}` : ''}`;
    }
    case 'listing':
      return route.slug ? `/product/${route.slug}-${route.id}` : `/listing/${encodeURIComponent(route.id)}`;
    case 'post-ad':
      return '/post-ad';
    case 'become-a-seller':
      return '/become-a-seller';
    case 'category':
      return `/category/${encodeURIComponent(route.slug)}`;
    case 'shop':
      return `/shop/${encodeURIComponent(route.slug)}`;
    case 'dashboard':
      return '/dashboard';
    case 'account':
      return '/account';
    case 'dashboard-subscription':
      return '/dashboard/subscription';
    case 'messages':
      return '/messages';
    case 'messages-chat':
      return `/messages/${encodeURIComponent(route.id)}`;
    case 'wishlist':
      return '/wishlist';
    case 'admin':
      return '/admin';
    case 'verification':
      return '/verification';
    case 'info':
      return `/info/${encodeURIComponent(route.slug)}`;
    case 'signin':
      return '/signin';
    case 'signup':
      return '/signup';
    case 'seller-signin':
      return '/seller-signin';
    case 'seller-signup':
      return '/create-your-shop';
    case 'forgot-password':
      return '/forgot-password';
    case 'reset-password':
      return '/reset-password';
    case 'not-found':
      return '/404';
  }
}

export function navigate(route: Route) {
  window.history.pushState({}, '', routeToPath(route));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function navigateToPath(path: string) {
  const normalizedPath = path.startsWith('#/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error('Navigation is limited to this website.');
  }
  window.history.pushState({}, '', `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
