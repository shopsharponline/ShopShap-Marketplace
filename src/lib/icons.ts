import {
  Car, Smartphone, Monitor, Shirt, Sparkles, Sofa, Footprints,
  ShoppingBasket, Baby, Dumbbell, Wrench, Store, ShoppingBag,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Car, Smartphone, Monitor, Shirt, Sparkles, Sofa, Footprints,
  ShoppingBasket, Baby, Dumbbell, Wrench, Store,
};

export function getIcon(name: string): LucideIcon {
  return iconMap[name] || ShoppingBag;
}
