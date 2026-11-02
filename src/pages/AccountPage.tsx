import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, CircleHelp, LogOut, MessageSquare,
  Package, Settings, ShieldCheck, Store, Star, Moon, Sun, Camera, Image,
  Save, ExternalLink, Send, LoaderCircle,
} from 'lucide-react';
import { supabase, type ListingWithCategory, type Plan, type Shop } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import ListingCard from '@/components/ListingCard';
import { uploadImage } from '@/lib/storage';
import { sanitizePlainText } from '@/lib/input';
import BagMark from '@/components/BagMark';

type AccountSection = 'profile' | 'products' | 'settings';
type AccountShop = Shop & { plan: Pick<Plan, 'name' | 'display_name'> | null };

const themeStorageKey = 'shopsharp-theme';

function getShopInitials(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

export default function AccountPage() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [shop, setShop] = useState<AccountShop | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [products, setProducts] = useState<ListingWithCategory[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [section, setSection] = useState<AccountSection>('profile');
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(themeStorageKey) === 'dark';
    } catch (themeError) {
      console.error('Could not read the saved color theme.', themeError);
      return false;
    }
  });
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<'logo' | 'banner' | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const shopLogoInputRef = useRef<HTMLInputElement>(null);

  const loadAccount = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('*, plan:plans(name, display_name)')
      .eq('owner_id', userId)
      .maybeSingle();

    if (shopError) {
      console.error('Could not load the account shop.', shopError);
      setError('Could not load your account details. Please try again.');
      setLoading(false);
      return;
    }

    const accountShop = shopData as AccountShop | null;
    setShop(accountShop);
    if (accountShop) {
      const { data: listingRows, count, error: listingsError } = await supabase
        .from('listings')
        .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)', { count: 'exact' })
        .eq('shop_id', accountShop.id)
        .order('created_at', { ascending: false });
      if (listingsError) {
        console.error('Could not load the account product count.', listingsError);
        setError('Your shop loaded, but its product count could not be retrieved.');
      } else {
        setProductCount(count || 0);
        setProducts((listingRows || []) as unknown as ListingWithCategory[]);
      }
      setShopName(accountShop.name);
      setShopDescription(accountShop.description || '');
      const { data: unreadCount, error: unreadError } = await supabase.rpc('get_unread_shop_chat_count', {
        p_shop_id: accountShop.id,
      });
      if (unreadError) {
        console.error('Could not load the unread seller chat count.', unreadError);
      } else {
        setUnreadChats(Number(unreadCount) || 0);
      }
    } else {
      setProductCount(0);
      setProducts([]);
      setUnreadChats(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ name: 'signin' });
      return;
    }
    void loadAccount(user.id);
  }, [authLoading, user, loadAccount]);

  useEffect(() => {
    if (!user) return;
    const refreshPlan = async () => {
      const { data: shopPlan, error: shopPlanError } = await supabase
        .from('shops')
        .select('plan_id')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (shopPlanError) {
        console.error('Could not refresh the account shop plan.', shopPlanError);
        return;
      }
      if (shopPlan?.plan_id) {
        const { data: plan, error: planError } = await supabase
          .from('plans')
          .select('name, display_name')
          .eq('id', shopPlan.plan_id)
          .maybeSingle();
        if (planError) {
          console.error('Could not refresh the account subscription plan.', planError);
          return;
        }
        setShop((currentShop) => currentShop
          ? { ...currentShop, plan_id: shopPlan.plan_id, plan }
          : currentShop);
      } else {
        setShop((currentShop) => currentShop
          ? { ...currentShop, plan_id: shopPlan?.plan_id ?? null, plan: null }
          : currentShop);
      }
    };
    window.addEventListener('focus', refreshPlan);
    return () => window.removeEventListener('focus', refreshPlan);
  }, [user]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(themeStorageKey, darkMode ? 'dark' : 'light');
    } catch (themeError) {
      console.error('Could not save the selected color theme.', themeError);
    }
  }, [darkMode]);

  const memberSince = shop?.created_at || profile?.created_at;
  const joinedDate = memberSince
    ? new Date(memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';
  const displayName = shop?.name || profile?.full_name || user?.email || 'My account';
  const planName = shop?.plan?.name || 'free';
  const planLabel = shop?.plan?.display_name || 'Free';
  const planBrand = planName === 'pro'
    ? 'border-amber-300 bg-gradient-to-br from-amber-100 via-brand-50 to-white text-amber-900'
    : planName === 'starter'
      ? 'border-brand-300 bg-gradient-to-br from-brand-100 via-white to-brand-50 text-brand-900'
      : 'border-green-200 bg-gradient-to-br from-green-100 via-white to-green-50 text-green-900';

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (signOutError) {
      console.error('Could not sign out from the account page.', signOutError);
      setError('Could not sign out. Please try again.');
      setSigningOut(false);
    }
  };

  const saveShopSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!shop || !user || savingSettings) return;
    setSettingsError(null);
    setSettingsMessage(null);
    const name = sanitizePlainText(shopName, 80).trim();
    const description = sanitizePlainText(shopDescription, 500).trim();
    if (name.length < 2) {
      setSettingsError('Shop name must be at least 2 characters.');
      return;
    }

    setSavingSettings(true);
    const { data: updatedShop, error: updateError } = await supabase
      .from('shops')
      .update({ name, description })
      .eq('id', shop.id)
      .eq('owner_id', user.id)
      .select('*, plan:plans(name, display_name)')
      .single();
    setSavingSettings(false);
    if (updateError || !updatedShop) {
      console.error('Could not save seller shop settings.', updateError);
      setSettingsError('Shop settings could not be saved. Please try again.');
      return;
    }
    setShop(updatedShop as AccountShop);
    setShopName(updatedShop.name);
    setShopDescription(updatedShop.description || '');
    setSettingsMessage('Your shop details were saved.');
  };

  const updateShopImage = async (kind: 'logo' | 'banner', file: File | undefined) => {
    if (!file || !shop || !user) return;
    setSettingsError(null);
    setSettingsMessage(null);
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      setSettingsError('Choose a JPG, PNG, WebP, or AVIF image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setSettingsError('Choose an image smaller than 8 MB.');
      return;
    }

    setUploadingImage(kind);
    try {
      const publicUrl = await uploadImage(file, user.id, 'product-images');
      const { data: updatedShop, error: updateError } = await supabase
        .from('shops')
        .update(kind === 'logo' ? { logo_url: publicUrl } : { banner_url: publicUrl })
        .eq('id', shop.id)
        .eq('owner_id', user.id)
        .select('*, plan:plans(name, display_name)')
        .single();
      if (updateError || !updatedShop) throw updateError || new Error('Shop image was not saved.');
      setShop(updatedShop as AccountShop);
      setSettingsMessage(kind === 'logo' ? 'Shop profile photo updated.' : 'Shop banner updated.');
    } catch (uploadError) {
      console.error(`Could not update the shop ${kind}.`, uploadError);
      setSettingsError(`Could not update the shop ${kind}. Check your connection and try again.`);
    } finally {
      setUploadingImage(null);
    }
  };

  const submitFeedback = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || sendingFeedback) return;
    const message = sanitizePlainText(feedback, 2000).trim();
    if (message.length < 5) {
      setFeedbackMessage('Please write at least 5 characters of feedback.');
      return;
    }
    setSendingFeedback(true);
    setFeedbackMessage(null);
    const { error: feedbackError } = await supabase.from('account_feedback').insert({
      user_id: user.id,
      message,
    });
    setSendingFeedback(false);
    if (feedbackError) {
      console.error('Could not send account feedback.', feedbackError);
      setFeedbackMessage('Feedback could not be sent. Please try again.');
      return;
    }
    setFeedback('');
    setFeedbackMessage('Thanks — your feedback was sent to the ShopSharp team.');
  };

  const setAccountSection = (nextSection: AccountSection) => {
    setError(null);
    setSettingsError(null);
    setSettingsMessage(null);
    setSection(nextSection);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-[70vh] bg-ink-50 p-6">
        <div className="mx-auto max-w-xl animate-pulse space-y-5">
          <div className="h-14 rounded-2xl bg-ink-100" />
          <div className="h-32 rounded-2xl bg-ink-100" />
          <div className="h-24 rounded-2xl bg-ink-100" />
          <div className="h-64 rounded-2xl bg-ink-100" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="account-page min-h-[calc(100vh-4.5rem)] bg-[#f3f8f2] text-ink-900">
      <input
        ref={shopLogoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        aria-label="Choose shop profile picture"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          void updateShopImage('logo', file);
          event.currentTarget.value = '';
        }}
      />
      <header className="sticky top-0 z-20 border-b border-green-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <button onClick={() => section === 'profile' ? navigate({ name: 'home' }) : setAccountSection('profile')} aria-label={section === 'profile' ? 'Back to home' : 'Back to profile'} className="p-2 text-green-800">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-extrabold text-green-900">{section === 'profile' ? 'Account' : section === 'products' ? 'My Products' : 'Settings'}</h1>
          <button onClick={() => setAccountSection('settings')} aria-label="Settings" className="p-2 text-green-800">
            <Settings className="h-6 w-6" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-8 pt-5">
        {section === 'profile' && <>
        <div className={`mb-6 flex items-center gap-2 rounded-2xl border px-4 py-3 ${planBrand}`}>
          <BagMark className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold">ShopSharp</p>
            <p className="text-xs opacity-70">Your seller profile</p>
          </div>
          {shop && <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider">{planLabel}</span>}
        </div>

        <section className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (shop) {
                setAccountSection('settings');
                window.setTimeout(() => shopLogoInputRef.current?.click(), 50);
              }
            }}
            disabled={!shop}
            aria-label={shop ? `Change ${displayName} shop photo` : 'Shop photo unavailable until you create a shop'}
            title={shop ? 'Change shop photo' : undefined}
            className={`relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white shadow-sm ring-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 disabled:cursor-default ${
            planName === 'pro' ? 'bg-gradient-to-br from-amber-100 to-brand-100 ring-amber-300' : planName === 'starter' ? 'bg-gradient-to-br from-brand-100 to-white ring-brand-300' : 'bg-gradient-to-br from-green-100 to-white ring-green-200'
          }`}>
            {shop?.logo_url
              ? <img src={shop.logo_url} alt={`${displayName} profile`} className="h-full w-full object-cover" />
              : <span aria-hidden="true" className="text-3xl font-extrabold text-brand-700">{getShopInitials(displayName)}</span>}
            {shop && (
              <span className="absolute bottom-0 left-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white">
                <Camera className="h-3.5 w-3.5" />
              </span>
            )}
            {shop?.is_verified && (
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-green-600 text-white">
                <BadgeCheck className="h-5 w-5" />
              </span>
            )}
          </button>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-bold text-ink-900">
              <span className="truncate">{displayName}</span>
              {shop?.is_verified && <BadgeCheck className="h-5 w-5 shrink-0 text-green-600" />}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {shop ? (shop.is_verified ? 'Verified Seller' : 'Seller') : 'ShopSharp member'} · Joined {joinedDate}
            </p>
              {shop && <p className="mt-1 text-xs font-semibold text-brand-700">{planLabel} plan</p>}
          </div>
        </section>

        <section aria-label="Account summary" className="mb-7 grid grid-cols-3 divide-x divide-green-200 rounded-2xl bg-green-100/80 px-2 py-4 text-center">
          <div className="px-1">
            <p className="text-xs font-semibold text-ink-700">Products</p>
            <p className="mt-1 text-2xl font-extrabold text-green-900">{productCount}</p>
            <p className="text-xs text-ink-500">Listings</p>
          </div>
          <div className="px-1">
            <p className="text-xs font-semibold text-ink-700">Shop status</p>
            <p className="mt-1 text-lg font-extrabold text-green-900">{shop ? (shop.is_verified ? 'Verified' : 'Pending') : 'Buyer'}</p>
            <p className="text-xs text-ink-500">{shop ? 'Verification' : 'Account type'}</p>
          </div>
          <div className="px-1">
            <p className="text-xs font-semibold text-ink-700">Rating</p>
            <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-extrabold text-green-900">
              {shop?.rating ? shop.rating.toFixed(1) : '—'}
              {shop?.rating ? <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> : null}
            </p>
            <p className="text-xs text-ink-500">Shop rating</p>
          </div>
        </section>

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <section className="mb-6">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Manage</h3>
          <div className="divide-y divide-green-100 overflow-hidden rounded-2xl bg-white">
            <AccountLink icon={Store} label="My Store" onClick={() => navigate({ name: 'dashboard' })} />
            <AccountLink icon={Package} label="My Products" onClick={() => setAccountSection('products')} />
            <AccountLink icon={MessageSquare} label="Messages" badge={unreadChats} onClick={() => navigate({ name: 'messages' })} />
          </div>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Support &amp; more</h3>
          <div className="divide-y divide-green-100 overflow-hidden rounded-2xl bg-white">
            <AccountLink icon={Settings} label="Settings" onClick={() => setAccountSection('settings')} />
            <AccountLink icon={CircleHelp} label="Help" onClick={() => navigate({ name: 'info', slug: 'help' })} />
            <AccountLink icon={ShieldCheck} label="Saved items" onClick={() => navigate({ name: 'wishlist' })} />
          </div>
        </section>

        <button
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left font-semibold text-red-600 disabled:opacity-60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
            <LogOut className="h-5 w-5" />
          </span>
          {signingOut ? 'Signing out...' : 'Log out'}
          <ArrowRight className="ml-auto h-4 w-4" />
        </button>
        </>}

        {section === 'products' && (
          <section aria-labelledby="my-products-heading">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 id="my-products-heading" className="text-xl font-extrabold text-ink-900">Your product listings</h2>
                <p className="mt-1 text-sm text-ink-500">{productCount} product{productCount === 1 ? '' : 's'} in your shop</p>
              </div>
              {shop && <button type="button" onClick={() => navigate({ name: 'post-ad' })} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Add product</button>}
            </div>
            {!shop ? (
              <div className="rounded-2xl border border-green-100 bg-white p-7 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <p className="font-bold text-ink-900">You haven’t opened a shop yet.</p>
                <button type="button" onClick={() => navigate({ name: 'dashboard' })} className="mt-4 rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700">Create your shop</button>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-green-100 bg-white p-7 text-center">
                <Package className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <p className="font-bold text-ink-900">No products listed yet.</p>
                <button type="button" onClick={() => navigate({ name: 'post-ad' })} className="mt-4 rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700">Post your first product</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {products.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
              </div>
            )}
          </section>
        )}

        {section === 'settings' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-green-100 bg-white p-5">
              <h2 className="text-lg font-extrabold text-ink-900">Appearance</h2>
              <p className="mt-1 text-sm text-ink-500">Use a softer dark-green theme at night. This setting stays on this device.</p>
              <button
                type="button"
                role="switch"
                aria-checked={darkMode}
                onClick={() => setDarkMode((enabled) => !enabled)}
                className="mt-4 flex w-full items-center gap-3 rounded-xl border border-ink-100 p-4 text-left hover:bg-ink-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</span>
                <span className="flex-1"><span className="block font-bold text-ink-900">Night theme</span><span className="block text-xs text-ink-500">{darkMode ? 'On · deep green surfaces' : 'Off · light theme'}</span></span>
                <span className={`h-6 w-11 rounded-full p-1 transition-colors ${darkMode ? 'bg-brand-600' : 'bg-ink-200'}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-5' : ''}`} /></span>
              </button>
            </section>

            {shop && (
              <>
                <section className="rounded-2xl border border-green-100 bg-white p-5">
                  <h2 className="text-lg font-extrabold text-ink-900">Shop photos</h2>
                  <p className="mt-1 text-sm text-ink-500">Add a profile image and a banner to make your storefront yours.</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-100 p-3 hover:bg-ink-50">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-700">
                        {shop.logo_url ? <img src={shop.logo_url} alt={`${shop.name} profile`} className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
                      </span>
                      <span className="min-w-0 flex-1"><span className="block font-bold text-ink-900">Shop profile picture</span><span className="block text-xs text-ink-500">JPG, PNG, WebP, or AVIF · 8 MB max</span></span>
                      {uploadingImage === 'logo' ? <LoaderCircle className="h-4 w-4 animate-spin text-brand-700" /> : <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => { void updateShopImage('logo', event.target.files?.[0]); event.currentTarget.value = ''; }} />}
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-100 p-3 hover:bg-ink-50">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50 text-brand-700">
                        {shop.banner_url ? <img src={shop.banner_url} alt={`${shop.name} storefront banner`} className="h-full w-full object-cover" /> : <Image className="h-6 w-6" />}
                      </span>
                      <span className="min-w-0 flex-1"><span className="block font-bold text-ink-900">Storefront banner</span><span className="block text-xs text-ink-500">JPG, PNG, WebP, or AVIF · 8 MB max</span></span>
                      {uploadingImage === 'banner' ? <LoaderCircle className="h-4 w-4 animate-spin text-brand-700" /> : <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => { void updateShopImage('banner', event.target.files?.[0]); event.currentTarget.value = ''; }} />}
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-ink-400">Pro shops show their branding in a larger premium storefront layout.</p>
                </section>

                <form onSubmit={(event) => void saveShopSettings(event)} className="space-y-4 rounded-2xl border border-green-100 bg-white p-5">
                  <div>
                    <h2 className="text-lg font-extrabold text-ink-900">Store details</h2>
                    <p className="mt-1 text-sm text-ink-500">Update what buyers see on your shop page.</p>
                  </div>
                  <label className="block text-sm font-semibold text-ink-700">Store name
                    <input value={shopName} onChange={(event) => setShopName(event.target.value)} maxLength={80} required className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 px-3 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
                  </label>
                  <label className="block text-sm font-semibold text-ink-700">Store description
                    <textarea value={shopDescription} onChange={(event) => setShopDescription(event.target.value)} maxLength={500} rows={4} className="mt-1.5 w-full rounded-xl border border-ink-200 px-3 py-2 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
                  </label>
                  {settingsError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{settingsError}</p>}
                  {settingsMessage && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{settingsMessage}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingSettings} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"><Save className="h-4 w-4" />{savingSettings ? 'Saving...' : 'Save shop details'}</button>
                    <button type="button" onClick={() => navigate({ name: 'shop', slug: shop.slug })} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">View storefront <ExternalLink className="h-4 w-4" /></button>
                  </div>
                </form>
              </>
            )}

            <form onSubmit={(event) => void submitFeedback(event)} className="space-y-4 rounded-2xl border border-green-100 bg-white p-5">
              <div><h2 className="text-lg font-extrabold text-ink-900">Feedback &amp; support</h2><p className="mt-1 text-sm text-ink-500">Tell us what is working or what you would like improved.</p></div>
              <label className="block text-sm font-semibold text-ink-700">Your feedback
                <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} minLength={5} rows={4} required placeholder="Share an idea or report a problem..." className="mt-1.5 w-full rounded-xl border border-ink-200 px-3 py-2 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
              </label>
              {feedbackMessage && <p role="status" className="text-sm text-brand-800">{feedbackMessage}</p>}
              <button type="submit" disabled={sendingFeedback} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"><Send className="h-4 w-4" />{sendingFeedback ? 'Sending...' : 'Send feedback'}</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function AccountLink({ icon: Icon, label, onClick, badge = 0 }: { icon: typeof Store; label: string; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-green-50">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-800">
        <Icon className="h-5 w-5" />
      </span>
      <span className="font-medium text-ink-900">{label}</span>
      {badge > 0 && <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-xs font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
      <ArrowRight className="ml-auto h-4 w-4 text-green-800" />
    </button>
  );
}
