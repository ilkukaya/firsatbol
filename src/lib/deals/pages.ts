import { CATEGORIES } from '../../config/categories';
import type { Deal } from './schema';
import { PAGE_SIZE, sortEntries, toIndexEntry } from './query';
import { MIN_COMBO_PAGE, countBy } from './taxonomy';

/** Deals of a category (optionally a city) in "recommended" order. */
export function dealsForCategory(deals: readonly Deal[], categorySlug: string, citySlug?: string): Deal[] {
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const subset = deals.filter((deal) => deal.category === categorySlug && (!citySlug || deal.citySlug === citySlug));
  return sortEntries(subset.map(toIndexEntry)).map((entry) => byId.get(entry.id)!);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Category × city combinations with enough genuine content to deserve a page. */
export function categoryCityCombos(deals: readonly Deal[]): { category: string; city: string; cityName: string; count: number }[] {
  const combos: { category: string; city: string; cityName: string; count: number }[] = [];
  for (const category of CATEGORIES) {
    const inCategory = deals.filter((deal) => deal.category === category.slug);
    for (const [city, count] of countBy(inCategory, (deal) => deal.citySlug)) {
      if (count >= MIN_COMBO_PAGE) {
        const cityName = inCategory.find((deal) => deal.citySlug === city)?.city ?? city;
        combos.push({ category: category.slug, city, cityName, count });
      }
    }
  }
  return combos;
}
