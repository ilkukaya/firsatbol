import { searchFold } from '../slug';
import type { Deal, DealIndexEntry } from './schema';

/**
 * Pure filtering / sorting / pagination over the compact index. Shared by the build
 * (static pages) and the browser (live filters on /firsatlar/), so results are identical.
 */
export type SortKey = 'onerilen' | 'yeni' | 'fiyat-artan' | 'fiyat-azalan' | 'indirim' | 'bitis' | 'seans';

export const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'onerilen', label: 'Önerilen' },
  { value: 'yeni', label: 'En yeni' },
  { value: 'fiyat-artan', label: 'Fiyat: düşükten yükseğe' },
  { value: 'fiyat-azalan', label: 'Fiyat: yüksekten düşüğe' },
  { value: 'indirim', label: 'En yüksek indirim' },
  { value: 'bitis', label: 'Bitişi yaklaşan' },
  { value: 'seans', label: 'En yakın seans' },
];

/** Price bands of the "Fiyat" filter (value = query-string form, upper bound exclusive). */
export const PRICE_RANGES: readonly { value: string; label: string; min: number; max: number }[] = [
  { value: '0-250', label: '250 TL altı', min: 0, max: 250 },
  { value: '250-500', label: '250–500 TL', min: 250, max: 500 },
  { value: '500-1000', label: '500–1.000 TL', min: 500, max: 1000 },
  { value: '1000-2500', label: '1.000–2.500 TL', min: 1000, max: 2500 },
  { value: '2500-5000', label: '2.500–5.000 TL', min: 2500, max: 5000 },
  { value: '5000-', label: '5.000 TL üzeri', min: 5000, max: Infinity },
];

/** `sehir` value for deals without a city (shipped products, online services, coupons). */
export const NATIONWIDE = 'turkiye-geneli';

export interface DealFilters {
  q?: string | undefined;
  kategori?: string | undefined;
  sehir?: string | undefined;
  magaza?: string | undefined;
  fiyat?: string | undefined;
  sirala?: SortKey | undefined;
}

export function inPriceRange(price: number | null, range: string | undefined): boolean {
  if (!range) return true;
  const band = PRICE_RANGES.find((option) => option.value === range);
  return !band || (price !== null && price >= band.min && price < band.max);
}

export const PAGE_SIZE = 24;
/** Sub-category, city and district pages list more deals per page (2, 3 and 4 columns divide it). */
export const FACET_PAGE_SIZE = 48;

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
    pv: deal.provider,
    pn: deal.providerName,
    vu: deal.validUntil,
    vf: deal.validFrom,
    f: deal.featured ? 1 : 0,
    ns: deal.sessions[0]?.date ?? null,
    pf: deal.priceFrom ? 1 : 0,
    // only terms not already in the entry (tags, provider category); the rest is folded on demand
    q: searchFold([deal.sourceCategory, ...deal.tags].filter(Boolean).join(' ')),
  };
}

export function merchantKey(merchant: string): string {
  return searchFold(merchant).replace(/ /g, '-');
}

const haystacks = new WeakMap<DealIndexEntry, string>();

/** Folded search text of an entry: title, merchant, city, district + indexed extra terms. */
export function searchText(entry: DealIndexEntry): string {
  let text = haystacks.get(entry);
  if (text === undefined) {
    text = `${searchFold([entry.t, entry.m, entry.cn, entry.d].filter(Boolean).join(' '))} ${entry.q}`;
    haystacks.set(entry, text);
  }
  return text;
}

export function filterEntries(entries: readonly DealIndexEntry[], filters: DealFilters): DealIndexEntry[] {
  const terms = filters.q ? searchFold(filters.q).split(' ').filter(Boolean) : [];
  return entries.filter((entry) => {
    if (filters.kategori && entry.c !== filters.kategori) return false;
    if (filters.sehir && (filters.sehir === NATIONWIDE ? entry.ct !== null : entry.ct !== filters.sehir)) return false;
    if (filters.magaza && (!entry.m || merchantKey(entry.m) !== filters.magaza)) return false;
    if (!inPriceRange(entry.p, filters.fiyat)) return false;
    return terms.every((term) => searchText(entry).includes(term));
  });
}

const time = (value: string | null) => (value ? Date.parse(value) : Number.NaN);
const sequence = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);

export function sortEntries(entries: readonly DealIndexEntry[], sort: SortKey = 'onerilen'): DealIndexEntry[] {
  const list = [...entries];
  const priceless = (value: number | null, high: boolean) => (value === null ? (high ? -Infinity : Infinity) : value);
  switch (sort) {
    case 'yeni':
      // start date when the source gives one, else the source's id (partners number new deals upwards)
      return list.sort((a, b) => (time(b.vf) || 0) - (time(a.vf) || 0) || sequence(b.id) - sequence(a.id));
    case 'fiyat-artan':
      return list.sort((a, b) => priceless(a.p, false) - priceless(b.p, false));
    case 'fiyat-azalan':
      return list.sort((a, b) => priceless(b.p, true) - priceless(a.p, true));
    case 'indirim':
      return list.sort((a, b) => (b.dp ?? -1) - (a.dp ?? -1));
    case 'bitis':
      return list.sort((a, b) => (time(a.vu) || Infinity) - (time(b.vu) || Infinity));
    case 'seans':
      return list.sort((a, b) => (time(a.ns) || Infinity) - (time(b.ns) || Infinity));
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
