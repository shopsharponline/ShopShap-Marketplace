import { useEffect, useState } from 'react';
import { BadgeCheck, ShieldCheck, AlertCircle, CheckCircle2, ArrowLeft, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import { uploadImage } from '@/lib/storage';
import { formatTimeAgo } from '@/lib/format';

export default function VerificationPage() {
  const { user } = useAuth();
  const [shop, setShop] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nin, setNin] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lastRequest, setLastRequest] = useState<{ status: string; rejection_reason: string | null; created_at: string } | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: shopData } = await supabase.from('shops').select('id, name').eq('owner_id', user.id).maybeSingle();
      if (shopData) {
        setShop(shopData as { id: string; name: string });
        const { data: req } = await supabase
          .from('verification_requests')
          .select('status, rejection_reason, created_at')
          .eq('shop_id', (shopData as { id: string }).id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLastRequest(req as { status: string; rejection_reason: string | null; created_at: string } | null);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 10 * 1024 * 1024) {
      setError('Choose an image file no larger than 10 MB.');
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user || !shop) return;
    if (!/^\d{11}$/.test(nin.trim())) {
      setError('Enter your 11-digit NIN number.');
      return;
    }
    if (!file) {
      setError('Upload a photo of your NIN slip so we can verify you.');
      return;
    }
    setSubmitting(true);
    try {
      const path = await uploadImage(file, user.id, 'nin-verification');
      const { error: insertError } = await supabase.from('verification_requests').insert({
        shop_id: shop.id,
        nin_number: nin.trim(),
        nin_image_url: path,
        status: 'pending',
      });
      if (insertError) throw insertError;
      setSuccess(true);
    } catch (submitError) {
      console.error('Could not submit the shop verification request.', submitError);
      setError('Something went wrong while submitting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <ShieldCheck className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Get verified</h1>
        <p className="text-ink-500 mb-6">Sign in with your vendor account to apply for verification.</p>
        <button onClick={() => navigate({ name: 'signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Sign in</button>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-8"><div className="bg-ink-50 rounded-2xl animate-pulse h-64" /></div>;
  }

  if (!shop) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <ShieldCheck className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">No shop yet</h1>
        <p className="text-ink-500 mb-6">Open your free shop first — then you can apply for verification.</p>
        <button onClick={() => navigate({ name: 'dashboard' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Open free shop</button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-brand-500" />
        </div>
        <h1 className="text-3xl font-extrabold text-ink-900 mb-3">Application sent!</h1>
        <p className="text-ink-600 mb-8">The ShopSharp team will review your NIN details and notify you of the outcome.</p>
        <button onClick={() => navigate({ name: 'dashboard' })} className="bg-brand-500 text-white font-bold px-6 py-3.5 rounded-xl hover:bg-brand-600">
          Back to dashboard
        </button>
      </div>
    );
  }

  const pending = lastRequest?.status === 'pending';
  const rejected = lastRequest?.status === 'rejected';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 mb-5 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-500 text-white flex items-center justify-center mx-auto mb-4">
          <BadgeCheck className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-ink-900">Apply for Verification</h1>
        <p className="text-ink-500 mt-2">Free for every shop — show buyers your identity is confirmed.</p>
      </div>

      {pending && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Loader2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-spin" />
          <p className="text-sm text-amber-800">
            Your application from {formatTimeAgo(lastRequest!.created_at)} is still being reviewed. You'll get a notification once it's decided.
          </p>
        </div>
      )}

      {rejected && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            Your last application was rejected{lastRequest!.rejection_reason ? `: ${lastRequest!.rejection_reason}` : '.'} You can reapply below.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-ink-100 p-6 sm:p-8 space-y-6">
        <div>
          <label className="text-sm font-semibold text-ink-700 block mb-2">NIN Number *</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={11}
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="Enter your 11-digit NIN"
            className="w-full h-12 px-4 rounded-xl border border-ink-200 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-ink-700 block mb-2">NIN Slip Photo *</label>
          <p className="text-xs text-ink-400 mb-3">Upload a clear photo of your NIN slip — only the ShopSharp team sees this.</p>
          {preview ? (
            <div className="relative rounded-2xl overflow-hidden border border-ink-100">
              <img src={preview} alt="NIN slip preview" className="w-full max-h-64 object-cover" />
              <button
                type="button"
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-white/95 text-ink-700 text-xs font-bold px-3 py-1.5 rounded-full shadow hover:bg-white"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-ink-200 rounded-2xl py-10 cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors">
              <Upload className="w-8 h-8 text-ink-300" />
              <span className="text-sm font-semibold text-ink-600">Tap to upload NIN slip photo</span>
              <span className="text-xs text-ink-400">JPG or PNG</span>
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || pending}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white font-extrabold py-4 rounded-xl text-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : pending ? 'Application under review' : 'Submit Application'}
        </button>
      </form>
    </div>
  );
}
