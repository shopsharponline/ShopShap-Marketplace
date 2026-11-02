import { BadgeCheck, Crown, Star } from 'lucide-react';
import { getLoyalty } from '@/lib/badges';

export function LoyaltyChip({ createdAt, dark = false }: { createdAt?: string | null; dark?: boolean }) {
  const loyalty = getLoyalty(createdAt);
  if (!loyalty.tier) return null;
  const isVvip = loyalty.tier === 'vvip';
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
        isVvip
          ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-ink-900'
          : dark
            ? 'bg-white/15 text-amber-300 border border-amber-300/40'
            : 'bg-amber-100 text-amber-700 border border-amber-200'
      }`}
      title={`${loyalty.years.toFixed(0)}+ years on ShopSharp`}
    >
      {isVvip ? <Crown className="w-2.5 h-2.5" /> : <Star className="w-2.5 h-2.5" />}
      {loyalty.label}
    </span>
  );
}

export default function LoyaltyBadge({
  createdAt,
  isVerified,
  dark = false,
}: {
  createdAt?: string | null;
  isVerified?: boolean;
  dark?: boolean;
}) {
  return (
    <>
      {isVerified && <BadgeCheck className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-brand-400' : 'text-brand-500'}`} />}
      <LoyaltyChip createdAt={createdAt} dark={dark} />
    </>
  );
}
