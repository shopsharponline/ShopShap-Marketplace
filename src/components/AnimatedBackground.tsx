// Slow-moving blurred blobs + drifting dot grid. Pure CSS animations.
export function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0 dot-grid"
        style={{
          backgroundImage: 'radial-gradient(rgba(0,166,81,0.10) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-brand-400/15 blur-3xl blob-drift-a" />
      <div className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-brand-500/10 blur-3xl blob-drift-b" />
      <div className="absolute -bottom-40 left-1/3 w-[380px] h-[380px] rounded-full bg-emerald-300/15 blur-3xl blob-drift-c" />
    </div>
  );
}
