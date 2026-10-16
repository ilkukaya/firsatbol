/**
 * Category taxonomy. Edit names, descriptions and tips here — every category page,
 * the navigation and the homepage sections read from this file.
 *
 * `keywords` map provider category names / deal titles to a FırsatBol category.
 * They are matched against Turkish-folded text (see `searchFold`), so write them in
 * plain lowercase ASCII ("kahvalti", not "Kahvaltı").
 */
export type CategoryIcon = 'cpu' | 'utensils' | 'palm' | 'sparkles' | 'ticket' | 'home' | 'bag' | 'percent';

export interface Category {
  slug: string;
  name: string;
  shortName: string;
  homeTitle: string;
  icon: CategoryIcon;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  tips: string[];
  keywords: string[];
  /** Homepage section order; categories without deals are hidden automatically. */
  homeOrder: number;
}

export const CATEGORIES: readonly Category[] = [
  {
    slug: 'teknoloji',
    name: 'Teknoloji ve Elektronik',
    shortName: 'Teknoloji',
    homeTitle: 'Teknoloji ve Elektronik',
    icon: 'cpu',
    metaTitle: 'Teknoloji ve Elektronik Fırsatları',
    metaDescription:
      'Telefon, bilgisayar, aksesuar ve elektronik ürünlerde iş ortaklarımızdan derlenen güncel kampanya ve indirimler. Satın almadan önce koşulları karşılaştırın.',
    intro:
      'Telefon, bilgisayar, kulaklık, akıllı saat ve ev elektroniği gibi ürünlerde iş ortaklarımızın sunduğu güncel kampanyaları burada topluyoruz. Elektronik alışverişinde fiyat kadar garanti süresi, satıcının kim olduğu ve teslimat koşulları da önemlidir; her fırsatın ayrıntısını satıcının sayfasında kontrol etmenizi öneririz.',
    tips: [
      'Ürünün resmi distribütör ya da ithalatçı garantili olup olmadığını kontrol edin.',
      'İndirimli fiyatı aynı modelin farklı satıcılardaki fiyatıyla karşılaştırın.',
      'Kargo ücreti ve teslim süresini toplam maliyete dahil edin.',
    ],
    keywords: [
      'teknoloji',
      'elektronik',
      'telefon',
      'bilgisayar',
      'laptop',
      'tablet',
      'kulaklik',
      'akilli saat',
      'televizyon',
      'oyun konsolu',
      'aksesuar',
      'sarj',
      'kamera',
    ],
    homeOrder: 1,
  },
  {
    slug: 'yeme-icme',
    name: 'Yeme İçme',
    shortName: 'Yeme İçme',
    homeTitle: 'Yeme İçme Fırsatları',
    icon: 'utensils',
    metaTitle: 'Yeme İçme Fırsatları: Restoran, Kahvaltı ve Akşam Yemeği',
    metaDescription:
      'Restoran, kahvaltı, akşam yemeği ve kafe kampanyaları. Şehrinizdeki yeme içme fırsatlarını menü içeriği ve geçerlilik koşullarıyla birlikte inceleyin.',
    intro:
      'Serpme kahvaltıdan fasıl menülerine, burger setlerinden tatlı ve kahve kampanyalarına kadar şehrinizdeki yeme içme fırsatlarını bir araya getiriyoruz. Bu tür fırsatlarda menü içeriği, geçerli günler ve rezervasyon zorunluluğu gibi koşullar farklılık gösterebilir; kullanım şartlarını fırsat sayfasında mutlaka okuyun.',
    tips: [
      'Rezervasyon gerekip gerekmediğini ve geçerli gün/saatleri kontrol edin.',
      'Menüye nelerin dahil olduğunu (içecek, servis ücreti vb.) inceleyin.',
      'Özel günlerde ve resmi tatillerde geçerlilik kısıtlarına dikkat edin.',
    ],
    keywords: [
      'yeme',
      'icme',
      'yemek',
      'restoran',
      'kahvalti',
      'brunch',
      'aksam yemegi',
      'menu',
      'kafe',
      'cafe',
      'pizza',
      'burger',
      'tatli',
      'kahve',
      'iftar',
      'fasil',
      'et',
      'balik',
      'steak',
      'sushi',
    ],
    homeOrder: 2,
  },
  {
    slug: 'tatil',
    name: 'Tatil ve Konaklama',
    shortName: 'Tatil',
    homeTitle: 'Tatil ve Konaklama',
    icon: 'palm',
    metaTitle: 'Tatil ve Konaklama Fırsatları: Otel, Tur ve Hafta Sonu Kaçamakları',
    metaDescription:
      'Otel, butik konaklama, tur ve hafta sonu kaçamağı kampanyaları. Tarih, oda tipi ve dahil hizmetleri karşılaştırarak size uygun tatil fırsatını bulun.',
    intro:
      'Şehir otellerinden termal tesislere, kültür turlarından hafta sonu kaçamaklarına kadar konaklama ve tatil fırsatlarını listeliyoruz. Tatil kampanyalarında geçerli tarih aralığı, oda tipi, pansiyon türü ve iptal koşulları fiyat kadar belirleyicidir.',
    tips: [
      'Geçerli tarih aralığını ve bayram/hafta sonu farklarını kontrol edin.',
      'Kahvaltı, yarım pansiyon veya her şey dahil gibi kapsamları karşılaştırın.',
      'İptal ve tarih değişikliği koşullarını rezervasyondan önce okuyun.',
    ],
    keywords: [
      'tatil',
      'otel',
      'konaklama',
      'tur',
      'termal',
      'pansiyon',
      'butik otel',
      'hafta sonu',
      'gece konaklama',
      'yurt disi',
      'ucak',
      'gemi',
      'kamp',
      'bungalov',
    ],
    homeOrder: 3,
  },
  {
    slug: 'guzellik-bakim',
    name: 'Güzellik ve Bakım',
    shortName: 'Güzellik',
    homeTitle: 'Güzellik ve Bakım',
    icon: 'sparkles',
    metaTitle: 'Güzellik ve Bakım Fırsatları: Spa, Masaj ve Kişisel Bakım',
    metaDescription:
      'Spa, masaj, cilt bakımı, kuaför ve kişisel bakım hizmetlerinde güncel kampanyalar. Seans süresi ve randevu koşullarını inceleyerek karar verin.',
    intro:
      'Masaj ve spa paketleri, cilt bakımı, kuaför ve manikür gibi kişisel bakım hizmetlerinde iş ortaklarımızın kampanyalarını derliyoruz. Bu hizmetlerde seans süresi, uygulamayı yapan merkezin konumu ve randevu kuralları önemlidir.',
    tips: [
      'Seans süresini ve pakete dahil uygulamaları karşılaştırın.',
      'Randevu alma yöntemini ve iptal kurallarını önceden öğrenin.',
      'Sağlıkla ilgili uygulamalarda merkezin yetki ve uzmanlık bilgilerini sorgulayın.',
    ],
    keywords: [
      'guzellik',
      'bakim',
      'spa',
      'masaj',
      'hamam',
      'cilt',
      'kuafor',
      'sac',
      'manikur',
      'pedikur',
      'epilasyon',
      'lazer',
      'makyaj',
      'kozmetik',
      'parfum',
      'wellness',
    ],
    homeOrder: 4,
  },
  {
    slug: 'etkinlik',
    name: 'Etkinlik ve Eğlence',
    shortName: 'Etkinlik',
    homeTitle: 'Etkinlikler ve Eğlence',
    icon: 'ticket',
    metaTitle: 'Etkinlik ve Eğlence Fırsatları: Konser, Tiyatro ve Aktiviteler',
    metaDescription:
      'Konser, tiyatro, stand-up, atölye ve aile aktivitelerinde indirimli bilet ve kampanyalar. Etkinlik tarihi ve mekân bilgisiyle birlikte listelenir.',
    intro:
      'Konserler, tiyatro ve stand-up gösterileri, atölyeler, çocuk aktiviteleri ve eğlence mekânlarına ait kampanyaları bu kategoride bulabilirsiniz. Etkinlik fırsatlarında tarih, seans ve mekân bilgisi değişebileceği için satın almadan önce son durumu kontrol edin.',
    tips: [
      'Etkinlik tarihini, seans saatini ve mekânı yeniden kontrol edin.',
      'Yaş sınırı ve giriş koşulları olup olmadığına bakın.',
      'Biletin iade veya devir koşullarını öğrenin.',
    ],
    keywords: [
      'etkinlik',
      'eglence',
      'konser',
      'tiyatro',
      'stand up',
      'sinema',
      'bilet',
      'atolye',
      'workshop',
      'festival',
      'muze',
      'aktivite',
      'macera',
      'paintball',
      'bowling',
      'escape',
      'cocuk',
      'akvaryum',
      'gosteri',
    ],
    homeOrder: 5,
  },
  {
    slug: 'ev-yasam',
    name: 'Ev ve Yaşam',
    shortName: 'Ev & Yaşam',
    homeTitle: 'Ev ve Yaşam',
    icon: 'home',
    metaTitle: 'Ev ve Yaşam Fırsatları: Ev Hizmetleri, Dekorasyon ve Spor',
    metaDescription:
      'Ev temizliği, dekorasyon, mutfak, spor salonu ve eğitim gibi yaşam alanlarında güncel kampanyalar. Hizmet kapsamını ve koşulları kontrol ederek seçin.',
    intro:
      'Ev temizliği ve bakım hizmetleri, dekorasyon ve mutfak ürünleri, spor salonu üyelikleri ve kurslar gibi günlük yaşamı kolaylaştıran fırsatlar bu kategoride. Hizmet fırsatlarında kapsam, süre ve hizmet verilen bölge bilgisini kontrol etmek önemlidir.',
    tips: [
      'Hizmetin verildiği ilçeleri ve ek ücret çıkabilecek durumları sorun.',
      'Üyelik ve kurs fırsatlarında başlangıç tarihi ve süreyi kontrol edin.',
      'Ürünlerde ölçü, malzeme ve garanti bilgisini inceleyin.',
    ],
    keywords: [
      'ev',
      'yasam',
      'temizlik',
      'dekorasyon',
      'mobilya',
      'mutfak',
      'bahce',
      'hali yikama',
      'koltuk yikama',
      'spor',
      'fitness',
      'pilates',
      'yoga',
      'kurs',
      'egitim',
      'dil kursu',
      'oto',
      'arac',
      'yikama',
      'evcil',
    ],
    homeOrder: 6,
  },
  {
    slug: 'alisveris',
    name: 'Alışveriş ve Diğer',
    shortName: 'Alışveriş',
    homeTitle: 'Alışveriş Fırsatları',
    icon: 'bag',
    metaTitle: 'Alışveriş Fırsatları: Moda, Hediye ve Diğer Kampanyalar',
    metaDescription:
      'Moda, ayakkabı, hediye, kitap ve diğer alışveriş kategorilerinde iş ortaklarımızdan derlenen güncel indirim ve kampanyalar.',
    intro:
      'Giyim, ayakkabı, çanta, hediyelik ürünler, kitap ve diğer kategorilere girmeyen alışveriş fırsatlarını burada listeliyoruz. Online alışverişte beden tablosu, iade süresi ve kargo ücreti gibi ayrıntılar toplam maliyeti doğrudan etkiler.',
    tips: [
      'Beden tablosunu ve ürün ölçülerini kontrol edin.',
      'İade süresini ve iade kargo ücretini önceden öğrenin.',
      'Kampanya fiyatının sepette uygulandığını ödeme adımından önce doğrulayın.',
    ],
    keywords: [
      'alisveris',
      'moda',
      'giyim',
      'ayakkabi',
      'canta',
      'aksesuar',
      'hediye',
      'kitap',
      'oyuncak',
      'saat',
      'taki',
      'gozluk',
      'urun',
    ],
    homeOrder: 7,
  },
  {
    slug: 'kuponlar',
    name: 'Kupon ve İndirim Kodları',
    shortName: 'Kuponlar',
    homeTitle: 'Kupon ve İndirim Kodları',
    icon: 'percent',
    metaTitle: 'Kupon ve İndirim Kodları',
    metaDescription:
      'Yetkili kaynaklardan gelen kupon ve indirim kodları. Kodun geçerlilik tarihi, alt limit ve kullanım koşullarını kontrol ederek kullanın.',
    intro:
      'Bu kategoride yalnızca yetkili iş ortaklarımızdan veya doğrudan markalardan gelen kupon ve indirim kodlarını yayınlıyoruz. Kuponların alt sepet tutarı, geçerli ürünler ve son kullanma tarihi gibi koşulları olabilir; kodu kullanmadan önce şartları okuyun.',
    tips: [
      'Alt sepet tutarı ve geçerli ürün/kategori kısıtlarını kontrol edin.',
      'Kodun başka kampanyalarla birleştirilip birleştirilemeyeceğini öğrenin.',
      'Son kullanma tarihini ve tek kullanımlık olup olmadığını kontrol edin.',
    ],
    keywords: ['kupon', 'indirim kodu', 'promosyon kodu', 'kod', 'voucher', 'coupon'],
    homeOrder: 8,
  },
];

export const DEFAULT_CATEGORY_SLUG = 'alisveris';

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

export function categoryName(slug: string): string {
  return getCategory(slug)?.name ?? 'Diğer';
}
