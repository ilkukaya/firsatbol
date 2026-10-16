import { getCollection } from 'astro:content';
import { CATEGORIES } from '../config/categories';
import { getDeals } from './deals/repository';
import { categoryCityCombos } from './deals/pages';
import { MIN_CITY_INDEX, categoryCounts, citiesWithDeals } from './deals/taxonomy';

export interface SitemapEntry {
  path: string;
  lastmod?: string;
}

/** Every indexable URL — the same rules as the pages' robots meta (noindex pages are excluded). */
export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const { deals, generatedAt, fixtureMode } = await getDeals();
  if (fixtureMode) return [];
  const day = generatedAt.slice(0, 10);
  const entries: SitemapEntry[] = [{ path: '/', lastmod: day }];
  if (deals.length > 0) entries.push({ path: '/firsatlar/', lastmod: day }, { path: '/sehirler/', lastmod: day });

  const counts = categoryCounts(deals);
  for (const category of CATEGORIES)
    if ((counts.get(category.slug) ?? 0) > 0) entries.push({ path: `/kategori/${category.slug}/`, lastmod: day });
  for (const combo of categoryCityCombos(deals)) entries.push({ path: `/kategori/${combo.category}/${combo.city}/`, lastmod: day });
  for (const city of citiesWithDeals(deals)) if (city.count >= MIN_CITY_INDEX) entries.push({ path: `/sehir/${city.slug}/`, lastmod: day });
  for (const deal of deals) if (deal.indexable) entries.push({ path: `/firsat/${deal.slug}/`, lastmod: deal.lastCheckedAt.slice(0, 10) });

  const guides = await getCollection('guides', (entry) => !entry.data.draft);
  entries.push({
    path: '/rehber/',
    lastmod:
      guides
        .map((g) => (g.data.updatedAt ?? g.data.publishedAt).toISOString().slice(0, 10))
        .sort()
        .at(-1) ?? day,
  });
  for (const guide of guides)
    entries.push({ path: `/rehber/${guide.id}/`, lastmod: (guide.data.updatedAt ?? guide.data.publishedAt).toISOString().slice(0, 10) });

  for (const page of await getCollection('pages'))
    entries.push({ path: `/${page.id}/`, lastmod: page.data.updatedAt.toISOString().slice(0, 10) });
  entries.push({ path: '/iletisim/' }, { path: '/bulten/' });
  return entries;
}
