import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, ArrowLeft, Store, X, CloudUpload, MapPin, Check } from 'lucide-react';
import { supabase, type Category } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { buildListingSlug, navigate } from '@/lib/router';
import { uploadImage } from '@/lib/storage';
import { LOCATION_NAMES } from '@/lib/locations';
import { sanitizePlainText } from '@/lib/input';

const MIN_PHOTOS = 1;
const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

function getProductLimit(plan: unknown) {
  const relation = Array.isArray(plan) ? plan[0] : plan;
  if (typeof relation !== 'object' || relation === null || !('product_limit' in relation)) return null;
  return typeof relation.product_limit === 'number' ? relation.product_limit : null;
}

export default function PostAdPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [myShop, setMyShop] = useState<{ id: string; name: string } | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '',
    category_id: '',
    city: '',
    state: 'Lagos',
    condition: 'used',
  });
  const [deliveryCoverage, setDeliveryCoverage] = useState<'nationwide' | 'pickup'>('nationwide');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');

  useEffect(() => {
    if (!user) {
      setShopLoading(false);
      return;
    }
    (async () => {
      const { data: shop } = await supabase
        .from('shops')
        .select('id, name, plan:plans(product_limit)')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (shop) {
        setMyShop(shop);
        const { count } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shop.id)
          .eq('status', 'active');
        const limit = getProductLimit(shop.plan) ?? 5;
        if ((count || 0) >= limit) setLimitReached(true);
      }
      setShopLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then((res) => {
      setCategories(res.data || []);
    });
  }, []);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) {
      navigate({ name: 'seller-signin' });
      return;
    }
    if (!myShop) {
      setError('You need a shop to post products. Open your free shop first.');
      return;
    }
    const title = sanitizePlainText(form.title, 100);
    const description = sanitizePlainText(form.description, 2000);
    const city = sanitizePlainText(form.city, 100);
    const price = Number(form.price);
    if (!title || !description || !form.price || !form.category_id || !city || !form.state) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0 || !categories.some((category) => category.id === form.category_id)) {
      setError('Enter a valid price and choose a listed category.');
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setError(`Please add at least ${MIN_PHOTOS} photos — buyers trust listings with more images.`);
      return;
    }

    setSubmitting(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setUploadProgress(`Uploading photo ${i + 1} of ${photos.length}...`);
        urls.push(await uploadImage(photos[i], user.id, 'product-images'));
      }
      setUploadProgress('');
    const { data: latestShop } = await supabase
      .from('shops')
      .select('id, plan:plans(product_limit)')
      .eq('id', myShop.id)
      .maybeSingle();
    const limit = getProductLimit(latestShop?.plan) ?? 5;
    const { count } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', myShop.id)
      .eq('status', 'active');

    if ((count || 0) >= limit) {
      setSubmitting(false);
      setLimitReached(true);
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle();

    const { data, error: insertError } = await supabase
      .from('listings')
      .insert({
        title,
        description,
        price,
        category_id: form.category_id,
        location: `${city}, ${sanitizePlainText(form.state, 80)}`,
        delivery_coverage: deliveryCoverage,
        condition: form.condition,
        seller_name: myShop.name,
        seller_phone: profile?.phone || null,
        status: 'active',
        shop_id: myShop.id,
        images: urls,
        image_url: urls[0] || null,
      })
      .select('id')
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      console.error('Could not create the seller product listing.', insertError);
      setError('Something went wrong while posting. Please try again.');
      return;
    }
    setSuccess(data.id);
    } catch (uploadError) {
      console.error('Could not upload the seller product photos.', uploadError);
      setUploadProgress('');
      setSubmitting(false);
      setError('Something went wrong while uploading your photos. Please try again.');
    }
  };

  const addPhotos = (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    const room = MAX_PHOTOS - photos.length;
    const validTypes = selectedFiles.filter((file) => ['image/jpeg', 'image/png'].includes(file.type));
    const withinSizeLimit = validTypes.filter((file) => file.size <= MAX_PHOTO_SIZE_BYTES);
    const accepted = withinSizeLimit.slice(0, room);
    if (validTypes.length < selectedFiles.length) setError('Photos must be JPG or PNG files.');
    else if (withinSizeLimit.length < validTypes.length) setError('Each photo must be 10 MB or smaller.');
    else if (accepted.length < withinSizeLimit.length) setError(`You can add up to ${MAX_PHOTOS} photos.`);
    else setError(null);
    setPhotos((prev) => [...prev, ...accepted]);
    setPhotoPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Store className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Sign in to sell</h1>
        <p className="text-ink-500 mb-6">Create a free account and open your shop to start posting products.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate({ name: 'seller-signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Seller sign in</button>
          <button onClick={() => navigate({ name: 'seller-signup' })} className="border-2 border-ink-200 text-ink-700 font-semibold px-6 py-3 rounded-xl hover:border-brand-300">Create seller account</button>
        </div>
      </div>
    );
  }

  if (limitReached) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-3xl font-extrabold text-ink-900 mb-3">You've hit your plan limit</h1>
        <p className="text-ink-600 mb-2">Your current plan doesn't allow more active products right now.</p>
        <p className="text-ink-500 text-sm mb-8">Upgrade to add more products and unlock boosts and analytics. Verification is free for every shop.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => navigate({ name: 'dashboard-subscription' })}
            className="bg-brand-500 text-white font-bold px-6 py-3.5 rounded-xl hover:bg-brand-600 transition-colors"
          >
            Upgrade Plan
          </button>
          <button
            onClick={() => navigate({ name: 'dashboard' })}
            className="border-2 border-ink-200 text-ink-700 font-bold px-6 py-3.5 rounded-xl hover:border-ink-300 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-brand-500" />
        </div>
        <h1 className="text-3xl font-extrabold text-ink-900 mb-3">Your item is live!</h1>
        <p className="text-ink-600 mb-8">It's now visible in your shop and across ShopSharp.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => navigate({ name: 'listing', id: success, slug: buildListingSlug(form.title) })} className="bg-brand-500 text-white font-bold px-6 py-3.5 rounded-xl hover:bg-brand-600">
            View listing
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setForm({ title: '', description: '', price: '', category_id: '', city: '', state: 'Lagos', condition: 'used' });
              setDeliveryCoverage('nationwide');
            }}
            className="border-2 border-ink-200 text-ink-700 font-bold px-6 py-3.5 rounded-xl hover:border-ink-300"
          >
            Post another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <button onClick={() => window.history.back()} aria-label="Go back" className="rounded-full p-2 text-ink-600 hover:bg-ink-50">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Store className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-extrabold text-ink-900">Sell an Item</h1>
          <span className="ml-auto hidden text-sm text-ink-500 sm:block">{myShop?.name || 'ShopSharp'}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 rounded-2xl border border-ink-100 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-500 sm:text-sm">
            <span className="flex items-center gap-1.5 text-brand-700"><Check className="h-4 w-4 rounded-full bg-brand-100 p-0.5" /> Add photos</span>
            <span className="hidden h-px flex-1 bg-ink-200 sm:block" />
            <span>Product details</span>
            <span className="hidden h-px flex-1 bg-ink-200 sm:block" />
            <span>Delivery</span>
            <span className="hidden h-px flex-1 bg-ink-200 sm:block" />
            <span>Location</span>
          </div>
          <p className="mt-2 text-xs text-ink-400 sm:hidden">{myShop ? `Listing under ${myShop.name}` : 'Prepare your product listing'}</p>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-7">
          <section aria-labelledby="photos-heading">
            <h2 id="photos-heading" className="mb-3 text-2xl font-extrabold text-ink-900">1. Add Photos</h2>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addPhotos(event.dataTransfer.files);
              }}
            >
              <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-brand-300 bg-emerald-50/70 px-4 py-6 text-center transition hover:border-brand-500 hover:bg-emerald-50">
                <CloudUpload className="mb-2 h-10 w-10 text-brand-600" />
                <span className="font-semibold text-ink-800">Drag &amp; drop photos here or tap to upload</span>
                <span className="mt-1 text-xs text-ink-500">Up to 5 photos · JPG or PNG · Max 10 MB each</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) addPhotos(event.target.files);
                    event.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {photoPreviews.map((src, index) => (
                <div key={src} className="relative h-20 w-20 overflow-hidden rounded-xl border border-ink-200 bg-white">
                  <img src={src} alt={`Product photo ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink-700 shadow"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <span className="self-end text-xs text-ink-500">{photos.length} of {MAX_PHOTOS} photos added</span>
            </div>
          </section>

          <section aria-labelledby="details-heading" className="space-y-4">
            <h2 id="details-heading" className="text-2xl font-extrabold text-ink-900">2. Product Details</h2>
            <div>
              <label htmlFor="product-title" className="mb-1.5 block text-sm font-semibold text-ink-800">Title *</label>
              <input
                id="product-title"
                type="text"
                required
                value={form.title}
                onChange={(event) => handleChange('title', event.target.value)}
                placeholder="e.g. iPhone 14 Pro 128GB"
                maxLength={100}
                className="h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-category" className="mb-1.5 block text-sm font-semibold text-ink-800">Category *</label>
                <select
                  id="product-category"
                  required
                  value={form.category_id}
                  onChange={(event) => handleChange('category_id', event.target.value)}
                  className="h-12 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Select category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-ink-800">Condition *</legend>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'new', label: 'New' },
                    { value: 'used', label: 'Used' },
                    { value: 'fair', label: 'Fairly Used' },
                  ].map((condition) => (
                    <button
                      key={condition.value}
                      type="button"
                      aria-pressed={form.condition === condition.value}
                      onClick={() => handleChange('condition', condition.value)}
                      className={`h-12 rounded-xl border text-xs font-semibold sm:text-sm ${
                        form.condition === condition.value
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-brand-300'
                      }`}
                    >
                      {condition.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div>
              <label htmlFor="product-price" className="mb-1.5 block text-sm font-semibold text-ink-800">Price (in Naira) *</label>
              <div className="flex h-12 items-center rounded-xl border border-ink-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                <span className="px-4 font-bold text-ink-700">₦</span>
                <input
                  id="product-price"
                  type="number"
                  required
                  max="1000000000000"
                  value={form.price}
                  onChange={(event) => handleChange('price', event.target.value)}
                  placeholder="0.00"
                  min="1"
                  step="0.01"
                  className="h-full min-w-0 flex-1 rounded-r-xl bg-transparent pr-4 text-right text-sm outline-none"
                />
              </div>
            </div>
            <div>
              <label htmlFor="product-description" className="mb-1.5 block text-sm font-semibold text-ink-800">Description *</label>
              <textarea
                id="product-description"
                required
                value={form.description}
                onChange={(event) => handleChange('description', event.target.value)}
                placeholder="Describe the product, its condition, features and what's included."
                rows={4}
                maxLength={2000}
                className="w-full resize-y rounded-xl border border-ink-200 bg-white p-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </section>

          <section aria-labelledby="delivery-heading" className="space-y-3">
            <h2 id="delivery-heading" className="text-2xl font-extrabold text-ink-900">3. Delivery Coverage</h2>
            {[
              { value: 'nationwide', label: 'Nationwide', detail: 'Deliver to buyers across Nigeria' },
              { value: 'pickup', label: 'Local pickup only', detail: 'Buyers collect from your location' },
            ].map((option) => (
              <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-4 ${
                deliveryCoverage === option.value ? 'border-brand-500 ring-1 ring-brand-500' : 'border-ink-200'
              }`}>
                <input
                  type="radio"
                  name="deliveryCoverage"
                  value={option.value}
                  checked={deliveryCoverage === option.value}
                  onChange={() => setDeliveryCoverage(option.value as 'nationwide' | 'pickup')}
                  className="h-5 w-5 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink-900">{option.label}</span>
                  <span className="block text-xs text-ink-500">{option.detail}</span>
                </span>
              </label>
            ))}
          </section>

          <section aria-labelledby="location-heading" className="space-y-3">
            <h2 id="location-heading" className="flex items-center gap-2 text-2xl font-extrabold text-ink-900">
              <MapPin className="h-6 w-6 text-brand-600" /> 4. Location
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-state" className="mb-1.5 block text-sm font-semibold text-ink-800">State *</label>
                <select
                  id="product-state"
                  required
                  value={form.state}
                  onChange={(event) => handleChange('state', event.target.value)}
                  className="h-12 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {LOCATION_NAMES.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="product-city" className="mb-1.5 block text-sm font-semibold text-ink-800">City / Area *</label>
                <input
                  id="product-city"
                  required
                  type="text"
                  value={form.city}
                  onChange={(event) => handleChange('city', event.target.value)}
                  placeholder="e.g. Ikeja"
                  maxLength={100}
                  className="h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          </section>

          <button
            type="submit"
            disabled={submitting || shopLoading || photos.length < MIN_PHOTOS}
            className="w-full rounded-xl bg-brand-600 py-4 text-lg font-extrabold text-white shadow-md transition hover:bg-brand-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (uploadProgress || 'Publishing...') : 'Publish'}
          </button>
          <p className="text-center text-xs text-ink-500">By publishing, you agree to ShopSharp&apos;s Selling Policy.</p>
        </form>
      </main>
    </div>
  );
}
