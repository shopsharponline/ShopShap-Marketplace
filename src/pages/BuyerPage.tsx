import { useEffect, useState } from 'react';
import { Heart, Eye, ArrowRight } from 'lucide-react';
import { supabase, type ListingWithCategory } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { navigate } from '@/lib/router';
import ListingCard from '@/components/ListingCard';

type Tab = 'wishlist' | 'recent';
type ListingRelationRow = { listing: ListingWithCategory | ListingWithCategory[] | null };

export default function BuyerPage({ tab: initialTab }: { tab: Tab }) {
  const { user, loading: authLoading } = useAuth();
  const [wishlist, setWishlist] = useState<ListingWithCategory[]>([]);
  const [recent, setRecent] = useState<ListingWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showAllRecent, setShowAllRecent] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const [wlRes, rvRes] = await Promise.all([
        supabase
          .from('wishlist')
          .select('listing:listings(*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at))')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('recently_viewed')
          .select('viewed_at, listing:listings(*, category:categories(name, slug), shop:shops(id, name, slug, is_verified, created_at))')
          .eq('user_id', user.id)
          .order('viewed_at', { ascending: false })
          .limit(12),
      ]);

      setWishlist(
        ((wlRes.data || []) as ListingRelationRow[])
          .flatMap((r) => (Array.isArray(r.listing) ? r.listing : r.listing ? [r.listing] : []))
      );
      setRecent(
        ((rvRes.data || []) as ListingRelationRow[])
          .flatMap((r) => (Array.isArray(r.listing) ? r.listing : r.listing ? [r.listing] : []))
      );
      setLoading(false);
    })();
  }, [user]);

  const removeWishlist = async (listingId: string) => {
    if (!user) return;
    await supabase.from('wishlist').delete().eq('user_id', user.id).eq('listing_id', listingId);
    setWishlist((prev) => prev.filter((l) => l.id !== listingId));
  };

  if (!authLoading && !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Heart className="w-14 h-14 mx-auto mb-4 text-brand-500" />
        <h1 className="text-2xl font-extrabold text-ink-900 mb-2">Your account</h1>
        <p className="text-ink-500 mb-6">Sign in to see your wishlist and recently viewed products.</p>
        <button onClick={() => navigate({ name: 'signin' })} className="bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600">Sign in</button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Heart }[] = [
    { key: 'wishlist', label: 'Wishlist', icon: Heart },
    { key: 'recent', label: 'Recently Viewed', icon: Eye },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-extrabold text-ink-900 mb-6">My Account</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-ink-100 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key === 'wishlist') navigate({ name: 'wishlist' });
              setActiveTab(t.key);
            }}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            {t.key === 'wishlist' && wishlist.length > 0 && <span className="bg-brand-100 text-brand-700 text-xs px-1.5 rounded-full">{wishlist.length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-ink-50 rounded-2xl animate-pulse aspect-[3/4]" />)}
        </div>
      ) : (
        <>
          {/* WISHLIST */}
          {activeTab === 'wishlist' && (
            wishlist.length === 0 ? (
              <div className="text-center py-16">
                <Heart className="w-14 h-14 mx-auto mb-4 text-ink-200" />
                <p className="text-ink-600 font-semibold mb-1">Your wishlist is empty</p>
                <p className="text-sm text-ink-400 mb-5">Tap the heart on any product to save it for later.</p>
                <button onClick={() => navigate({ name: 'browse' })} className="bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-600 text-sm">Discover products</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {wishlist.map((listing) => (
                  <div key={listing.id} className="relative">
                    <ListingCard listing={listing} saved onToggleSave={removeWishlist} />
                  </div>
                ))}
              </div>
            )
          )}

          {/* RECENTLY VIEWED */}
          {activeTab === 'recent' && (
            recent.length === 0 ? (
              <div className="text-center py-16">
                <Eye className="w-14 h-14 mx-auto mb-4 text-ink-200" />
                <p className="text-ink-600 font-semibold mb-1">Nothing viewed yet</p>
                <p className="text-sm text-ink-400 mb-5">Products you open will appear here for quick access.</p>
                <button onClick={() => navigate({ name: 'browse' })} className="bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-600 text-sm">Browse products</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {recent.slice(0, showAllRecent ? recent.length : 8).map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
                {recent.length > 8 && (
                  <button
                    onClick={() => setShowAllRecent((current) => !current)}
                    className="mt-6 mx-auto flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    {showAllRecent ? 'View fewer' : 'View more'} <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
