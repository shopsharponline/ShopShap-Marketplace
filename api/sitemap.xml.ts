import { createClient } from '@supabase/supabase-js';

type RequestLike = {
  method?: string;
};

type ResponseLike = {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  send(body: string): void;
};

type ShopRow = {
  slug: string;
  created_at: string | null;
};

type ListingRow = {
  id: string;
  title: string;
  created_at: string | null;
};

type CategoryRow = {
  slug: string;
};

const siteUrl = 'https://shopsharp.com.ng';
const pageSize = 1000;

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function productUrlForListing(title: string, id: string) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'product';

  return `${siteUrl}/product/${slug}-${id}`;
}

export default async function sitemapHandler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Content-Type', 'application/xml; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.status(405).send('Method not allowed.');
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Sitemap generation is missing the public Supabase configuration.');
    response.status(500).send('Sitemap is temporarily unavailable.');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const shops: ShopRow[] = [];
  const listings: ListingRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('shops')
      .select('slug, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Could not load shops for the sitemap.', error);
      response.status(500).send('Sitemap is temporarily unavailable.');
      return;
    }

    const page = (data || []) as ShopRow[];
    shops.push(...page);
    if (page.length < pageSize) break;
  }

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Could not load active listings for the sitemap.', error);
      response.status(500).send('Sitemap is temporarily unavailable.');
      return;
    }

    const page = (data || []) as ListingRow[];
    listings.push(...page);
    if (page.length < pageSize) break;
  }

  const { data: categoriesData, error: categoriesError } = await supabase
    .from('categories')
    .select('slug')
    .order('name');

  if (categoriesError) {
    console.error('Could not load categories for the sitemap.', categoriesError);
    response.status(500).send('Sitemap is temporarily unavailable.');
    return;
  }

  const categories = (categoriesData || []) as CategoryRow[];
  const shopUrls = shops.map((shop) => {
    const location = escapeXml(`${siteUrl}/shop/${encodeURIComponent(shop.slug)}`);
    const lastmod = shop.created_at
      ? `\n    <lastmod>${escapeXml(new Date(shop.created_at).toISOString())}</lastmod>`
      : '';
    return `  <url>\n    <loc>${location}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  });
  const listingUrls = listings.map((listing) => {
    const location = escapeXml(productUrlForListing(listing.title, listing.id));
    const lastmod = listing.created_at
      ? `\n    <lastmod>${escapeXml(new Date(listing.created_at).toISOString())}</lastmod>`
      : '';
    return `  <url>\n    <loc>${location}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
  });
  const categoryUrls = categories.map((category) => {
    const location = escapeXml(`${siteUrl}/category/${encodeURIComponent(category.slug)}`);
    return `  <url>\n    <loc>${location}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>`;
  });
  const urls = [
    `  <url>\n    <loc>${siteUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${siteUrl}/browse</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${siteUrl}/become-a-seller</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
    ...categoryUrls,
    ...shopUrls,
    ...listingUrls,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

  response.status(200).send(request.method === 'HEAD' ? '' : xml);
}
