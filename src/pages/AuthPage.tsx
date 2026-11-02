import { useState } from 'react';
import {
  Mail, Lock, User as UserIcon, AlertCircle, CheckCircle2, Eye, EyeOff,
  ShieldCheck, MessageSquare, Truck, ShoppingBag, ShoppingCart, Store, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import { normalizeNigerianPhone } from '@/lib/phone';
import { Sparkles } from 'lucide-react';
import { normalizeEmail, sanitizePlainText } from '@/lib/input';

type Mode = 'signin' | 'signup';

export default function AuthPage({ mode, sellerMode = false }: { mode: Mode; sellerMode?: boolean }) {
  const { refreshProfile } = useAuth();
  const isSignUp = mode === 'signup';

  const [email, setEmail] = useState(localStorage.getItem('shopsharp_remember_email') || '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'buyer' | 'seller'>(sellerMode ? 'seller' : 'buyer');
  const [agree, setAgree] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${sellerMode ? '/dashboard' : '/'}` },
    });
    if (err) setError('Google sign in is not available yet. Please use email and password.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSignUp && !agree) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setBusy(true);

    if (isSignUp) {
      const normalizedPhone = phone ? normalizeNigerianPhone(phone) : null;
      if (phone && !normalizedPhone) {
        setBusy(false);
        setError('Enter a valid Nigerian mobile number, or leave the phone field blank.');
        return;
      }
      const normalizedEmail = normalizeEmail(email);
      const safeFullName = sanitizePlainText(fullName, 100);
      if (!normalizedEmail || safeFullName.length < 2) {
        setBusy(false);
        setError('Enter a valid email address and a name with at least 2 characters.');
        return;
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: safeFullName, phone: normalizedPhone, role },
        },
      });
      if (err) {
        setBusy(false);
        setError(err.message);
        return;
      }
      if (data.session) {
        const { error: pErr } = await supabase.from('profiles').upsert({
          id: data.user!.id,
          full_name: safeFullName,
          phone: normalizedPhone,
        });
        if (!pErr) await refreshProfile();
        setBusy(false);
        navigate(role === 'seller' ? { name: 'dashboard' } : { name: 'home' });
      } else {
        setBusy(false);
        setSignedUp(true);
      }
    } else {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        setBusy(false);
        setError('Enter a valid email address.');
        return;
      }
      if (remember) localStorage.setItem('shopsharp_remember_email', normalizedEmail);
      else localStorage.removeItem('shopsharp_remember_email');

      const { error: err } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      setBusy(false);
      if (err) {
        setError(
          err.message.toLowerCase().includes('invalid login credentials')
            ? 'These details do not match an active ShopSharp account. Check the email address, confirm your email if you just signed up, or use “Forgot password?” to reset it.'
            : err.message,
        );
        return;
      }
      navigate(sellerMode ? { name: 'dashboard' } : { name: 'home' });
    }
  };

  const inputClass =
    'w-full h-12 pl-10 pr-4 rounded-xl border border-ink-200 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 transition-all';

  // ── Email confirmation notice ──
  if (signedUp) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-ink-50">
        <div className="max-w-md w-full bg-white rounded-3xl border border-ink-100 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Check your email</h1>
          <p className="text-ink-500 text-sm mb-6">
            We sent a confirmation link to <span className="font-semibold text-ink-800">{email}</span>. Click it to activate your account.
          </p>
          <button onClick={() => navigate(sellerMode ? { name: 'seller-signin' } : { name: 'signin' })} className="text-brand-600 font-semibold text-sm hover:text-brand-700">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full min-w-0 bg-ink-50">
      {/* ── Left green panel ── */}
      <div className="hidden lg:flex w-[45%] xl:w-[42%] bg-brand-500 text-white flex-col justify-between p-10 xl:p-14 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-16 bottom-1/4 w-64 h-64 rounded-full bg-black/5 blur-2xl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-brand-500" />
          </div>
          <span className="text-3xl font-extrabold tracking-tight">ShopSharp</span>
        </div>

        {isSignUp ? (
          <div className="relative z-10">
            <h2 className="text-4xl xl:text-5xl font-extrabold leading-[1.1]">
              Trust · Chat ·<br />Buy Direct
            </h2>
            <div className="mt-10 space-y-6">
              {[
                { icon: ShieldCheck, title: 'Trust', desc: 'Secure transactions and verified sellers' },
                { icon: MessageSquare, title: 'Chat', desc: 'Message sellers and buyers instantly' },
                { icon: ShoppingBag, title: 'Buy Direct', desc: 'No middlemen. Better prices, faster deals' },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-xl">{f.title}</p>
                    <p className="text-sm text-white/80 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative z-10 text-center">
            {/* Chat illustration */}
            <div className="relative inline-block mb-8">
              <div className="w-52 h-40 mx-auto relative">
                <div className="absolute inset-x-0 top-0 h-28 bg-white rounded-3xl flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-brand-500" />
                  <span className="w-3 h-3 rounded-full bg-brand-500" />
                  <span className="w-3 h-3 rounded-full bg-brand-500" />
                </div>
                <div className="absolute left-10 bottom-0 w-0 h-0 border-l-[22px] border-l-transparent border-r-[22px] border-r-transparent border-t-[28px] border-t-white" />
                <div className="absolute -right-6 -top-4 w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg">
                  <ShieldCheck className="w-8 h-8 text-brand-500" />
                </div>
                <Sparkles className="absolute -right-10 top-14 w-6 h-6 text-white/70" />
                <div className="absolute -bottom-2 -left-4 w-12 h-12 rounded-full border-4 border-white/60 flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
            <h2 className="text-4xl xl:text-5xl font-extrabold">Trust · Chat · Buy Direct</h2>
            <p className="mt-4 text-white/85 text-lg">Nigeria's trusted marketplace — safe, fast, and direct.</p>
          </div>
        )}

        {/* Bottom features */}
        <div className="relative z-10 flex items-center gap-6 text-sm font-semibold">
          <span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Verified Sellers</span>
          <span className="flex items-center gap-2"><MessageSquare className="w-5 h-5" /> In app chat</span>
          <span className="flex items-center gap-2"><Truck className="w-5 h-5" /> Nationwide</span>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 min-w-0 flex flex-col relative">
        <div className="absolute right-6 top-5 hidden text-sm font-medium text-ink-500 sm:block">EN · Nigeria</div>

        <div className="flex-1 flex items-start justify-center px-3 py-5 sm:items-center sm:px-4 sm:py-12">
          <div className="mx-auto w-full min-w-0 max-w-md">
            <div className="w-full min-w-0 rounded-3xl border border-ink-100 bg-white p-4 shadow-sm sm:p-7 lg:p-9">
              {/* Mobile logo */}
              <div className="lg:hidden flex items-center gap-2 justify-center mb-4 sm:mb-6">
                <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <span className="text-2xl font-extrabold text-ink-900">ShopSharp</span>
              </div>

              <h1 className="text-2xl font-extrabold text-ink-900 sm:text-3xl">
                {sellerMode
                  ? (isSignUp ? 'Create your seller account' : 'Seller sign in')
                  : (isSignUp ? 'Create your account' : 'Welcome back')}
              </h1>
              <p className="text-ink-500 text-sm mt-1 mb-5 sm:mb-7">
                {sellerMode
                  ? (isSignUp ? 'After signup, set up your shop and start listing products.' : 'Sign in to manage your shop and products.')
                  : (isSignUp ? 'Join ShopSharp and start buying or selling today' : 'Sign in to continue to ShopSharp')}
              </p>

              {error && (
                <div className="mb-5 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3.5">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {isSignUp ? (
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-ink-800 block mb-1.5">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                      <input type="text" required minLength={2} maxLength={100} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-ink-800 block mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                      <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-ink-800 block mb-1.5">Phone number</label>
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1.5 h-12 px-3.5 rounded-xl border border-ink-200 bg-ink-50 text-sm font-semibold text-ink-700 shrink-0">
                        <span className="inline-block w-5 h-3.5 rounded-[3px] overflow-hidden relative bg-emerald-600">
                          <span className="absolute left-0 top-0 w-2 h-full bg-white" />
                        </span>
                        +234
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="801 234 5678"
                        className="min-w-0 flex-1 h-12 px-4 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-ink-800 block mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password"
                        className={`${inputClass} pr-11`}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {!sellerMode && (
                    <div>
                      <label className="text-sm font-semibold text-ink-800 block mb-1.5">Select role</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRole('buyer')}
                          className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 font-semibold text-sm transition-all ${
                            role === 'buyer' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-400 hover:border-ink-300'
                          }`}
                        >
                          <ShoppingCart className="w-4 h-4" /> Buyer
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole('seller')}
                          className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 font-semibold text-sm transition-all ${
                            role === 'seller' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-400 hover:border-ink-300'
                          }`}
                        >
                          <Store className="w-4 h-4" /> Seller
                        </button>
                      </div>
                      {role === 'seller' && <p className="text-xs text-ink-400 mt-1.5">You'll open your free shop right after signing up.</p>}
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-brand-500"
                    />
                    <span className="text-sm text-ink-600">
                      I agree to the <span className="text-brand-600 font-semibold underline cursor-pointer">Terms of Service</span> and{' '}
                      <span className="text-brand-600 font-semibold underline cursor-pointer">Privacy Policy</span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold h-12 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {busy ? 'Please wait...' : sellerMode ? 'Create seller account' : 'Sign Up'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-ink-800 block mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                      <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-ink-800 block mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`${inputClass} pr-11`}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 rounded accent-brand-500" />
                      <span className="text-sm text-ink-600">Remember me</span>
                    </label>
                    <a href="/forgot-password" onClick={(event) => { event.preventDefault(); navigate({ name: 'forgot-password' }); }} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                      Forgot password?
                    </a>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold h-12 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {busy ? 'Please wait...' : 'Sign In'}
                  </button>
                </form>
              )}

              {/* Divider + Google */}
              <div className="flex items-center gap-3 my-6">
                <span className="flex-1 h-px bg-ink-100" />
                <span className="text-xs text-ink-400 font-medium whitespace-nowrap">— or continue with —</span>
                <span className="flex-1 h-px bg-ink-100" />
              </div>

              <button
                onClick={handleGoogle}
                className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-ink-200 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <p className="text-center text-sm text-ink-600 mt-7">
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <button
                  onClick={() => navigate(isSignUp
                    ? (sellerMode ? { name: 'seller-signin' } : { name: 'signin' })
                    : (sellerMode ? { name: 'seller-signup' } : { name: 'signup' }))}
                  className="font-semibold text-brand-600 hover:text-brand-700"
                >
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
