import { slugify } from '../lib/slug';

/**
 * Official districts per province, with the partner's `townId` (supplied by the owner).
 *
 * When a province is listed here, district pages are generated only for these districts: the
 * partner sometimes files venues just outside the province under it (e.g. Kartepe or Çerkezköy
 * hotels under "İstanbul"). Those deals stay on the province page but get no false district page.
 * Provinces without a list accept every district the data names.
 */
export const DISTRICTS: Readonly<Record<string, readonly { name: string; townId: number }[]>> = {
  istanbul: [
    { name: 'Adalar', townId: 54 },
    { name: 'Arnavutköy', townId: 949 },
    { name: 'Ataşehir', townId: 950 },
    { name: 'Avcılar', townId: 248 },
    { name: 'Bağcılar', townId: 606 },
    { name: 'Bahçelievler', townId: 591 },
    { name: 'Bakırköy', townId: 135 },
    { name: 'Başakşehir', townId: 951 },
    { name: 'Bayrampaşa', townId: 595 },
    { name: 'Beşiktaş', townId: 132 },
    { name: 'Beykoz', townId: 39 },
    { name: 'Beylikdüzü', townId: 952 },
    { name: 'Beyoğlu', townId: 133 },
    { name: 'Büyükçekmece', townId: 124 },
    { name: 'Çatalca', townId: 25 },
    { name: 'Çekmeköy', townId: 953 },
    { name: 'Esenler', townId: 589 },
    { name: 'Esenyurt', townId: 954 },
    { name: 'Eyüpsultan', townId: 49 },
    { name: 'Fatih', townId: 134 },
    { name: 'Gaziosmanpaşa', townId: 310 },
    { name: 'Güngören', townId: 607 },
    { name: 'Kadıköy', townId: 53 },
    { name: 'Kağıthane', townId: 68 },
    { name: 'Kartal', townId: 78 },
    { name: 'Küçükçekmece', townId: 136 },
    { name: 'Maltepe', townId: 52 },
    { name: 'Pendik', townId: 237 },
    { name: 'Sancaktepe', townId: 955 },
    { name: 'Sarıyer', townId: 50 },
    { name: 'Şile', townId: 62 },
    { name: 'Silivri', townId: 125 },
    { name: 'Şişli', townId: 590 },
    { name: 'Sultanbeyli', townId: 588 },
    { name: 'Sultangazi', townId: 956 },
    { name: 'Tuzla', townId: 238 },
    { name: 'Ümraniye', townId: 608 },
    { name: 'Üsküdar', townId: 51 },
    { name: 'Zeytinburnu', townId: 675 },
  ],
};

const known = new Map(Object.entries(DISTRICTS).map(([city, list]) => [city, new Set(list.map((d) => slugify(d.name, 60)))]));

/** Whether a district (by slug) may get a page under the province. */
export function isKnownDistrict(citySlug: string, districtSlug: string): boolean {
  const list = known.get(citySlug);
  return !list || list.has(districtSlug);
}
