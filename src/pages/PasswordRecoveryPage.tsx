import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { normalizeEmail } from '@/lib/input';

const RECOVERY_COOLDOWN_MS = 60_000;
const RECOVERY_COOLDOWN_KEY = 'shopsharp_recovery_request_at';

function AuthPageFrame({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-ink-50 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-center text-2xl font-extrabold text-ink-900">{title}</h1>
        <p className="mt-2 text-center text-sm text-ink-600">{description}</p>
        {children}
      </section>
    </main>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError('Enter a valid email address.');
      return;
    }

    const lastRequest = Number(localStorage.getItem(RECOVERY_COOLDOWN_KEY) || '0');
    const remaining = RECOVERY_COOLDOWN_MS - (Date.now() - lastRequest);
    if (remaining > 0) {
      setError(`Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another link.`);
      return;
    }

    setError(null);
    setBusy(true);
    localStorage.setItem(RECOVERY_COOLDOWN_KEY, String(Date.now()));
    const { error: requestError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (requestError) {
      setError('We could not send a reset link right now. Please try again later.');
      console.error('Password recovery request failed.', requestError);
      return;
    }
    setSent(true);
  };

  return (
    <AuthPageFrame
      title={sent ? 'Check your email' : 'Forgot your password?'}
      description={sent
        ? 'If an account exists for that address, we sent a password reset link.'
        : 'Enter your account email and we’ll send you a secure reset link.'}
    >
      {sent ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Open the email and follow the link. For your security, reset links expire after 30 minutes.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          <label className="block text-sm font-semibold text-ink-800" htmlFor="recovery-email">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 w-full rounded-xl border border-ink-200 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? 'Sending link…' : 'Email me a reset link'}
          </button>
        </form>
      )}
      <a href="/signin" onClick={(event) => { event.preventDefault(); navigate({ name: 'signin' }); }} className="mt-6 block text-center text-sm font-semibold text-brand-700 hover:underline">
        Back to sign in
      </a>
    </AuthPageFrame>
  );
}

export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionError) {
        console.error('Could not validate the password reset session.', sessionError);
        setInvalidLink(true);
        return;
      }
      setReady(Boolean(data.session));
      setInvalidLink(!data.session);
    };
    void checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true);
        setInvalidLink(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      console.error('Could not update the account password.', updateError);
      setError('This reset link may have expired or already been used. Request a new link and try again.');
      return;
    }
    setUpdated(true);
  };

  return (
    <AuthPageFrame
      title={updated ? 'Password updated' : invalidLink ? 'Reset link expired' : 'Choose a new password'}
      description={updated ? 'Your password has been changed. You can now sign in.' : invalidLink ? 'Reset links are single-use and expire after 30 minutes.' : 'Enter a new password for your ShopSharp account.'}
    >
      {updated ? (
        <div className="mt-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" aria-hidden="true" />
          <a href="/signin" onClick={(event) => { event.preventDefault(); navigate({ name: 'signin' }); }} className="mt-4 inline-block font-semibold text-brand-700 hover:underline">Go to sign in</a>
        </div>
      ) : invalidLink ? (
        <a href="/forgot-password" onClick={(event) => { event.preventDefault(); navigate({ name: 'forgot-password' }); }} className="mt-6 block rounded-xl bg-brand-600 px-4 py-3 text-center font-bold text-white hover:bg-brand-700">
          Request a new reset link
        </a>
      ) : ready ? (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          <label className="block text-sm font-semibold text-ink-800" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-ink-200 px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          <label className="block text-sm font-semibold text-ink-800" htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-12 w-full rounded-xl border border-ink-200 px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      ) : (
        <p className="mt-6 text-center text-sm text-ink-500" role="status">Checking your secure reset link…</p>
      )}
    </AuthPageFrame>
  );
}
