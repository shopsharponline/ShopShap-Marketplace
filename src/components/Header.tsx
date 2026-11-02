import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Menu, X, MessageSquare, Store, UserCircle, LogOut, LayoutDashboard, ShieldCheck, Heart, ChevronDown, Bell, BadgeCheck, Download, Smartphone } from 'lucide-react';
import { navigate, navigateToPath, parseLocation, type Route } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';
import { useNotifications } from '@/lib/notifications';
import { normalizeNigerianPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { disableMessagePush, enableMessagePush } from '@/lib/push-notifications';
import { LOCATION_NAMES } from '@/lib/locations';

type HeaderProps = {
  categories: { slug: string; name: string }[];
  onSearch: (query: string) => void;
  initialQuery?: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function Header({ categories, onSearch, initialQuery = '' }: HeaderProps) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { items: notifications, unread: unreadNotifs, error: notificationError, markAllRead } = useNotifications();
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [smsPreference, setSmsPreference] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstallNotice, setShowInstallNotice] = useState(false);
  const [messagePushEnabled, setMessagePushEnabled] = useState(false);
  const [messagePushBusy, setMessagePushBusy] = useState(false);
  const [messagePushError, setMessagePushError] = useState<string | null>(null);
  const [showPhoneAlertPrompt, setShowPhoneAlertPrompt] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  const handlePostProduct = async () => {
    if (!user) {
      navigate({ name: 'seller-signup' });
      return;
    }
    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!shop) {
      navigate({ name: 'dashboard' });
      return;
    }
    navigate({ name: 'post-ad' });
  };

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setMessagePushEnabled(false);
      setMessagePushError(null);
      return;
    }

    navigator.serviceWorker?.getRegistration().then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setMessagePushEnabled(Boolean(subscription));
    }).catch((error: unknown) => {
      console.error('Could not check message notification status.', error);
    });

    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (
      !user
      || messagePushEnabled
      || !('serviceWorker' in navigator)
      || !('PushManager' in window)
      || !('Notification' in window)
      || Notification.permission === 'denied'
    ) {
      setShowPhoneAlertPrompt(false);
      return;
    }

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isIOS && !isInstalled) return;

    const dismissedKey = `shopsharp-phone-alert-prompt-dismissed-${user.id}`;
    if (localStorage.getItem(dismissedKey)) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          if (!cancelled && !subscription && Notification.permission !== 'denied') {
            localStorage.setItem(dismissedKey, 'shown');
            setShowPhoneAlertPrompt(true);
          }
        } catch (error) {
          console.error('Could not check whether phone alerts are enabled.', error);
        }
      })();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, messagePushEnabled]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const manualNoticeTimer = isIOS && !isInstalled
      ? window.setTimeout(() => setShowInstallNotice(true), 2500)
      : undefined;

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isInstalled) return;
      if (manualNoticeTimer !== undefined) window.clearTimeout(manualNoticeTimer);
      setInstallPrompt(event as InstallPromptEvent);
      setShowInstallNotice(true);
    };
    const handleAppInstalled = () => {
      if (manualNoticeTimer !== undefined) window.clearTimeout(manualNoticeTimer);
      setInstallPrompt(null);
      setShowInstallNotice(false);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      if (manualNoticeTimer !== undefined) window.clearTimeout(manualNoticeTimer);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setSmsPreference(profile?.sms_notifications_enabled ?? false);
    setPhoneInput(profile?.phone?.replace(/^\+234/, '') ?? '');
  }, [profile]);

  const verifyPhone = async () => {
    if (!user || smsBusy) return;
    setSmsBusy(true);
    setSmsError(null);
    try {
      if (!phoneOtpSent) {
        const phone = normalizeNigerianPhone(phoneInput);
        if (!phone) throw new Error('Enter a valid Nigerian mobile number.');
        const { error } = await supabase.auth.updateUser({ phone });
        if (error) throw error;
        setPhoneOtpSent(true);
      } else {
        const phone = normalizeNigerianPhone(phoneInput);
        if (!phone) throw new Error('Enter a valid Nigerian mobile number.');
        const { error } = await supabase.auth.verifyOtp({
          phone,
          token: phoneOtp,
          type: 'phone_change',
        });
        if (error) throw error;
        setPhoneOtpSent(false);
        setPhoneOtp('');
        await refreshProfile();
      }
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : 'Could not verify this phone number.');
    } finally {
      setSmsBusy(false);
    }
  };

  const toggleSmsPreference = async () => {
    if (!user || !profile || smsBusy) return;
    setSmsBusy(true);
    setSmsError(null);
    const enabled = !smsPreference;
    const { error } = await supabase.from('profiles').update({
      sms_notifications_enabled: enabled,
      sms_notifications_consent_at: enabled ? new Date().toISOString() : null,
    }).eq('id', user.id);
    setSmsBusy(false);
    if (error) {
      setSmsError(`Could not update SMS preferences: ${error.message}`);
      return;
    }
    setSmsPreference(enabled);
    await refreshProfile();
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setShowInstallNotice(false);
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  };

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setSignOutError(null);
    try {
      if (messagePushEnabled) {
        await disableMessagePush();
        setMessagePushEnabled(false);
      }
      await signOut();
    } catch (error) {
      console.error('Could not sign out.', error);
      setSignOutError('Could not sign out. Please try again.');
      setUserMenuOpen(true);
    }
  };

  const toggleMessagePush = async () => {
    if (!user || messagePushBusy) return;
    setMessagePushBusy(true);
    setMessagePushError(null);
    try {
      if (messagePushEnabled) {
        await disableMessagePush();
        setMessagePushEnabled(false);
      } else {
        await enableMessagePush(user.id);
        setMessagePushEnabled(true);
        setShowPhoneAlertPrompt(false);
      }
    } catch (error) {
      console.error('Could not update phone message notifications.', error);
      setMessagePushError(error instanceof Error ? error.message : 'Could not update phone notifications.');
    } finally {
      setMessagePushBusy(false);
    }
  };

  const dismissPhoneAlertPrompt = () => {
    if (user) {
      localStorage.setItem(
        `shopsharp-phone-alert-prompt-dismissed-${user.id}`,
        'shown',
      );
    }
    setShowPhoneAlertPrompt(false);
    setMessagePushError(null);
  };

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
    setMobileMenuOpen(false);
  }, [query, onSearch]);

  const handleLocationChange = (loc: string) => {
    setLocation(loc);
    const current = parseLocation();
    if (current.name === 'browse' || current.name === 'category') {
      navigate({ name: 'browse', location: loc || undefined, search: current.name === 'browse' ? current.search : undefined });
    } else {
      // From home or any other page, go to browse with the selected location
      navigate({ name: 'browse', location: loc || undefined });
    }
  };

  const menuItem = (label: string, icon: React.ReactNode, route: Route, onClick?: () => void) => (
    <button
      onClick={() => { setUserMenuOpen(false); onClick?.(); navigate(route); }}
      className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
    >
      {icon} {label}
    </button>
  );

  return (
    <>
    <header
      className="header-in sticky top-0 z-50 border-b border-ink-100 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? 'rgba(255,255,255,0.82)' : '#ffffff',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(14px)' : 'none',
        boxShadow: scrolled ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 h-16">
          <button onClick={() => navigate({ name: 'home' })} className="shrink-0">
            <Logo />
          </button>

          {/* Search with location */}
          <form onSubmit={handleSearch} className="flex-1 max-w-2xl hidden sm:flex items-stretch h-11 rounded-xl border border-ink-200 overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 transition-all bg-white">
            <div className="relative border-r border-ink-200">
              <select
                value={location}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="h-full pl-3 pr-7 text-sm text-ink-700 bg-ink-50 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="">All Nigeria</option>
                {LOCATION_NAMES.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
            </div>
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-ink-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shops and products..."
                className="w-full h-full pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none"
              />
            </div>
            <button type="submit" className="px-5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
              Search
            </button>
          </form>

          <div className="flex-1 sm:hidden" />

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            {user && (
              <div className="relative">
                <button
                  onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) void markAllRead(); }}
                  className="relative p-2.5 rounded-full text-ink-600 hover:bg-ink-50 transition-colors"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotifs > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-brand-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadNotifs > 9 ? '9+' : unreadNotifs}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-ink-100 z-50 animate-fade-slide-up overflow-hidden">
                      <div className="px-4 py-3 border-b border-ink-100 font-bold text-sm text-ink-900">Notifications</div>
                      {notificationError && <p role="alert" className="px-4 py-2 text-xs text-red-600">{notificationError}</p>}
                      <div className="px-4 py-3 border-b border-ink-100">
                        <p className="text-sm font-semibold text-ink-800">SMS settings</p>
                        {user.phone_confirmed_at ? (
                          <>
                            <label className="flex items-start gap-2 mt-2 text-xs text-ink-600">
                              <input
                                type="checkbox"
                                checked={smsPreference}
                                disabled={smsBusy}
                                onChange={toggleSmsPreference}
                                className="mt-0.5 accent-brand-500"
                              />
                              <span>Send me SMS for new messages and shop verification updates. I can turn this off anytime.</span>
                            </label>
                            <p className="text-xs text-ink-400 mt-1">Verified phone: {user.phone}</p>
                          </>
                        ) : (
                          <form
                            className="mt-2 space-y-2"
                            onSubmit={(event) => { event.preventDefault(); void verifyPhone(); }}
                          >
                            <label htmlFor="sms-phone" className="block text-xs text-ink-600">Verify a phone number to enable phone sign-in or SMS updates.</label>
                            <div className="flex gap-2">
                              <span className="flex items-center px-2 rounded-lg border border-ink-200 bg-ink-50 text-xs text-ink-600">+234</span>
                              <input
                                id="sms-phone"
                                type="tel"
                                required
                                maxLength={13}
                                value={phoneInput}
                                onChange={(event) => setPhoneInput(event.target.value.replace(/\D/g, '').slice(0, 13))}
                                placeholder="801 234 5678"
                                className="min-w-0 flex-1 h-9 px-2 rounded-lg border border-ink-200 text-xs"
                              />
                            </div>
                            {phoneOtpSent && (
                              <input
                                type="text"
                                required
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                value={phoneOtp}
                                onChange={(event) => setPhoneOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="6-digit SMS code"
                                className="w-full h-9 px-2 rounded-lg border border-ink-200 text-xs"
                              />
                            )}
                            <button type="submit" disabled={smsBusy} className="text-xs font-semibold text-brand-700 disabled:text-ink-400">
                              {smsBusy ? 'Please wait...' : phoneOtpSent ? 'Verify phone' : 'Send verification code'}
                            </button>
                          </form>
                        )}
                        {smsError && <p role="alert" className="text-xs text-red-600 mt-1">{smsError}</p>}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-ink-400 text-center">No notifications yet.</p>
                        ) : (
                          notifications.map((n) => (
                            <button
                              key={n.id}
                              onClick={() => {
                                setNotifOpen(false);
                                if (n.link) navigateToPath(n.link);
                              }}
                              className={`w-full text-left px-4 py-3 border-b border-ink-50 last:border-0 hover:bg-ink-50 transition-colors ${!n.read ? 'bg-brand-50/60' : ''}`}
                            >
                              <p className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
                                {n.type === 'verification_approved' && <BadgeCheck className="w-4 h-4 text-brand-500 shrink-0" />}
                                {n.type === 'verification_rejected' && <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />}
                                {n.title}
                              </p>
                              {n.body && <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">{n.body}</p>}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => navigate({ name: 'wishlist' })}
              className="hidden sm:block p-2.5 rounded-full text-ink-600 hover:bg-ink-50 transition-colors"
              title="Wishlist"
            >
              <Heart className="w-5 h-5" />
            </button>

            {user ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-full hover:bg-ink-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold">
                    {(profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                  <ChevronDown className="w-4 h-4 text-ink-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-ink-100 py-2 z-50 animate-fade-slide-up overflow-hidden">
                      <div className="px-4 py-2 border-b border-ink-100">
                        <p className="text-sm font-semibold text-ink-900 truncate">{profile?.full_name || 'My Account'}</p>
                        <p className="text-xs text-ink-500 truncate">{user.email}</p>
                  </div>
                      {menuItem('My Account', <UserCircle className="w-4 h-4" />, { name: 'account' })}
                      {menuItem('My Dashboard', <LayoutDashboard className="w-4 h-4" />, { name: 'dashboard' })}
                      {menuItem('Wishlist', <Heart className="w-4 h-4" />, { name: 'wishlist' })}
                      {menuItem('Messages', <MessageSquare className="w-4 h-4" />, { name: 'messages' })}
                      <button
                        type="button"
                        onClick={() => void toggleMessagePush()}
                        disabled={messagePushBusy}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
                      >
                        <Smartphone className="h-4 w-4" />
                        {messagePushBusy
                          ? 'Updating phone alerts...'
                          : messagePushEnabled ? 'Turn off phone alerts' : 'Enable phone alerts'}
                      </button>
                      {messagePushError && (
                        <p role="alert" className="px-4 pb-2 text-xs text-red-600">
                          {messagePushError}
                        </p>
                      )}
                      {profile?.is_admin && menuItem('Admin Panel', <ShieldCheck className="w-4 h-4" />, { name: 'admin' })}
                      <div className="border-t border-ink-100 mt-1 pt-1">
                        <button
                          onClick={() => void handleSignOut()}
                          className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4" /> Sign out
                        </button>
                        {signOutError && (
                          <p role="alert" className="px-4 pb-2 text-xs text-red-600">
                            {signOutError}
                          </p>
                        )}
                      </div>
                    </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => navigate({ name: 'signin' })}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:text-brand-600 transition-colors"
              >
                <UserCircle className="w-5 h-5" /> Sign in
              </button>
            )}

            <button
              onClick={() => navigate(user ? { name: 'dashboard' } : { name: 'seller-signup' })}
              className="hidden sm:flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 h-10 rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              <Store className="w-4 h-4" />
              <span className="text-sm">{user ? 'My Shop' : 'Start Selling'}</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 text-ink-700"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <form onSubmit={handleSearch} className="sm:hidden pb-3 flex gap-2">
          <div className="relative flex-1 flex items-center h-10 rounded-xl border border-ink-200 bg-white">
            <Search className="absolute left-3 w-4 h-4 text-ink-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products and shops..."
              className="w-full h-full pl-9 pr-3 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <button type="submit" className="px-4 rounded-xl bg-brand-500 text-white text-sm font-semibold">
            Go
          </button>
        </form>

        {/* Category nav */}
        <nav className="hidden sm:flex items-center gap-1 h-10 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => navigate({ name: 'browse' })}
            className="text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap text-ink-600 hover:text-brand-600 hover:bg-brand-50 transition-colors"
          >
            All Products
          </button>
          {categories.filter((cat) => !['services', 'shops'].includes(cat.slug)).map((cat) => (
            <button
              key={cat.slug}
              onClick={() => navigate({ name: 'category', slug: cat.slug })}
              className="text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap text-ink-600 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            >
              {cat.name}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={handlePostProduct}
            className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 whitespace-nowrap px-3"
          >
            <Plus className="w-4 h-4" /> Post Product
          </button>
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-white border-t border-ink-100 px-4 py-4 space-y-1 max-h-[70vh] overflow-y-auto animate-fade-slide-up">
          {user && (
            <button
              onClick={() => { navigate({ name: 'dashboard' }); setMobileMenuOpen(false); }}
              className="w-full flex items-center gap-2 bg-brand-500 text-white font-semibold py-3 rounded-xl px-4"
            >
              <Store className="w-4 h-4" /> My Shop
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {categories.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => { navigate({ name: 'category', slug: cat.slug }); setMobileMenuOpen(false); }}
                className="text-ink-700 text-sm py-2.5 px-3 rounded-lg hover:bg-brand-50 text-left font-medium"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
    {showPhoneAlertPrompt && user && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/50 px-4 py-6">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="phone-alert-prompt-title"
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-fade-slide-up"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Smartphone className="h-7 w-7" />
          </div>
          <h2 id="phone-alert-prompt-title" className="text-center text-xl font-extrabold text-ink-900">
            Get new message alerts
          </h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-ink-500">
            Get a browser notification when a buyer sends you a message. Availability depends on your device and browser.
          </p>
          {messagePushError && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {messagePushError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void toggleMessagePush()}
            disabled={messagePushBusy}
            className="mt-5 w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {messagePushBusy ? 'Enabling alerts...' : 'Enable phone alerts'}
          </button>
          <button
            type="button"
            onClick={dismissPhoneAlertPrompt}
            className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold text-ink-500 hover:bg-ink-50"
          >
            Not now
          </button>
        </section>
      </div>
    )}
    {showInstallNotice && installPrompt && (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900">
            {installPrompt ? 'Install ShopSharp' : 'Add ShopSharp to your Home Screen'}
          </p>
          <p className="text-xs text-ink-500">
            {installPrompt
              ? 'Add the app to your device for quick access.'
              : 'Tap Share, then choose “Add to Home Screen”.'}
          </p>
        </div>
        {installPrompt && (
          <button
            onClick={() => void installApp()}
            className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowInstallNotice(false)}
          aria-label="Dismiss install notice"
          className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )}
    </>
  );
}
