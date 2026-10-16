import { SITE, SOCIAL, absoluteUrl } from '../config/site';

/**
 * JSON-LD builders. We only emit facts we actually know: no fabricated ratings, reviews,
 * addresses or Offer markup for products we do not sell.
 */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    url: `${SITE.url}/`,
    logo: absoluteUrl('/logo-512.png'),
    ...(SOCIAL.length ? { sameAs: SOCIAL.map((entry) => entry.url) } : {}),
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    url: `${SITE.url}/`,
    inLanguage: 'tr-TR',
    publisher: { '@id': `${SITE.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/arama/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function itemListJsonLd(name: string, items: readonly { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(item.path),
      name: item.name,
    })),
  };
}

export function articleJsonLd(input: {
  title: string;
  description: string;
  path: string;
  publishedAt: Date;
  updatedAt?: Date | undefined;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    mainEntityOfPage: absoluteUrl(input.path),
    datePublished: input.publishedAt.toISOString(),
    dateModified: (input.updatedAt ?? input.publishedAt).toISOString(),
    inLanguage: 'tr-TR',
    image: absoluteUrl('/og/default.png'),
    author: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/` },
    publisher: { '@id': `${SITE.url}/#organization` },
  };
}
