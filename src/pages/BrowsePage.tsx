import { useEffect, useState, useCallback, useRef } from 'react';
import { SlidersHorizontal, X, Search, ChevronDown, Store, BadgeCheck } from 'lucide-react';
import { supabase, type Category, type ListingWithCategory, type Shop } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import ListingCard from '@/components/ListingCard';
import { LOCATION_NAMES } from '@/lib/locations';
import { buildPostgrestOrFilter, sanitizeSearchTerm } from '@/lib/input';
import { isPromotionSchemaUnavailable } from '@/lib/promotions';

type Props = {
  categorySlug?: string;
  searchQuery?: string;
  locationParam?: string;
};

const conditionOptions = [
  { value: 'all', label: 'All Conditions' },
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Used' },
  { value: 'fair', label: 'Fairly Used' },
];

const sortOptions = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
];

const searchVisitorStorageKey = 'shopsharp-search-visitor';

function getSearchVisitorId() {
  try {
    const storedId = sessionStorage.getItem(searchVisitorStorageKey);
    if (storedId) return storedId;
    const visitorId = crypto.randomUUID();
    sessionStorage.setItem(searchVisitorStorageKey, visitorId);
    return visitorId;
  } catch (error) {
    console.error('Could not persist a temporary search session ID.', error);
    return crypto.randomUUID();
  }
}

