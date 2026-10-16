import { searchFold } from '../slug';
import type { Deal, DealIndexEntry } from './schema';

/**
 * Pure filtering / sorting / pagination over the compact index. Shared by the build
 * (static pages) and the browser (live filters on /firsatlar/), so results are identical.
 */
export type SortKey = 'onerilen' | 'yeni' | 'fiyat-artan' | 'fiyat-azalan' | 'indirim' | 'bitis';

export const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'onerilen', label: 'Önerilen' },
  { value: 'yeni', label: 'En yeni' },
  { value: 'fiyat-artan', label: 'Fiyat: düşükten yükseğe' },
  { value: 'fiyat-azalan', label: 'Fiyat: yüksekten düşüğe' },
  { value: 'indirim', label: 'En yüksek indirim' },
  { value: 'bitis', label: 'Bitişi yaklaşan' },
];

export interface DealFilters {
  q?: string | undefined;
  kategori?: string | undefined;
  sehir?: string | undefined;
  magaza?: string | undefined;
  sirala?: SortKey | undefined;
}

export const PAGE_SIZE = 24;

export function toIndexEntry(deal: Deal): DealIndexEntry {
  return {
    id: deal.id,
    s: deal.slug,
    t: deal.title,
    m: deal.merchant,
    c: deal.category,
    ct: deal.citySlug,
    cn: deal.city,
    d: deal.district,
    p: deal.price,
    op: deal.originalPrice,
    dp: deal.discountPercent,
    cur: deal.currency,
    img: deal.imageUrl,
    u: deal.affiliateUrl ?? deal.sourceUrl,
    pv: deal.provider,
    pn: deal.providerName,
    vu: deal.validUntil,
    vf: deal.validFrom,
    f: deal.featured ? 1 : 0,
    q: searchFold([deal.title, deal.merchant, deal.city, deal.district, deal.sourceCategory, ...deal.tags].filter(Boolean).join(' ')),
  };
}

export function merchantKey(merchant: string): string {
  return searchFold(merchant).replace(/ /g, '-');
}

export function filterEntries(entries: readonly DealIndexEntry[], filters: DealFilters): DealIndexEntry[] {
  const terms = filters.q ? searchFold(filters.q).split(' ').filter(Boolean) : [];
  return entries.filter((entry) => {
    if (filters.kategori && entry.c !== filters.kategori) return false;
    if (filters.sehir && entry.ct !== filters.sehir) return false;
    if (filters.magaza && (!entry.m || merchantKey(entry.m) !== filters.magaza)) return false;
    return terms.every((term) => entry.q.includes(term));
  });
}

const time = (value: string | null) => (value ? Date.parse(value) : Number.NaN);

export function sortEntries(entries: readonly DealIndexEntry[], sort: SortKey = 'onerilen'): DealIndexEntry[] {
  const list = [...entries];
  const priceless = (value: number | null, high: boolean) => (value === null ? (high ? -Infinity : Infinity) : value);
  switch (sort) {
    case 'yeni':
      return list.sort((a, b) => (time(b.vf) || 0) - (time(a.vf) || 0));
    case 'fiyat-artan':
      return list.sort((a, b) => priceless(a.p, false) - priceless(b.p, false));
    case 'fiyat-azalan':
      return list.sort((a, b) => priceless(b.p, true) - priceless(a.p, true));
    case 'indirim':
      return list.sort((a, b) => (b.dp ?? -1) - (a.dp ?? -1));
    case 'bitis':
      return list.sort((a, b) => (time(a.vu) || Infinity) - (time(b.vu) || Infinity));
    default:
      // featured first, then deals with verified discounts, then provider order
      return list
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => b.entry.f - a.entry.f || Number(b.entry.dp !== null) - Number(a.entry.dp !== null) || a.index - b.index)
        .map(({ entry }) => entry);
  }
}

export function paginate<T>(items: readonly T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages };
}
