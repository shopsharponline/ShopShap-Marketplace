import { Component, lazy, Suspense, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthProvider } from '@/lib/auth';
import { navigate, parseLocation, routeToPath, type Route } from '@/lib/router';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SeoHead, { Breadcrumbs, type BreadcrumbItem, type PageMetadata, SITE_URL } from '@/components/SeoHead';
import { ScrollProgress } from '@/components/ScrollProgress';
import { useAuth } from '@/lib/auth';
import { Plus, UserRound, MessageSquare, Home, Heart } from 'lucide-react';
import { useNotifications } from '@/lib/notifications';

const HomePage = lazy(() => import('@/pages/HomePage'));
const BrowsePage = lazy(() => import('@/pages/BrowsePage'));
const ListingDetailPage = lazy(() => import('@/pages/ListingDetailPage'));
const PostAdPage = lazy(() => import('@/pages/PostAdPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const ShopPage = lazy(() => import('@/pages/ShopPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage'));
const MessagesPage = lazy(() => import('@/pages/MessagesPage'));
const BuyerPage = lazy(() => import('@/pages/BuyerPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const VerificationPage = lazy(() => import('@/pages/VerificationPage'));
const InfoPage = lazy(() => import('@/pages/InfoPage'));
const BecomeASellerPage = lazy(() => import('@/pages/BecomeASellerPage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/PasswordRecoveryPage').then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/PasswordRecoveryPage').then((module) => ({ default: module.ResetPasswordPage })));

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function shopTitleFromSlug(slug: string) {
  return titleFromSlug(slug.replace(/-[a-z0-9]{6}$/i, ''));
}

function getPageMetadata(route: Route): PageMetadata {
  const noIndexRoutes: Route['name'][] = [
    'post-ad', 'dashboard', 'account', 'dashboard-subscription', 'messages',
    'messages-chat', 'wishlist', 'admin', 'verification', 'signin', 'signup',
    'seller-signin', 'seller-signup', 'forgot-password', 'reset-password',
  ];
  const robots = noIndexRoutes.includes(route.name) || route.name === 'not-found' ? 'noindex, nofollow' : 'index, follow';
  const base: PageMetadata = {
    title: 'ShopSharp | Sell Online in Nigeria & Create Your Online Store',
    description: 'Create a free ShopSharp store, list products, and connect directly with buyers across Nigeria. Discover products from shops verified by ShopSharp.',
    canonicalPath: '/',
    robots,
  };

  switch (route.name) {
    case 'home':
      return {
        ...base,
        schema: [
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'ShopSharp',
            url: SITE_URL,
            logo: `${SITE_URL}/shopsharp-512.png`,
            areaServed: { '@type': 'Country', name: 'Nigeria' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'ShopSharp',
            url: SITE_URL,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${SITE_URL}/browse?search={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
        ],
      };
    case 'browse':
      return { ...base, title: 'Browse Products & Shops in Nigeria | ShopSharp', canonicalPath: '/browse' };
    case 'category':
      if (route.slug === 'shops') {
        return {
          ...base,
          title: 'Browse Shops in Nigeria | ShopSharp',
          description: 'Explore seller shops and their products across Nigeria on ShopSharp.',
          canonicalPath: '/category/shops',
          schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Shops on ShopSharp', url: `${SITE_URL}/category/shops` },
        };
      }
      return {
        ...base,
        title: `Shop ${titleFromSlug(route.slug)} in Nigeria | ShopSharp`,
        description: `Browse ${titleFromSlug(route.slug).toLowerCase()} from shops across Nigeria on ShopSharp.`,
        canonicalPath: `/category/${encodeURIComponent(route.slug)}`,
        schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${titleFromSlug(route.slug)} on ShopSharp`, url: `${SITE_URL}/category/${encodeURIComponent(route.slug)}` },
      };
    case 'listing':
      return {
        ...base,
        title: 'Product Listing | ShopSharp',
        description: 'View product details and contact a verified ShopSharp seller directly.',
        canonicalPath: route.slug
          ? `/product/${route.slug}-${route.id}`
          : `/listing/${encodeURIComponent(route.id)}`,
        type: 'product',
      };
    case 'shop':
      return { ...base, title: `${shopTitleFromSlug(route.slug)} Shop | ShopSharp`, description: 'Explore products and contact this ShopSharp seller directly.', canonicalPath: `/shop/${encodeURIComponent(route.slug)}` };
    case 'post-ad':
      return { ...base, title: 'Create a Product Listing | ShopSharp', description: 'Add product details and photos to your ShopSharp store.', canonicalPath: '/post-ad' };
    case 'become-a-seller':
      return { ...base, title: 'Become a ShopSharp Seller | Open Your Online Shop', description: 'Create a free online shop and connect directly with buyers across Nigeria.', canonicalPath: '/become-a-seller' };
    case 'dashboard':
      return { ...base, title: 'Seller Dashboard | ShopSharp', description: 'Manage your ShopSharp store, listings, and customer conversations.', canonicalPath: '/dashboard' };
    case 'account':
      return { ...base, title: 'Your Account | ShopSharp', description: 'Manage your ShopSharp account and shop profile.', canonicalPath: '/account' };
    case 'dashboard-subscription':
      return { ...base, title: 'Shop Plans & Subscription | ShopSharp', description: 'Manage your ShopSharp store subscription.', canonicalPath: '/dashboard/subscription' };
    case 'messages':
      return { ...base, title: 'Messages | ShopSharp', description: 'Read and reply to your ShopSharp conversations.', canonicalPath: '/messages' };
    case 'messages-chat':
      return { ...base, title: 'ShopSharp Conversation', description: 'A private buyer and seller conversation on ShopSharp.', canonicalPath: `/messages/${encodeURIComponent(route.id)}` };
    case 'wishlist':
      return { ...base, title: 'Saved Products | ShopSharp', description: 'View products saved to your ShopSharp account.', canonicalPath: '/wishlist' };
    case 'admin':
      return { ...base, title: 'Admin Panel | ShopSharp', description: 'Manage ShopSharp marketplace reports and verification requests.', canonicalPath: '/admin' };
    case 'verification':
      return { ...base, title: 'Shop Verification | ShopSharp', description: 'Submit your shop identity details for ShopSharp verification.', canonicalPath: '/verification' };
    case 'info':
      return { ...base, title: `${titleFromSlug(route.slug)} | ShopSharp`, description: `${titleFromSlug(route.slug)} information for ShopSharp customers and sellers.`, canonicalPath: `/info/${encodeURIComponent(route.slug)}` };
    case 'signin':
    case 'seller-signin':
      return { ...base, title: 'Sign In | ShopSharp', description: 'Sign in to your ShopSharp account.', canonicalPath: route.name === 'seller-signin' ? '/seller-signin' : '/signin' };
    case 'signup':
    case 'seller-signup':
      return { ...base, title: route.name === 'seller-signup' ? 'Create Your Shop | ShopSharp' : 'Create an Account | ShopSharp', description: 'Create your ShopSharp account and start buying or selling online.', canonicalPath: route.name === 'seller-signup' ? '/create-your-shop' : '/signup' };
    case 'forgot-password':
      return { ...base, title: 'Forgot Password | ShopSharp', description: 'Request a secure password reset link for your ShopSharp account.', canonicalPath: '/forgot-password' };
    case 'reset-password':
      return { ...base, title: 'Reset Password | ShopSharp', description: 'Set a new password for your ShopSharp account.', canonicalPath: '/reset-password' };
    case 'not-found':
      return { ...base, title: 'Page Not Found | ShopSharp', description: 'The page you requested could not be found.', canonicalPath: '/404' };
  }
}

function getBreadcrumbItems(route: Route): BreadcrumbItem[] {
  const home = { label: 'Home', href: '/' };
  switch (route.name) {
    case 'browse':
      return [home, { label: 'Browse' }];
    case 'category':
      return route.slug === 'shops'
        ? [home, { label: 'Browse', href: '/browse' }, { label: 'Shops' }]
        : [home, { label: 'Browse', href: '/browse' }, { label: titleFromSlug(route.slug) }];
    case 'listing':
      return [home, { label: 'Browse products', href: '/browse' }, { label: 'Product details' }];
    case 'shop':
      return [home, { label: 'Browse', href: '/browse' }, { label: shopTitleFromSlug(route.slug) }];
    case 'info':
      return [home, { label: titleFromSlug(route.slug) }];
    case 'not-found':
      return [home, { label: 'Page not found' }];
    default:
      return [];
  }
}

function PageLoading() {
  return <div className="mx-auto min-h-[50vh] max-w-7xl px-4 py-16" role="status" aria-label="Loading page"><div className="h-8 w-48 animate-pulse rounded bg-ink-100" /><div className="mt-6 h-48 animate-pulse rounded-2xl bg-ink-100" /></div>;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ShopSharp could not render this page.', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
          <section className="max-w-lg rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-sm" role="alert">
            <h1 className="text-2xl font-extrabold text-ink-900">This page ran into a problem</h1>
            <p className="mt-3 text-ink-600">Your information is safe. Reload the page or return to the marketplace.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Reload page</button>
              <button type="button" onClick={() => navigate({ name: 'home' })} className="rounded-xl border border-ink-200 px-5 py-3 font-semibold text-ink-700 hover:bg-ink-50">Go home</button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function MobileBottomNav({ route }: { route: Route }) {
  const { user } = useAuth();
  const { unreadMessages } = useNotifications();
  const handleSell = async () => {
    if (!user) {
      navigate({ name: 'seller-signup' });
      return;
    }
    const { data: shop, error } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Could not check the seller shop before starting a listing.', error);
      return;
    }
    navigate(shop ? { name: 'post-ad' } : { name: 'dashboard' });
  };

  const navItems = [
    {
      label: 'Home',
      icon: Home,
      active: route.name === 'home',
      action: () => navigate({ name: 'home' }),
    },
    {
      label: 'Chats',
      icon: MessageSquare,
      active: route.name === 'messages' || route.name === 'messages-chat',
      action: () => navigate(user ? { name: 'messages' } : { name: 'signin' }),
    },
    {
      label: 'Sell',
      icon: Plus,
      active: route.name === 'post-ad' || route.name === 'seller-signup',
      action: () => { void handleSell(); },
    },
    {
      label: 'Saved',
      icon: Heart,
      active: route.name === 'wishlist',
      action: () => navigate(user ? { name: 'wishlist' } : { name: 'signin' }),
    },
    {
      label: 'Profile',
      icon: UserRound,
      active: route.name === 'account',
      action: () => navigate(user ? { name: 'account' } : { name: 'signin' }),
    },
  ];

  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-100 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden">
      <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5">
        {navItems.map(({ label, icon: Icon, active, action }) => (
          <button
            key={label}
            onClick={action}
            aria-current={active ? 'page' : undefined}
            aria-label={label === 'Sell' ? 'Sell an item' : label}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? 'text-brand-600' : 'text-ink-500'}`}
          >
            <span className={`relative flex h-8 w-8 items-center justify-center rounded-full ${label === 'Sell' ? 'bg-brand-500 text-white' : ''}`}>
              <Icon className="h-5 w-5" />
              {label === 'Chats' && unreadMessages > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function AppShell() {
  const [route, setRoute] = useState<Route>(parseLocation());
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    if (window.location.hash.startsWith('#/')) {
      const route = parseLocation();
      const normalizedUrl = new URL(routeToPath(route), window.location.origin);
      const params = new URLSearchParams(normalizedUrl.search);
      new URLSearchParams(window.location.search).forEach((value, key) => {
        if (!params.has(key)) params.set(key, value);
      });
      const query = params.toString();
      window.history.replaceState({}, '', `${normalizedUrl.pathname}${query ? `?${query}` : ''}`);
    }
    const handler = () => {
      setRoute(parseLocation());
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  useEffect(() => {
    supabase.from('categories').select('slug, name').order('name').then((res) => {
      setCategories(((res.data || []) as { slug: string; name: string }[])
        .filter((category) => !['services', 'shops'].includes(category.slug)));
    });
  }, []);

  const handleSearch = useCallback((query: string) => {
    navigate({ name: 'browse', search: query || undefined });
  }, []);

  const searchQuery = route.name === 'browse' ? route.search : undefined;
  const isAuthRoute = ['signin', 'signup', 'seller-signin', 'seller-signup'].includes(route.name);
  const isRecoveryRoute = route.name === 'forgot-password' || route.name === 'reset-password';
  const isAdminRoute = route.name === 'admin';
  const routeKey = route.name === 'messages-chat' ? `messages-${route.id}` : route.name === 'listing' ? `listing-${route.id}` : route.name === 'shop' ? `shop-${route.slug}` : route.name;
  const pageMetadata = getPageMetadata(route);
  const breadcrumbs = getBreadcrumbItems(route);

  return (
    <div className={`min-h-screen bg-ink-50 flex flex-col${route.name === 'home' ? ' app-home' : ''}`}>
      <ScrollProgress />
      <SeoHead metadata={pageMetadata} />
      {!isAuthRoute && !isRecoveryRoute && route.name !== 'account' && !isAdminRoute && <Header categories={categories} onSearch={handleSearch} initialQuery={searchQuery || ''} />}

      <main className={`flex-1 ${isAuthRoute || isRecoveryRoute || isAdminRoute ? '' : 'pb-20 md:pb-0'}`}>
        {!isAdminRoute && <Breadcrumbs items={breadcrumbs} />}
        <Suspense fallback={<PageLoading />}>
          <div key={routeKey} className="page-fade">
        {route.name === 'home' && <HomePage />}
        {route.name === 'browse' && <BrowsePage categorySlug={route.category} searchQuery={route.search} locationParam={route.location} />}
        {route.name === 'category' && <BrowsePage categorySlug={route.slug} />}
        {route.name === 'listing' && <ListingDetailPage id={route.id} />}
        {route.name === 'post-ad' && <PostAdPage />}
        {route.name === 'shop' && <ShopPage slug={route.slug} />}
        {route.name === 'dashboard' && <DashboardPage />}
        {route.name === 'account' && <AccountPage />}
        {route.name === 'dashboard-subscription' && <SubscriptionPage />}
        {route.name === 'messages' && <MessagesPage />}
        {route.name === 'messages-chat' && <MessagesPage conversationId={route.id} />}
        {route.name === 'wishlist' && <BuyerPage tab="wishlist" />}
        {route.name === 'admin' && <AdminPage />}
        {route.name === 'verification' && <VerificationPage />}
        {route.name === 'info' && <InfoPage slug={route.slug} />}
        {route.name === 'signin' && <AuthPage mode="signin" />}
        {route.name === 'signup' && <AuthPage mode="signup" />}
        {route.name === 'seller-signin' && <AuthPage mode="signin" sellerMode />}
        {route.name === 'seller-signup' && <AuthPage mode="signup" sellerMode />}
        {route.name === 'become-a-seller' && <BecomeASellerPage />}
        {route.name === 'forgot-password' && <ForgotPasswordPage />}
        {route.name === 'reset-password' && <ResetPasswordPage />}
        {route.name === 'not-found' && <NotFoundPage />}
          </div>
        </Suspense>
      </main>

      {!isAuthRoute && !isRecoveryRoute && !isAdminRoute && !['browse', 'account'].includes(route.name) && <Footer />}
      {!isAuthRoute && !isRecoveryRoute && !isAdminRoute && <MobileBottomNav route={route} />}
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
