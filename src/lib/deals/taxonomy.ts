import { CATEGORIES } from '../../config/categories';
import { FEATURED_CITIES, PROVINCES, normalizeCity } from '../../config/cities';
import type { Deal } from './schema';

/** Minimum deals for a city or category×city page to be generated / indexed. */
export const MIN_CITY_INDEX = 3;
export const MIN_COMBO_PAGE = 4;

export function countBy<T extends string | null>(deals: readonly Deal[], key: (deal: Deal) => T): Map<NonNullable<T>, number> {
  const counts = new Map<NonNullable<T>, number>();
  for (const deal of deals) {
    const value = key(deal);
    if (value !== null && value !== undefined) counts.set(value as NonNullable<T>, (counts.get(value as NonNullable<T>) ?? 0) + 1);
  }
  return counts;
}

export interface CityEntry {
  slug: string;
  name: string;
  count: number;
  featured: boolean;
  intro: string | null;
}

/** All 81 provinces: featured cities first, then provinces with deals, then the rest (honest empty state, noindex). */
export function citiesWithDeals(deals: readonly Deal[]): CityEntry[] {
  const counts = countBy(deals, (deal) => deal.citySlug);
  const names = new Map(deals.filter((deal) => deal.citySlug && deal.city).map((deal) => [deal.citySlug!, deal.city!]));
  const entries: CityEntry[] = FEATURED_CITIES.map((city) => ({
    slug: city.slug,
    name: city.name,
    count: counts.get(city.slug) ?? 0,
    featured: true,
    intro: city.intro,
  }));
  for (const [slug, count] of counts) {
    if (!entries.some((entry) => entry.slug === slug)) {
      entries.push({ slug, name: names.get(slug) ?? slug, count, featured: false, intro: null });
    }
  }
  for (const province of PROVINCES) {
    const city = normalizeCity(province);
    if (city && !entries.some((entry) => entry.slug === city.slug)) {
      entries.push({ slug: city.slug, name: city.name, count: 0, featured: false, intro: null });
    }
  }
  return entries;
}

export function categoryCounts(deals: readonly Deal[]): Map<string, number> {
  const counts = countBy(deals, (deal) => deal.category);
  for (const category of CATEGORIES) if (!counts.has(category.slug)) counts.set(category.slug, 0);
  return counts;
}

export function merchantsOf(deals: readonly Deal[]): { name: string; count: number }[] {
  const counts = countBy(deals, (deal) => deal.merchant);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
}

export function relatedDeals(deal: Deal, all: readonly Deal[], limit = 4): Deal[] {
  const scored = all
    .filter((other) => other.id !== deal.id)
    .map((other) => ({
      other,
      score:
        (other.category === deal.category ? 3 : 0) +
        (deal.citySlug && other.citySlug === deal.citySlug ? 2 : 0) +
        (deal.merchant && other.merchant === deal.merchant ? 1 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.other);
}

/** Popular section only when the provider supplied a popularity signal. */
export function popularDeals(deals: readonly Deal[], limit = 8): Deal[] {
  return deals.filter((deal) => deal.popular).slice(0, limit);
}

/** "Yeni eklenen": provider "new" signal, or a start date within the last 14 days. */
export function newDeals(deals: readonly Deal[], now: Date, limit = 8): Deal[] {
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  return deals
    .filter((deal) => deal.isNew || (deal.validFrom !== null && Date.parse(deal.validFrom) >= cutoff))
    .sort((a, b) => (b.validFrom ? Date.parse(b.validFrom) : 0) - (a.validFrom ? Date.parse(a.validFrom) : 0))
    .slice(0, limit);
}

export function featuredDeals(deals: readonly Deal[], limit = 8): Deal[] {
  const featured = deals.filter((deal) => deal.featured);
  return featured.slice(0, limit);
}

export function providersOf(deals: readonly Deal[]): { id: string; name: string; attribution: Deal['attribution'] }[] {
  const map = new Map<string, { id: string; name: string; attribution: Deal['attribution'] }>();
  for (const deal of deals) {
    if (!map.has(deal.attribution.providerId))
      map.set(deal.attribution.providerId, { id: deal.attribution.providerId, name: deal.providerName, attribution: deal.attribution });
  }
  return [...map.values()];
}

/** Events with a session in the next `days` days, soonest first (real Etkinlik API dates). */
export function upcomingEvents(deals: readonly Deal[], now: Date, days = 7, limit = 8): Deal[] {
  const end = now.getTime() + days * 24 * 60 * 60 * 1000;
  return deals
    .filter((deal) => deal.sessions.some((session) => Date.parse(session.date) >= now.getTime() && Date.parse(session.date) <= end))
    .sort((a, b) => Date.parse(a.sessions[0]!.date) - Date.parse(b.sessions[0]!.date))
    .slice(0, limit);
}
