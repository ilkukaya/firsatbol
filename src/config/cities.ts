import { searchFold, slugify } from '../lib/slug';

/**
 * Türkiye's 81 provinces. Used to normalise city names coming from providers.
 * City pages are generated only for `FEATURED_CITIES` and for provinces that
 * actually have published deals (see `src/lib/deals/taxonomy.ts`).
 */
export const PROVINCES = [
  'Adana',
  'Adıyaman',
  'Afyonkarahisar',
  'Ağrı',
  'Aksaray',
  'Amasya',
  'Ankara',
  'Antalya',
  'Ardahan',
  'Artvin',
  'Aydın',
  'Balıkesir',
  'Bartın',
  'Batman',
  'Bayburt',
  'Bilecik',
  'Bingöl',
  'Bitlis',
  'Bolu',
  'Burdur',
  'Bursa',
  'Çanakkale',
  'Çankırı',
  'Çorum',
  'Denizli',
  'Diyarbakır',
  'Düzce',
  'Edirne',
  'Elazığ',
  'Erzincan',
  'Erzurum',
  'Eskişehir',
  'Gaziantep',
  'Giresun',
  'Gümüşhane',
  'Hakkari',
  'Hatay',
  'Iğdır',
  'Isparta',
  'İstanbul',
  'İzmir',
  'Kahramanmaraş',
  'Karabük',
  'Karaman',
  'Kars',
  'Kastamonu',
  'Kayseri',
  'Kırıkkale',
  'Kırklareli',
  'Kırşehir',
  'Kilis',
  'Kocaeli',
  'Konya',
  'Kütahya',
  'Malatya',
  'Manisa',
  'Mardin',
  'Mersin',
  'Muğla',
  'Muş',
  'Nevşehir',
  'Niğde',
  'Ordu',
  'Osmaniye',
  'Rize',
  'Sakarya',
  'Samsun',
  'Siirt',
  'Sinop',
  'Sivas',
  'Şanlıurfa',
  'Şırnak',
  'Tekirdağ',
  'Tokat',
  'Trabzon',
  'Tunceli',
  'Uşak',
  'Van',
  'Yalova',
  'Yozgat',
  'Zonguldak',
] as const;

export interface FeaturedCity {
  slug: string;
  name: string;
  intro: string;
}

/** Cities with an editorial landing page even before deals arrive (noindex while empty). */
export const FEATURED_CITIES: readonly FeaturedCity[] = [
  {
    slug: 'istanbul',
    name: 'İstanbul',
    intro:
      'İki yakasıyla İstanbul; kahvaltı mekânlarından boğaz turlarına, spa merkezlerinden konser ve tiyatrolara kadar en geniş fırsat yelpazesine sahip şehirlerden biri. Fırsatlara göz atarken hizmetin hangi ilçede verildiğini ve ulaşım süresini de hesaba katmanızı öneririz.',
  },
  {
    slug: 'ankara',
    name: 'Ankara',
    intro:
      'Ankara’da restoran ve kafe kampanyaları, kişisel bakım hizmetleri, kurslar ve aile aktiviteleri öne çıkıyor. Şehir içindeki fırsatları ilçe bilgisiyle birlikte inceleyerek size en yakın seçeneği bulabilirsiniz.',
  },
  {
    slug: 'izmir',
    name: 'İzmir',
    intro:
      'İzmir’de kahvaltı ve deniz ürünleri restoranlarından şehir dışındaki koylara uzanan günübirlik planlara kadar farklı fırsatlar bulunabiliyor. Konum ve geçerli günleri kontrol ederek planınızı yapın.',
  },
  {
    slug: 'antalya',
    name: 'Antalya',
    intro:
      'Antalya’da konaklama, tur ve aktivite fırsatları sezona göre değişkenlik gösterir. Tatil fırsatlarında geçerli tarih aralığını, transfer ve pansiyon kapsamını mutlaka kontrol edin.',
  },
  {
    slug: 'bursa',
    name: 'Bursa',
    intro:
      'Bursa; termal tesisler, kahvaltı mekânları ve Uludağ’a yönelik konaklama seçenekleriyle öne çıkan şehirlerden biri. Termal ve konaklama fırsatlarında hafta içi ve hafta sonu fiyat farklarına dikkat edin.',
  },
  {
    slug: 'eskisehir',
    name: 'Eskişehir',
    intro:
      'Öğrenci şehri Eskişehir’de kafe, restoran ve eğlence fırsatları ile kurs ve aktivite kampanyaları ilgi görüyor. Fırsatların geçerli olduğu şubeyi ve saatleri kontrol etmeyi unutmayın.',
  },
  {
    slug: 'kocaeli',
    name: 'Kocaeli',
    intro:
      'Kocaeli’de yeme içme, kişisel bakım ve hafta sonu aktivitelerine yönelik fırsatları bir arada görebilirsiniz. Hizmetin verildiği ilçeyi ve rezervasyon koşullarını kontrol etmenizi öneririz.',
  },
  {
    slug: 'mugla',
    name: 'Muğla',
    intro:
      'Bodrum, Marmaris ve Fethiye gibi tatil bölgeleriyle Muğla’da konaklama, tekne turu ve aktivite fırsatları sezonla birlikte artar. Tarih aralığını ve iptal koşullarını rezervasyondan önce okuyun.',
  },
];

const PROVINCE_BY_FOLDED = new Map<string, string>(PROVINCES.map((name) => [searchFold(name), name]));

/**
 * Map a provider city string ("ISTANBUL", "İstanbul Avrupa", "izmir") to a province.
 * Returns undefined when the value is not a recognisable province — we never guess.
 */
export function normalizeCity(raw: string | null | undefined): { name: string; slug: string } | undefined {
  if (!raw) return undefined;
  const folded = searchFold(raw);
  if (!folded) return undefined;
  const exact = PROVINCE_BY_FOLDED.get(folded);
  if (exact) return { name: exact, slug: slugify(exact) };
  // "istanbul avrupa yakasi", "antalya merkez" → first token(s) that match a province
  const tokens = folded.split(' ');
  for (let length = Math.min(2, tokens.length); length >= 1; length -= 1) {
    const candidate = PROVINCE_BY_FOLDED.get(tokens.slice(0, length).join(' '));
    if (candidate) return { name: candidate, slug: slugify(candidate) };
  }
  return undefined;
}

export function cityNameFromSlug(slug: string): string | undefined {
  return PROVINCES.find((name) => slugify(name) === slug);
}