export default function BrowsePage({ categorySlug, searchQuery, locationParam }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allLocations, setAllLocations] = useState<string[]>(LOCATION_NAMES);
  const [listings, setListings] = useState<ListingWithCategory[]>([]);
  const [shops, setShops] = useState<Pick<Shop, 'id' | 'name' | 'slug' | 'description' | 'location' | 'rating' | 'is_verified' | 'created_at'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'products' | 'shops'>(categorySlug === 'shops' ? 'shops' : 'products');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(categorySlug);
  const [condition, setCondition] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [location, setLocation] = useState(locationParam || '');
  const [liveSearch, setLiveSearch] = useState(sanitizeSearchTerm(searchQuery || ''));
  const [debouncedSearch, setDebouncedSearch] = useState(sanitizeSearchTerm(searchQuery || ''));
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then((res) => {
      setCategories(res.data || []);
    });
    supabase.from('listings').select('location').then((res) => {
      const locs = [...new Set((res.data || [])
        .map((row) => row.location)
        .filter((value): value is string => Boolean(value)))].sort();
      if (locs.length) setAllLocations([...new Set([...LOCATION_NAMES, ...locs])]);
    });
  }, []);

  useEffect(() => {
    setViewMode(categorySlug === 'shops' ? 'shops' : 'products');
    setSelectedCategory(categorySlug === 'shops' ? undefined : categorySlug);
  }, [categorySlug]);
  useEffect(() => setLocation(locationParam || ''), [locationParam]);

  // Debounce live search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(sanitizeSearchTerm(liveSearch)), 300);
  }, [liveSearch]);

  useEffect(() => {
    if (viewMode !== 'products' || debouncedSearch.length < 3) return;
    const timer = window.setTimeout(() => {
      void supabase.functions.invoke('track-search', {
        body: {
          term: debouncedSearch,
          categorySlug: selectedCategory || '',
          visitorId: getSearchVisitorId(),
        },
      }).then(({ error }) => {
        if (error) console.error('Could not record marketplace search trend data.', error);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, selectedCategory, viewMode]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    let categoryId: string | null = null;
    if (selectedCategory) {
      const { data: cat } = await supabase.from('categories').select('id').eq('slug', selectedCategory).maybeSingle();
      categoryId = cat?.id || null;
    }
    const buildQuery = (withPromotions: boolean) => {
      let query = supabase
        .from('listings')
        .select('*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at)')
        .eq('status', 'active');
      if (categoryId) query = query.eq('category_id', categoryId);
      if (condition !== 'all') query = query.eq('condition', condition);
      if (location) query = query.ilike('location', `%${sanitizeSearchTerm(location)}%`);
      const minPriceValue = Number(minPrice);
      const maxPriceValue = Number(maxPrice);
      if (minPrice && Number.isFinite(minPriceValue) && minPriceValue >= 0) query = query.gte('price', minPriceValue);
      if (maxPrice && Number.isFinite(maxPriceValue) && maxPriceValue >= 0) query = query.lte('price', maxPriceValue);
      if (debouncedSearch) {
        query = query.or(buildPostgrestOrFilter(['title', 'description'], debouncedSearch));
      }
      if (withPromotions) {
        query = query.order('promoted_until', { ascending: false, nullsFirst: false });
      }
      switch (sortBy) {
        case 'oldest': query = query.order('created_at', { ascending: true }); break;
        case 'price_low': query = query.order('price', { ascending: true }); break;
        case 'price_high': query = query.order('price', { ascending: false }); break;
        default: query = query.order('created_at', { ascending: false });
      }
      return query.limit(60);
    };

    let { data, error } = await buildQuery(true);
    if (error && isPromotionSchemaUnavailable(error)) {
      console.warn('Promotion schema is not deployed; showing organic browse results until the migration is applied.');
      ({ data, error } = await buildQuery(false));
    }
    if (error) {
      console.error('Could not load marketplace listings.', error);
      setLoadError('Could not load products. Please try again.');
    }
    setListings((data || []) as unknown as ListingWithCategory[]);
    setLoading(false);
  }, [selectedCategory, condition, sortBy, minPrice, maxPrice, location, debouncedSearch]);

  useEffect(() => {
    if (viewMode === 'products') void fetchListings();
  }, [fetchListings, viewMode]);

  useEffect(() => {
    if (viewMode !== 'shops') return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from('shops')
      .select('id, name, slug, description, location, rating, is_verified, created_at')
      .order('created_at', { ascending: false });
    if (debouncedSearch) {
      query = query.or(buildPostgrestOrFilter(['name', 'description'], debouncedSearch));
    }
    if (location) query = query.ilike('location', `%${sanitizeSearchTerm(location)}%`);
    void query.limit(60).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Could not load marketplace shops.', error);
        setLoadError('Could not load shops. Please try again.');
      }
      setShops(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [debouncedSearch, location, viewMode]);

  const activeCategoryName = viewMode === 'shops' ? 'Shops' : categories.find((c) => c.slug === selectedCategory)?.name;
  const hasActiveFilters = condition !== 'all' || minPrice || maxPrice || location;

  const clearFilters = () => {
    setCondition('all');
    setMinPrice('');
    setMaxPrice('');
    setLocation('');
    setSelectedCategory(undefined);
    navigate({ name: 'browse', search: debouncedSearch || undefined });
  };

  const filtersPanel = (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-semibold text-ink-700 block mb-2">Category</label>
        <select
          value={selectedCategory || ''}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedCategory(val || undefined);
            if (val) navigate({ name: 'category', slug: val });
            else navigate({ name: 'browse', search: debouncedSearch || undefined });
          }}
          className="w-full h-10 px-3 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 bg-white"
        >
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-700 block mb-2">Location</label>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full h-10 px-3 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 bg-white"
        >
          <option value="">All Nigeria</option>
          {allLocations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
        </select>
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-700 block mb-2">Condition</label>
        <div className="space-y-1.5">
          {conditionOptions.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
              <input type="radio" name="condition" value={opt.value} checked={condition === opt.value} onChange={(e) => setCondition(e.target.value)} className="w-4 h-4 accent-brand-500" />
              <span className="text-sm text-ink-600 group-hover:text-ink-900">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-ink-700 block mb-2">Price Range (₦)</label>
        <div className="flex items-center gap-2">
          <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500" />
          <span className="text-ink-400">—</span>
          <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500" />
        </div>
      </div>

      {hasActiveFilters && (
        <button onClick={clearFilters} className="text-sm font-semibold text-red-500 hover:text-red-600 flex items-center gap-1">
          <X className="w-4 h-4" /> Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <div className="text-sm text-ink-500 mb-1">
          <button onClick={() => navigate({ name: 'home' })} className="hover:text-brand-600">Home</button>
          <span className="mx-1.5">/</span>
          <span className="text-ink-700">{activeCategoryName || 'All Products'}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-900">
          {debouncedSearch ? `Results for "${debouncedSearch}"` : activeCategoryName || 'All Products'}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          {loading ? 'Loading...' : viewMode === 'shops' ? `${shops.length} shop${shops.length !== 1 ? 's' : ''} found` : `${listings.length} item${listings.length !== 1 ? 's' : ''} found`}
        </p>
      </div>

      <div className="mb-5 inline-flex rounded-xl bg-ink-100 p-1" aria-label="Browse type">
        <button
          type="button"
          onClick={() => { setViewMode('products'); setSelectedCategory(undefined); navigate({ name: 'browse', search: debouncedSearch || undefined }); }}
          aria-pressed={viewMode === 'products'}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${viewMode === 'products' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600'}`}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => { setViewMode('shops'); setSelectedCategory(undefined); navigate({ name: 'category', slug: 'shops' }); }}
          aria-pressed={viewMode === 'shops'}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${viewMode === 'shops' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-600'}`}
        >
          Shops
        </button>
      </div>

      {/* Live search bar */}
      <div className="relative flex items-center mb-5 max-w-xl">
        <Search className="absolute left-4 w-4 h-4 text-ink-400" />
        <input
          type="text"
          value={liveSearch}
          onChange={(e) => setLiveSearch(e.target.value)}
          placeholder="Refine results as you type..."
          className="w-full h-11 pl-10 pr-9 rounded-xl border border-ink-200 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 bg-white"
        />
        {liveSearch && (
          <button onClick={() => setLiveSearch('')} className="absolute right-3 text-ink-400 hover:text-ink-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loadError && viewMode === 'products' && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
      {viewMode === 'products' ? (
        <div className="flex gap-6">
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-32 rounded-2xl border border-ink-100 bg-white p-5">
              <h3 className="mb-5 flex items-center gap-2 font-bold text-ink-900">
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </h3>
              {filtersPanel}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700"
              >
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </button>
              <div className="relative flex-1">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full appearance-none rounded-full border border-ink-200 bg-white px-4 py-2 pr-9 text-sm font-semibold text-ink-700 focus:outline-none">
                  {sortOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              </div>
            </div>
            {showFilters && (
              <div className="mb-4 rounded-2xl border border-ink-100 bg-white p-5 lg:hidden">{filtersPanel}</div>
            )}
            <div className="mb-4 hidden items-center justify-between lg:flex">
              <p className="flex items-center gap-1.5 text-xs text-ink-400">
                <Store className="h-3.5 w-3.5" /> Products from real ShopSharp shops
              </p>
              <div className="relative">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="appearance-none rounded-full border border-ink-200 bg-white px-4 py-2 pr-9 text-sm font-semibold text-ink-700 focus:outline-none">
                  {sortOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              </div>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-ink-50" />)}
              </div>
            ) : listings.length === 0 ? (
              <div className="py-20 text-center">
                <Search className="mx-auto mb-4 h-16 w-16 text-ink-200" />
                <p className="font-medium text-ink-500">No products match your search.</p>
                <button onClick={clearFilters} className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-700">Clear filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <section aria-label="Shop results">
          {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-ink-100" />)}
            </div>
          ) : shops.length === 0 ? (
            <div className="rounded-2xl bg-white py-16 text-center text-ink-500">No shops found. Try another search.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  type="button"
                  onClick={() => navigate({ name: 'shop', slug: shop.slug })}
                  className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-md"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-extrabold text-white">{shop.name.charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-bold text-ink-900">
                      <span className="truncate">{shop.name}</span>
                      {shop.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" />}
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-500">{shop.location} · ★ {shop.rating}</span>
                    <span className="mt-1 block line-clamp-2 text-xs text-ink-600">{shop.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
