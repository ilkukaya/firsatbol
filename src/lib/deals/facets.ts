import { isKnownDistrict } from '../../config/districts';
import { ROOT_TOPICS, TOPICS, type FlatTopic } from '../../config/taxonomy';
import { slugify } from '../slug';
import type { Deal } from './schema';
import { sortEntries, toIndexEntry } from './query';

/**
 * District and tag ("alt kategori") facets, derived from the data every deal already carries
 * (`district` and `tags` from the provider). No extra API calls are needed: the partner's
 * townId/tagIds queries only filter the same catalog.
 *
 * Sub-categories are the partner's category tree (`src/config/taxonomy.ts`, memberships in
 * `deal.topics`) plus every other provider tag; a tree node wins over a tag with the same slug.
 *
 * Pages are generated only above a minimum size and indexed only above a higher one, so the
 * site never publishes hundreds of near-empty combinations.
 */
export const FACET_MIN_PAGE = 3;
/** Every category-tree node and every district with at least one deal gets its page (noindex while thin). */
export const TOPIC_MIN_PAGE = 1;
export const DISTRICT_MIN_PAGE = 1;
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

/** A sub-category: a category-tree node (`topic`) or a plain provider tag (`topic: null`). */
export interface SubFacet extends Facet {
  topic: FlatTopic | null;
}

export interface LinkItem {
  href: string;
  label: string;
  count: number;
}

export interface LinkGroup {
  title: string;
  items: LinkItem[];
}

