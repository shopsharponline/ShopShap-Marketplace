import { createClient } from '@supabase/supabase-js';

type RequestLike = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  send(body: string): void;
};

type ListingShareRow = {
  title: string;
  description: string;
  image_url: string | null;
  images: string[] | null;
};

const siteUrl = 'https://shopsharp.com.ng';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function productSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'product';
}

export default async function productShareHandler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.status(405).send('Method not allowed.');
    return;
  }

  const rawProduct = request.query.product;
  const productPath = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;
  const id = productPath?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i)?.[1];
  if (!id) {
    response.status(404).send('Product not found.');
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Product sharing metadata is missing the public Supabase configuration.');
    response.status(500).send('Product preview is temporarily unavailable.');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('listings')
    .select('title, description, image_url, images')
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Could not load a listing for its share preview.', error);
    response.status(500).send('Product preview is temporarily unavailable.');
    return;
  }
  if (!data) {
    response.status(404).send('Product not found.');
    return;
  }

  const listing = data as ListingShareRow;
  const title = `${listing.title} | ShopSharp`;
  const description = listing.description.slice(0, 160);
  const imagePath = listing.image_url || listing.images?.[0];
  const image = imagePath ? new URL(imagePath, siteUrl).toString() : `${siteUrl}/shopsharp-yaba-market-hero.png`;
  const canonicalPath = `/product/${productSlug(listing.title)}-${id}`;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonicalUrl)}"><meta property="og:type" content="product"><meta property="og:site_name" content="ShopSharp"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}"><meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(image)}"></head><body><h1>${escapeHtml(listing.title)}</h1><p>${escapeHtml(description)}</p><a href="${escapeHtml(canonicalUrl)}">View this product on ShopSharp</a></body></html>`;
  response.status(200).send(request.method === 'HEAD' ? '' : html);
}
