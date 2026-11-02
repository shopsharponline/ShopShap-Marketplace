import { useEffect } from 'react';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type PageMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  image?: string;
  robots?: string;
  type?: 'website' | 'product';
  schema?: Record<string, unknown> | Record<string, unknown>[];
};

export const SITE_URL = 'https://shopsharp.com.ng';
export const DEFAULT_SHARE_IMAGE = `${SITE_URL}/shopsharp-yaba-market-hero.png`;

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export default function SeoHead({ metadata }: { metadata: PageMetadata }) {
  const schemaJson = metadata.schema ? JSON.stringify(metadata.schema) : '';

  useEffect(() => {
    const url = new URL(metadata.canonicalPath, SITE_URL).toString();
    const image = metadata.image || DEFAULT_SHARE_IMAGE;

    document.title = metadata.title;
    setMeta('name', 'description', metadata.description);
    setMeta('name', 'robots', metadata.robots || 'index, follow');
    setMeta('property', 'og:type', metadata.type || 'website');
    setMeta('property', 'og:site_name', 'ShopSharp');
    setMeta('property', 'og:title', metadata.title);
    setMeta('property', 'og:description', metadata.description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', metadata.title);
    setMeta('name', 'twitter:description', metadata.description);
    setMeta('name', 'twitter:image', image);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    let schema = document.getElementById('shopsharp-page-schema');
    if (schemaJson) {
      if (!schema) {
        schema = document.createElement('script');
        schema.id = 'shopsharp-page-schema';
        schema.setAttribute('type', 'application/ld+json');
        document.head.appendChild(schema);
      }
      schema.textContent = schemaJson;
    } else {
      schema?.remove();
    }
  }, [
    metadata.canonicalPath,
    metadata.description,
    metadata.image,
    metadata.robots,
    metadata.title,
    metadata.type,
    schemaJson,
  ]);

  return null;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length < 2) return null;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: new URL(item.href, SITE_URL).toString() } : {}),
    })),
  };

  return (
    <>
      <script type="application/ld+json">{JSON.stringify(itemList)}</script>
      <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-7xl px-4 pt-4 text-sm text-ink-500 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {item.href && index < items.length - 1 ? (
                <a className="hover:text-brand-700 hover:underline" href={item.href}>{item.label}</a>
              ) : (
                <span aria-current="page" className={index === items.length - 1 ? 'font-medium text-ink-700' : ''}>
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
