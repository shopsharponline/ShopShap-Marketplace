export type Loyalty = { tier: 'vvip' | 'vip' | null; label: string; years: number };

export function getLoyalty(createdAt: string | undefined | null): Loyalty {
  if (!createdAt) return { tier: null, label: '', years: 0 };
  const years = (Date.now() - new Date(createdAt).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years >= 6) return { tier: 'vvip', label: 'VVIP', years };
  if (years >= 3) return { tier: 'vip', label: 'VIP', years };
  return { tier: null, label: '', years };
}
