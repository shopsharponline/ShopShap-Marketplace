export function ShimmerCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-ink-100">
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
        <div className="absolute inset-0 shimmer" />
      </div>
      <div className="p-3.5 space-y-2.5">
        <div className="relative h-5 w-2/3 rounded bg-ink-100 overflow-hidden">
          <div className="absolute inset-0 shimmer" />
        </div>
        <div className="relative h-4 w-full rounded bg-ink-100 overflow-hidden">
          <div className="absolute inset-0 shimmer" style={{ animationDelay: '0.15s' }} />
        </div>
      </div>
    </div>
  );
}

export function ShimmerGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <ShimmerCard key={i} />)}
    </div>
  );
}
