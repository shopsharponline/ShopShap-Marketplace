import { ArrowLeft, SearchX } from 'lucide-react';
import { navigate } from '@/lib/router';

export default function NotFoundPage() {
  return (
    <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <SearchX className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="text-sm font-bold uppercase tracking-widest text-brand-700">404 · Page not found</p>
      <h1 className="mt-3 text-3xl font-extrabold text-ink-900">We couldn’t find that page</h1>
      <p className="mt-3 text-ink-600">The link may be incorrect, or the page may have moved.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Go to ShopSharp
        </button>
        <button
          type="button"
          onClick={() => navigate({ name: 'browse' })}
          className="rounded-xl border border-ink-200 px-5 py-3 font-semibold text-ink-700 hover:bg-ink-50"
        >
          Browse products
        </button>
      </div>
    </section>
  );
}
