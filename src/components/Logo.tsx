import BagMark from '@/components/BagMark';

export default function Logo({ light = false, size = 'md' }: { light?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' };
  const markSizes = { sm: 'w-7 h-7', md: 'w-8 h-8', lg: 'w-10 h-10' };
  return (
    <span className="flex items-center gap-2 select-none">
      <BagMark className={markSizes[size]} />
      <span className={`${sizes[size]} font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>
        Shop<span className="text-brand-500">Sharp</span>
      </span>
    </span>
  );
}
