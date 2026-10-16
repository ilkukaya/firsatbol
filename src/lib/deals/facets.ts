import { slugify } from '../slug';
import type { Deal } from './schema';
import { sortEntries, toIndexEntry } from './query';

/**
 * District and tag ("alt kategori") facets, derived from the data every deal already carries
 * (`district` and `tags` from the provider). No extra API calls are needed: the partner's
 * townId/tagIds queries only filter the same catalog.
 *
 * Pages are generated only above a minimum size and indexed only above a higher one, so the
 * site never publishes hundreds of near-empty combinations.
 */
export const FACET_MIN_PAGE = 3;
export const FACET_MIN_INDEX = 5;
export const TAG_MIN_PAGE = 5;
export const TAG_MIN_INDEX = 8;
export const CITY_TAG_MIN_PAGE = 4;
export const FACET_PAGE_LIMIT = 60;

export interface Facet {
  slug: string;
  name: string;
  deals: Deal[];
}

export interface DistrictFacet extends Facet {
  citySlug: string;
  cityName: string;
}

export function tagSlug(tag: string): string {
  return slugify(tag, 60);
}

/** "köpük masajı" → "Köpük masajı" (Turkish-aware capitalisation). */
export function tagLabel(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.charAt(0).toLocaleUpperCase('tr-TR') + trimmed.slice(1);
}

function ordered(deals: readonly Deal[]): Deal[] {
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  return sortEntries(deals.map(toIndexEntry)).map((entry) => byId.get(entry.id)!);
}

/** All tags with their deals (most used first). */
export function tagFacets(deals: readonly Deal[], min = TAG_MIN_PAGE): Facet[] {
  const map = new Map<string, { names: Map<string, number>; deals: Deal[] }>();
  for (const deal of deals) {
    const seen = new Set<string>();
    for (const tag of deal.tags) {
      const slug = tagSlug(tag);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const entry = map.get(slug) ?? { names: new Map<string, number>(), deals: [] as Deal[] };
      entry.names.set(tag.toLocaleLowerCase('tr-TR'), (entry.names.get(tag.toLocaleLowerCase('tr-TR')) ?? 0) + 1);
      entry.deals.push(deal);
      map.set(slug, entry);
    }
  }
  return [...map.entries()]
    .filter(([, entry]) => entry.deals.length >= min)
    .map(([slug, entry]) => ({
      slug,
      name: tagLabel([...entry.names.entries()].sort((a, b) => b[1] - a[1])[0]![0]),
      deals: ordered(entry.deals),
    }))
    .sort((a, b) => b.deals.length - a.deals.length || a.name.localeCompare(b.name, 'tr'));
}

/** Districts of every city (by the provider's `town` value). */
export function districtFacets(deals: readonly Deal[], min = FACET_MIN_PAGE): DistrictFacet[] {
  const map = new Map<string, DistrictFacet>();
  for (const deal of deals) {
    if (!deal.citySlug || !deal.city || !deal.district) continue;
    const slug = slugify(deal.district, 60);
    if (!slug) continue;
    const key = `${deal.citySlug}/${slug}`;
    const entry = map.get(key) ?? { slug, name: deal.district, citySlug: deal.citySlug, cityName: deal.city, deals: [] };
    entry.deals.push(deal);
    map.set(key, entry);
  }
  return [...map.values()]
    .filter((facet) => facet.deals.length >= min)
    .map((facet) => ({ ...facet, deals: ordered(facet.deals) }))
    .sort((a, b) => b.deals.length - a.deals.length);
}

export interface CityFacetPage {
  kind: 'district' | 'tag';
  citySlug: string;
  cityName: string;
  slug: string;
  name: string;
  deals: Deal[];
}

/**
 * Second-level pages under /sehir/<city>/<segment>/: districts and city × tag pages share the
 * segment namespace; a district always wins over a tag with the same slug.
 */
export function citySegmentPages(deals: readonly Deal[]): CityFacetPage[] {
  const pages: CityFacetPage[] = districtFacets(deals).map((facet) => ({ kind: 'district', ...facet }));
  const taken = new Set(pages.map((page) => `${page.citySlug}/${page.slug}`));
  const cities = new Map<string, { name: string; deals: Deal[] }>();
  for (const deal of deals) {
    if (!deal.citySlug || !deal.city) continue;
    const entry = cities.get(deal.citySlug) ?? { name: deal.city, deals: [] };
    entry.deals.push(deal);
    cities.set(deal.citySlug, entry);
  }
  for (const [citySlug, city] of cities) {
    for (const tag of tagFacets(city.deals, CITY_TAG_MIN_PAGE)) {
      const key = `${citySlug}/${tag.slug}`;
      if (taken.has(key)) continue;
      taken.add(key);
      pages.push({ kind: 'tag', citySlug, cityName: city.name, slug: tag.slug, name: tag.name, deals: tag.deals });
    }
  }
  return pages;
}

export interface DistrictTagPage {
  citySlug: string;
  cityName: string;
  districtSlug: string;
  districtName: string;
  slug: string;
  name: string;
  deals: Deal[];
}

/** /sehir/<city>/<district>/<tag>/ pages, e.g. Kadıköy › masaj. */
export function districtTagPages(deals: readonly Deal[]): DistrictTagPage[] {
  return districtFacets(deals).flatMap((district) =>
    tagFacets(district.deals, FACET_MIN_PAGE).map((tag) => ({
      citySlug: district.citySlug,
      cityName: district.cityName,
      districtSlug: district.slug,
      districtName: district.name,
      slug: tag.slug,
      name: tag.name,
      deals: tag.deals,
    })),
  );
}

/** Top tags among a set of deals that have their own page under `base`. */
export function topTagLinks(
  deals: readonly Deal[],
  available: ReadonlySet<string>,
  limit = 16,
): { slug: string; name: string; count: number }[] {
  return tagFacets(deals, 1)
    .filter((tag) => available.has(tag.slug))
    .slice(0, limit)
    .map((tag) => ({ slug: tag.slug, name: tag.name, count: tag.deals.length }));
}

// ---------------------------------------------------------------------------
// Build-time memoisation (the same deal array is shared by every page of a build)
// ---------------------------------------------------------------------------
const memo = new WeakMap<readonly Deal[], Map<string, unknown>>();
export function memoized<T>(deals: readonly Deal[], key: string, compute: () => T): T {
  let entry = memo.get(deals);
  if (!entry) {
    entry = new Map();
    memo.set(deals, entry);
  }
  if (!entry.has(key)) entry.set(key, compute());
  return entry.get(key) as T;
}

export const facetsOf = (deals: readonly Deal[]) => ({
  tags: memoized(deals, 'tags', () => tagFacets(deals)),
  districts: memoized(deals, 'districts', () => districtFacets(deals)),
  citySegments: memoized(deals, 'citySegments', () => citySegmentPages(deals)),
  districtTags: memoized(deals, 'districtTags', () => districtTagPages(deals)),
});