/** Türkiye-wide sub-category pages: tree nodes are curated, so they index earlier than raw tags. */
export function subFacetIndexable(facet: SubFacet): boolean {
  return facet.deals.length >= (facet.topic ? FACET_MIN_INDEX : TAG_MIN_INDEX);
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

/** Category-tree nodes with their deals, in tree order. */
export function topicFacets(deals: readonly Deal[], min = TOPIC_MIN_PAGE): SubFacet[] {
  const map = new Map<string, Deal[]>();
  for (const deal of deals) {
    for (const slug of deal.topics) {
      const list = map.get(slug) ?? [];
      list.push(deal);
      map.set(slug, list);
    }
  }
  return [...TOPICS.values()]
    .filter((topic) => (map.get(topic.slug)?.length ?? 0) >= min)
    .map((topic) => ({ slug: topic.slug, name: topic.name, topic, deals: ordered(map.get(topic.slug)!) }));
}

/**
 * The partner's tag text often names a tree node slightly differently ("ulaşım dahil tur" vs the
 * "Ulaşım dahil turlar" node). Such a tag would only duplicate the node's page, so it gets none:
 * ≥ 90 % of its deals belong to one node that it covers to ≥ 60 %.
 */
function duplicatesTopic(tagDeals: readonly Deal[], members: ReadonlyMap<string, number>): boolean {
  const overlap = new Map<string, number>();
  for (const deal of tagDeals) for (const slug of deal.topics) overlap.set(slug, (overlap.get(slug) ?? 0) + 1);
  return [...overlap.entries()].some(
    ([slug, shared]) => shared >= 0.9 * tagDeals.length && shared >= 0.6 * (members.get(slug) ?? Infinity),
  );
}

/** Tree nodes (from `topicMin` deals) and the remaining provider tags (from `tagMin`), largest first. */
export function subcategoryFacets(deals: readonly Deal[], tagMin = TAG_MIN_PAGE, topicMin = TOPIC_MIN_PAGE): SubFacet[] {
  const topics = topicFacets(deals, topicMin);
  const members = topicCounts(deals);
  const tags = tagFacets(deals, tagMin)
    .filter((tag) => !TOPICS.has(tag.slug) && !duplicatesTopic(tag.deals, members))
    .map((tag) => ({ ...tag, topic: null }));
  return [...topics, ...tags].sort((a, b) => b.deals.length - a.deals.length || a.name.localeCompare(b.name, 'tr'));
}

/** Districts of every city (by the provider's `town` value). */
export function districtFacets(deals: readonly Deal[], min = DISTRICT_MIN_PAGE): DistrictFacet[] {
  const map = new Map<string, DistrictFacet>();
  for (const deal of deals) {
    if (!deal.citySlug || !deal.city || !deal.district) continue;
    const slug = slugify(deal.district, 60);
    if (!slug || !isKnownDistrict(deal.citySlug, slug)) continue;
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
  /** Category-tree node of a sub-category page (null for districts and plain tags). */
  topic: FlatTopic | null;
  deals: Deal[];
}

/**
 * Second-level pages under /sehir/<city>/<segment>/: districts and city × tag pages share the
 * segment namespace; a district always wins over a tag with the same slug.
 */
export function citySegmentPages(deals: readonly Deal[]): CityFacetPage[] {
  const pages: CityFacetPage[] = districtFacets(deals).map((facet) => ({ kind: 'district', topic: null, ...facet }));
  const taken = new Set(pages.map((page) => `${page.citySlug}/${page.slug}`));
  const cities = new Map<string, { name: string; deals: Deal[] }>();
  for (const deal of deals) {
    if (!deal.citySlug || !deal.city) continue;
    const entry = cities.get(deal.citySlug) ?? { name: deal.city, deals: [] };
    entry.deals.push(deal);
    cities.set(deal.citySlug, entry);
  }
  for (const [citySlug, city] of cities) {
    for (const tag of subcategoryFacets(city.deals, CITY_TAG_MIN_PAGE)) {
      const key = `${citySlug}/${tag.slug}`;
      if (taken.has(key)) continue;
      taken.add(key);
      pages.push({ kind: 'tag', citySlug, cityName: city.name, slug: tag.slug, name: tag.name, topic: tag.topic, deals: tag.deals });
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
  topic: FlatTopic | null;
  deals: Deal[];
}

/** /sehir/<city>/<district>/<tag>/ pages, e.g. Kadıköy › masaj. */
export function districtTagPages(deals: readonly Deal[]): DistrictTagPage[] {
  return districtFacets(deals).flatMap((district) =>
    subcategoryFacets(district.deals, FACET_MIN_PAGE).map((tag) => ({
      citySlug: district.citySlug,
      cityName: district.cityName,
      districtSlug: district.slug,
      districtName: district.name,
      slug: tag.slug,
      name: tag.name,
      topic: tag.topic,
      deals: tag.deals,
    })),
  );
}

/** Top plain tags (not tree nodes) among a set of deals that have their own page (`available`). */
export function topTagLinks(
  deals: readonly Deal[],
  available: ReadonlySet<string>,
  limit = 16,
): { slug: string; name: string; count: number }[] {
  return tagFacets(deals, 1)
    .filter((tag) => available.has(tag.slug) && !TOPICS.has(tag.slug))
    .slice(0, limit)
    .map((tag) => ({ slug: tag.slug, name: tag.name, count: tag.deals.length }));
}

function topicCounts(deals: readonly Deal[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const deal of deals) for (const slug of deal.topics) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  return counts;
}

/**
 * The category tree within a scope (Türkiye, a city, a district): one group per main category
 * (largest first), the main node followed by its sub-categories in tree order. Only nodes with a
 * page in that scope (`available`) are linked.
 */
export function topicLinkGroups(
  deals: readonly Deal[],
  available: ReadonlySet<string>,
  hrefOf: (slug: string) => string,
  options: { roots?: readonly string[]; limit?: number; maxDepth?: number } = {},
): LinkGroup[] {
  const counts = topicCounts(deals);
  const roots = options.roots ?? ROOT_TOPICS;
  return roots
    .map((root) => ({
      root,
      items: [...TOPICS.values()]
        .filter(
          (topic) =>
            (topic.slug === root || topic.path[0] === root) &&
            topic.depth <= (options.maxDepth ?? Infinity) &&
            available.has(topic.slug) &&
            counts.has(topic.slug),
        )
        .slice(0, options.limit ?? 40)
        .map((topic) => ({ href: hrefOf(topic.slug), label: topic.name, count: counts.get(topic.slug)! })),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => (counts.get(b.root) ?? 0) - (counts.get(a.root) ?? 0))
    .map((group) => ({ title: TOPICS.get(group.root)!.name, items: group.items }));
}

/** The main category of each tree group (for a one-row shortcut bar). */
export function rootLinks(groups: readonly LinkGroup[]): LinkItem[] {
  return groups.flatMap((group) => group.items.filter((item) => item.label === group.title));
}

/** Sub-categories of a tree node in a scope; for a leaf, its sibling nodes instead. */
export function topicChildLinks(
  topic: FlatTopic,
  deals: readonly Deal[],
  available: ReadonlySet<string>,
  hrefOf: (slug: string) => string,
): LinkGroup {
  const counts = topicCounts(deals);
  const link = (slugs: readonly string[]) =>
    slugs
      .filter((slug) => available.has(slug) && counts.has(slug))
      .map((slug) => ({ href: hrefOf(slug), label: TOPICS.get(slug)!.name, count: counts.get(slug)! }));
  const children = link(topic.children);
  if (children.length > 0 || topic.path.length === 0) return { title: `${topic.name} alt kategorileri`, items: children };
  const parent = TOPICS.get(topic.path.at(-1)!)!;
  return {
    title: `Diğer ${parent.name.toLocaleLowerCase('tr-TR')} kategorileri`,
    items: link(parent.children.filter((slug) => slug !== topic.slug)),
  };
}

/** Breadcrumbs for the ancestors of a tree node that have a page in the scope. */
export function topicAncestorCrumbs(
  topic: FlatTopic | null,
  available: ReadonlySet<string>,
  hrefOf: (slug: string) => string,
): { name: string; path: string }[] {
  if (!topic) return [];
  return topic.path.filter((slug) => available.has(slug)).map((slug) => ({ name: TOPICS.get(slug)!.name, path: hrefOf(slug) }));
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
  tags: memoized(deals, 'tags', () => subcategoryFacets(deals)),
  districts: memoized(deals, 'districts', () => districtFacets(deals)),
  citySegments: memoized(deals, 'citySegments', () => citySegmentPages(deals)),
  districtTags: memoized(deals, 'districtTags', () => districtTagPages(deals)),
});
