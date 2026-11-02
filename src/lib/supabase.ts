import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  created_at: string;
};

export type Plan = {
  id: string;
  name: string;
  display_name: string;
  price_naira: number;
  product_limit: number;
  boosts_per_month: number;
  verified_badge: boolean;
  boost: boolean;
  analytics: boolean;
};

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  sms_notifications_enabled: boolean;
  sms_notifications_consent_at: string | null;
  is_admin: boolean;
  created_at: string;
};

export type Shop = {
  id: string;
  owner_id: string | null;
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  banner_url: string | null;
  location: string;
  rating: number;
  is_verified: boolean;
  plan_id: string | null;
  created_at: string;
};

export type ShopWithPlan = Shop & { plan: Plan | null };

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category_id: string;
  location: string;
  delivery_coverage: 'nationwide' | 'pickup';
  image_url: string | null;
  images: string[];
  condition: string;
  seller_name: string;
  seller_phone: string | null;
  status: string;
  shop_id: string | null;
  promoted_until?: string | null;
  created_at: string;
};

export type ListingWithCategory = Listing & {
  category: { name: string; slug: string } | null;
  shop: { id: string; name: string; slug: string; is_verified: boolean; created_at: string } | null;
};

export type Conversation = {
  id: string;
  buyer_id: string;
  shop_id: string | null;
  listing_id: string | null;
  last_message_at: string;
  buyer_last_read_at: string;
  shop_last_read_at: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type VerificationRequest = {
  id: string;
  shop_id: string;
  status: string;
  note: string;
  nin_number: string;
  nin_image_url: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
};
