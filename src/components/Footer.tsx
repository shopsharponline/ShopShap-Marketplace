import { useState } from 'react';
import { Mail, MapPin, ShieldCheck, CheckCircle2, Send, Instagram, Facebook, Music2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate, type Route } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';
import { Reveal } from '@/components/motion';
import { normalizeEmail } from '@/lib/input';

const SOCIAL_LINKS = [
  { name: 'Instagram', url: 'https://www.instagram.com/shops_harp/', Icon: Instagram },
  { name: 'Facebook', url: 'https://web.facebook.com/profile.php?id=61595220655764', Icon: Facebook },
  { name: 'TikTok', url: 'https://www.tiktok.com/@shopsharp.online', Icon: Music2 },
];

export default function Footer() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subError, setSubError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !consent || submitting) {
      if (!normalizedEmail) setSubError(true);
      return;
    }
    setSubmitting(true);
    setSubError(false);
    const { error } = await supabase.functions.invoke('newsletter-subscribe', {
      body: { email: normalizedEmail, consent, website },
    });
    setSubmitting(false);
    if (error) {
      setSubError(true);
      return;
    }
    setSubscribed(true);
    setEmail('');
    setConsent(false);
  };

  const link = (label: string, route: Route | null) => (
    <li>
      {route ? (
        <button onClick={() => navigate(route)} className="hover:text-white transition-colors">{label}</button>
      ) : (
        <span className="text-white/40 cursor-default">{label}</span>
      )}
    </li>
  );

  const handleSellClick = async () => {
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

  return (
    <Reveal>
      <footer className="mt-16 hidden bg-ink-900 text-white md:block">
      {/* Newsletter band */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h3 className="text-xl font-bold">Get the best deals first</h3>
            <p className="text-white/60 text-sm mt-1">Get occasional ShopSharp updates and offers. You can unsubscribe at any time.</p>
          </div>
          {subscribed ? (
            <div className="flex items-center gap-2 bg-brand-500/20 text-brand-300 px-5 py-3 rounded-xl text-sm font-semibold">
              <CheckCircle2 className="w-5 h-5" /> You're subscribed. Welcome aboard!
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="w-full md:w-auto md:min-w-[22rem]">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full h-12 pl-10 pr-4 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-ink-400 text-sm focus:outline-none focus:border-brand-400"
                  />
                </div>
                <button type="submit" disabled={submitting || !consent} className="h-12 px-5 rounded-xl bg-brand-500 hover:bg-brand-600 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-60">
                  {submitting ? 'Joining...' : 'Subscribe'} <Send className="w-4 h-4" />
                </button>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-white/65">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 accent-green-500"
                />
                <span>
                  I agree to receive ShopSharp emails. I can unsubscribe at any time. See our{' '}
                  <a href="/info/privacy" onClick={(event) => { event.preventDefault(); navigate({ name: 'info', slug: 'privacy' }); }} className="underline hover:text-white">Privacy Policy</a>.
                </span>
              </label>
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="newsletter-website">Leave this field empty</label>
                <input
                  id="newsletter-website"
                  name="website"
                  type="text"
                  maxLength={254}
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>
            </form>
          )}
          {subError && <p role="alert" className="text-sm text-red-400">Couldn't subscribe right now. Please try again.</p>}
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 space-y-4">
            <Logo light />
            <p className="text-sm text-white/60 leading-relaxed max-w-sm">
              Nigeria's marketplace of real, verified shops. Buy with confidence from sellers with names, faces and reputations, not anonymous accounts.
            </p>
            <div className="flex flex-wrap gap-4 pt-1">
              <span className="flex items-center gap-1.5 text-xs text-white/50"><ShieldCheck className="w-4 h-4 text-brand-400" /> Verified shops</span>
              <span className="flex items-center gap-1.5 text-xs text-white/50"><MapPin className="w-4 h-4 text-brand-400" /> Made in Nigeria</span>
            </div>
            <div className="flex gap-3 pt-2">
              {SOCIAL_LINKS.map(({ name, url, Icon }) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`ShopSharp on ${name}`}
                    aria-label={`ShopSharp on ${name}`}
                    className="w-9 h-9 rounded-lg bg-white/10 hover:bg-brand-500 flex items-center justify-center transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
              ))}
            </div>
            <a
              href="mailto:support@shorpsharp@gmail.com"
              className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4" /> support@shorpsharp@gmail.com
            </a>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3 text-brand-400 uppercase tracking-wider">Shop</h4>
            <ul className="space-y-2 text-sm text-white/70">
              {link('All Products', { name: 'browse' })}
              <button onClick={handleSellClick} className="hover:text-white transition-colors">
                Sell on ShopSharp
              </button>
              {link('Sneakers', { name: 'category', slug: 'sneakers' })}
              {link('Beauty', { name: 'category', slug: 'beauty' })}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3 text-brand-400 uppercase tracking-wider">Trust & Safety</h4>
            <ul className="space-y-2 text-sm text-white/70">
              {link('Help & Support', { name: 'info', slug: 'help' })}
              {link('Shop Verification', { name: 'info', slug: 'verification' })}
              {link('Buyer Protection', { name: 'info', slug: 'buyer-protection' })}
              {link('Report a Seller', { name: 'info', slug: 'report-seller' })}
              {link('Safety Tips', { name: 'info', slug: 'safety-tips' })}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3 text-brand-400 uppercase tracking-wider">Company</h4>
            <ul className="space-y-2 text-sm text-white/70">
              {link('About ShopSharp', { name: 'info', slug: 'about' })}
              {link('Pricing', { name: 'info', slug: 'pricing' })}
              {link('Terms of Use', { name: 'info', slug: 'terms' })}
              {link('Privacy Policy', { name: 'info', slug: 'privacy' })}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/40">
          <span>© {new Date().getFullYear()} ShopSharp. Proudly made in Nigeria.</span>
          <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Lagos • Abuja • Port Harcourt</span>
        </div>
      </div>
      </footer>
    </Reveal>
  );
}
