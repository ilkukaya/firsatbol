import { slugify } from '../lib/slug';

/**
 * Fırsat Bu Fırsat category tree ("Ana kategori › Alt kategori 1 › 2 › 3"), as supplied by the
 * owner from the publisher dashboard together with each node's `tagIds[]` id.
 *
 * Membership is fetched once per node with a NATIONWIDE `tagIds[]=<id>` query; city and district
 * pages are then derived from each deal's own city/district, so no per-district requests are needed.
 * A deal also belongs to a node when one of its own tags has the node's name, and always to the
 * node's ancestors (see `src/lib/deals/topics.ts`).
 * Nodes without an id (e.g. "Tiyatro", "Turlar") group their children only.
 *
 * To add categories later: append nodes here (name + tagId + optional children). Slugs are derived
 * from names (same rule as tag slugs, so tag pages and category pages share URLs); `category`
 * links the main node to a FırsatBol category.
 */
export interface TopicNode {
  name: string;
  /** The partner's `tagIds[]` id; a few nodes have two ids for the same category. */
  tagId?: number | readonly number[];
  children?: TopicNode[];
}

export interface TopicRoot extends TopicNode {
  category: string;
}

export const TAXONOMY: readonly TopicRoot[] = [
  {
    name: 'Masaj',
    tagId: 12,
    category: 'guzellik-bakim',
    children: [
      {
        name: 'Spa',
        tagId: 26,
        children: [
          {
            name: 'Hamam',
            tagId: 21,
            children: [
              { name: 'Kese', tagId: 514 },
              { name: 'Türk hamamı', tagId: 670 },
            ],
          },
          { name: 'Sauna', tagId: 126, children: [{ name: 'Buhar odası', tagId: 682 }] },
          { name: 'Otelde spa', tagId: 3351 },
        ],
      },
      { name: 'Köpük masajı', tagId: 2045 },
      { name: 'Bali masajı', tagId: 2042 },
      { name: 'Aromaterapi masajı', tagId: 2474 },
      { name: 'İsveç masajı', tagId: 2043 },
      { name: 'Çift masajı', tagId: 2398 },
      { name: 'Thai masajı', tagId: 2044 },
      { name: 'Anti stress masajı', tagId: 2244 },
      { name: 'Spor masajı', tagId: 2364 },
      { name: 'Refleksoloji masajı', tagId: 1127 },
      { name: 'Kafa masajı', tagId: 17688 },
      { name: 'Selülit masajı', tagId: 2261 },
    ],
  },
  {
    name: 'Tiyatro',
    category: 'etkinlik',
    children: [
      { name: 'Hafta sonu tiyatrosu', tagId: 6372 },
      {
        name: 'Yetişkin tiyatrosu',
        tagId: 3368,
        children: [
          { name: 'Komedi tiyatro oyunları', tagId: 3371 },
          { name: 'Dram tiyatro oyunları', tagId: 3369 },
          { name: 'Trajedi tiyatro oyunları', tagId: 3370 },
          { name: 'Müzikal tiyatro oyunları', tagId: 3372 },
        ],
      },
      { name: 'Hafta içi tiyatro', tagId: 6371 },
      { name: 'Çocuk tiyatrosu', tagId: 2431 },
      { name: 'Müzikal', tagId: 896 },
      { name: 'Pinokyo', tagId: 17792 },
    ],
  },
  {
    name: 'Aktivite',
    tagId: 275,
    category: 'etkinlik',
    children: [
      { name: 'Tema park', tagId: 3022, children: [{ name: 'Tuzla Viaport Marina', tagId: 17433 }] },
      { name: 'Hayvanat bahçesi', tagId: 496 },
      {
        name: 'Havuz ve plaj',
        tagId: 3033,
        children: [
          { name: 'Havuz', tagId: 35 },
          { name: 'Aquapark', tagId: 110 },
        ],
      },
      { name: 'Akvaryum', tagId: 3203 },
      { name: 'Hafta içi aktivitesi', tagId: 2020 },
      { name: 'Hafta sonu aktivitesi', tagId: 564 },
      { name: 'At binme', tagId: 291 },
      { name: 'Bowling', tagId: 46 },
      { name: 'Parti', tagId: 1241 },
      { name: 'Go kart', tagId: 142 },
      { name: 'DJ performans', tagId: 124 },
      { name: 'Doğum günü partisi', tagId: 1189 },
      { name: 'Evlilik teklifi', tagId: 3233 },
      { name: 'Evlilik yıl dönümü', tagId: 3232 },
      { name: 'Teknede evlilik teklifi', tagId: 3234 },
      { name: 'Airsoft', tagId: 17767 },
      { name: 'Karaoke', tagId: 100 },
      { name: 'Şehir turu', tagId: 2987 },
      { name: 'Maç izleme', tagId: 1529 },
    ],
  },
  {
    name: 'Turlar',
    category: 'tatil',
    children: [
      { name: 'Yurtdışı turlar', tagId: 277, children: [{ name: 'Vizesiz turlar', tagId: 437 }] },
      { name: 'Yurtiçi turlar', tagId: 282 },
      { name: 'Kapıda vizeli turlar', tagId: 17714 },
      { name: 'Ulaşım dahil turlar', tagId: 511 },
      { name: 'Kültür turu', tagId: 285 },
      { name: 'Doğa turu', tagId: 1969 },
      { name: 'Konaklamalı turlar', tagId: 2053 },
      { name: 'Kahvaltı dahil turlar', tagId: 2014 },
      { name: 'Uçak bileti dahil turlar', tagId: 510 },
      { name: 'Akşam yemeği dahil turlar', tagId: 2052 },
      { name: 'Bayram turları', tagId: 2114 },
      { name: 'Uçaklı kültür turları', tagId: 5641 },
      { name: 'Ara tatil turları', tagId: 17743 },
      { name: 'Yılbaşı turları', tagId: 3053 },
      { name: 'Günübirlik turlar', tagId: 139 },
      { name: 'Sömestr turları', tagId: 17744 },
      { name: 'Hafta sonu turları', tagId: 1932 },
      { name: 'Kayak turu', tagId: 2355 },
      { name: 'Tekne turu', tagId: 185 },
      { name: 'Öğle yemeği dahil tur', tagId: 2000 },
      { name: '29 Ekim turu', tagId: 2001 },
      { name: 'Erken rezervasyon turları', tagId: 2091 },
      { name: 'İzmir çıkışlı turlar', tagId: 17754 },
      { name: '30 Ağustos turları', tagId: 6335 },
      { name: 'Doğu Ekspresi', tagId: 3220 },
      { name: 'Festival turu', tagId: 2417 },
      { name: '19 Mayıs turu', tagId: 1743 },
      { name: 'Mavi tur', tagId: 198 },
      { name: '15 Temmuz turları', tagId: 17823 },
      { name: 'Cruise', tagId: 221 },
      { name: 'Yuvacık turları', tagId: 2421 },
      { name: 'Kıbrıs turları', tagId: 3038 },
    ],
  },
  {
    name: 'Kahvaltı',
    tagId: 1,
    category: 'yeme-icme',
    children: [
      { name: 'Serpme kahvaltı', tagId: 569 },
      { name: 'Limitsiz çay dahil', tagId: 402 },
      { name: 'Deniz manzaralı kahvaltı', tagId: 3009 },
      { name: 'Açık büfe kahvaltı', tagId: 170 },
      { name: 'Boğazda kahvaltı', tagId: 453 },
      { name: 'Köy kahvaltısı', tagId: 320 },
      { name: 'Teknede kahvaltı', tagId: 2448 },
      { name: 'Brunch', tagId: 42 },
    ],
  },
  {
    name: 'Yemek',
    category: 'yeme-icme',
    children: [
      {
        name: 'Akşam yemeği',
        tagId: 57,
        children: [{ name: 'Romantik akşam yemeği', tagId: 17441 }],
      },
      { name: 'Canlı müzik', tagId: 197 },
      { name: 'Boğazda yemek', tagId: 1973 },
      { name: 'Deniz manzaralı yemek', tagId: 561 },
      { name: 'Müzikli yemek', tagId: 2412 },
      { name: 'Teknede akşam yemeği', tagId: 2449 },
      { name: 'Fasıl', tagId: 20 },
      { name: 'Öğle yemeği', tagId: 913 },
      { name: 'Deniz ürünleri', tagId: 1462 },
      {
        name: 'Balık mekanları',
        tagId: 90,
        children: [
          { name: 'Levrek', tagId: 331 },
          { name: 'Boğazda balık', tagId: 1974 },
        ],
      },
      { name: 'Avrupa Yakası restoranları', tagId: 6374 },
      { name: 'Meyhane', tagId: 205 },
      {
        name: 'Fast food',
        tagId: 287,
        children: [
          { name: 'Hamburger', tagId: 208 },
          { name: 'Dürüm', tagId: 257 },
          { name: 'Pide', tagId: 189 },
          { name: 'Pizza', tagId: 44 },
          { name: 'Lahmacun', tagId: 252 },
          { name: 'Kumru', tagId: 637 },
        ],
      },
      { name: 'Et yemekleri', tagId: 638 },
      { name: 'Tavuk yemekleri', tagId: 639 },
      { name: 'Kebap mekanları', tagId: 72 },
      { name: 'Döner', tagId: 254 },
      { name: 'Köfte', tagId: 180 },
      { name: 'İskender', tagId: 377 },
      { name: 'Izgara', tagId: 721 },
      { name: 'Mangal', tagId: 360 },
      { name: 'Meze', tagId: 1856 },
      { name: 'Anadolu Yakası restoranları', tagId: 6373 },
      { name: 'Salata', tagId: 530 },
      { name: 'Ev yemekleri', tagId: 625 },
      { name: 'Dünya mutfağı', tagId: 1231 },
    ],
  },
  {
    name: 'Güzellik',
    tagId: 16,
    category: 'guzellik-bakim',
    children: [
      {
        name: 'Cilt bakımı',
        tagId: 13,
        children: [
          { name: 'Hydrafacial', tagId: 3306 },
          { name: 'Hollywood cilt bakımı', tagId: 6494 },
          { name: 'Amerikan cilt bakımı', tagId: 6486 },
        ],
      },
      { name: 'Peeling', tagId: 269 },
      { name: 'İstenmeyen tüy bakımı', tagId: 9 },
      {
        name: 'Kalıcı oje',
        tagId: 173,
        children: [{ name: 'Shellac', tagId: 414 }],
      },
      { name: 'Protez tırnak', tagId: 140 },
      { name: 'Jel tırnak', tagId: 6421 },
      { name: 'Manikür', tagId: 51 },
      {
        name: 'Pedikür',
        tagId: 88,
        children: [{ name: 'Ayak bakımı', tagId: 566 }],
      },
      { name: 'Kirpik', tagId: 70 },
      { name: 'Kirpik lifting', tagId: 6411 },
      { name: 'İpek kirpik', tagId: 342 },
      { name: 'Kaş alımı', tagId: 653 },
      { name: 'Kaş dizaynı', tagId: 1690 },
      { name: 'Kaş laminasyonu', tagId: 6490 },
      { name: 'Kuaför', tagId: 7 },
      { name: 'Saç bakımı', tagId: 574 },
      { name: 'Saç kesimi', tagId: 199 },
      { name: 'Fön', tagId: 115 },
      { name: 'Brezilya fönü', tagId: 19 },
      {
        name: 'Saç boyama',
        tagId: 171,
        children: [{ name: 'Ombre', tagId: 2468 }],
      },
      { name: 'Balyaj', tagId: 420 },
      { name: 'Röfle', tagId: 123 },
      { name: 'Dip boya', tagId: 478 },
      { name: 'Perma', tagId: 178 },
      { name: 'Keratin', tagId: 218 },
      { name: 'Saç kaynak', tagId: 2063 },
      { name: 'Makyaj', tagId: 27 },
      { name: 'Gelin makyajı', tagId: 658 },
      { name: 'Gelin başı', tagId: 183 },
      { name: 'Selülit bakım', tagId: 76 },
      { name: 'Çatlak bakımı', tagId: 2463 },
      { name: 'Radyo frekans', tagId: 706 },
      { name: 'Popo kaldırma', tagId: 1958 },
      { name: 'Göğüs dikleştirme', tagId: 1090 },
      { name: 'Gıdı toparlama uygulaması', tagId: 17830 },
      { name: 'Ağda', tagId: 17776 },
    ],
  },
  {
    name: 'Oteller',
    category: 'tatil',
    children: [
      {
        name: 'Şehir otelleri',
        tagId: 1538,
        children: [
          { name: 'Avrupa Yakası otelleri', tagId: 3048 },
          { name: 'Anadolu Yakası otelleri', tagId: 3047 },
          { name: 'Havalimanına yakın oteller', tagId: 2484 },
        ],
      },
      { name: 'Tatil otelleri', tagId: 2098 },
      { name: 'Yakın çevre otelleri', tagId: 1840 },
      { name: 'Termal oteller', tagId: 1220 },
      { name: 'Denize sıfır oteller', tagId: 679 },
      { name: 'Kumburgaz plaj otelleri', tagId: 363 },
      { name: 'Ağva otelleri', tagId: 31 },
      { name: 'Kartepe otelleri', tagId: 3055 },
      { name: 'Yalova otelleri', tagId: 1811 },
      { name: 'Kapadokya otelleri', tagId: 3018 },
      { name: 'Bodrum otelleri', tagId: 36 },
      { name: 'Çeşme otelleri', tagId: 332 },
      { name: 'Ayvalık otelleri', tagId: 3037 },
      { name: 'Marmaris otelleri', tagId: 308 },
      { name: 'Fethiye otelleri', tagId: 284 },
      { name: 'Antalya otelleri', tagId: 283 },
      { name: 'Kuşadası otelleri', tagId: 304 },
      { name: 'Dalyan otelleri', tagId: 392 },
      { name: 'Manavgat otelleri', tagId: 1815 },
    ],
  },
  {
    name: 'Konser',
    tagId: 34,
    category: 'etkinlik',
    children: [
      { name: "90'lar gecesi", tagId: 3294 },
      { name: 'DJ X konseri', tagId: 17595 },
      { name: 'Ogün Şanlısoy konseri', tagId: 3128 },
      { name: 'Kılıç The Band konseri', tagId: 6424 },
    ],
  },
  { name: 'Stand up', tagId: 2390, category: 'etkinlik' },
  {
    name: 'Kurs',
    category: 'etkinlik',
    children: [
      { name: 'Workshop', tagId: 445 },
      { name: 'Atölye', tagId: 6334 },
      { name: 'Özel ders', tagId: 570 },
      { name: 'Dans kursu', tagId: 214 },
      { name: 'Bale kursu', tagId: 1216 },
      { name: 'Hip hop kursu', tagId: 2556 },
      { name: 'Latin dansları kursu', tagId: 2018 },
      { name: 'Oryantal kursu', tagId: 443 },
      { name: 'Zumba kursu', tagId: 1520 },
      { name: 'Güzel sanatlar kursu', tagId: 2773 },
      { name: 'Oyunculuk kursu', tagId: 710 },
      { name: 'Spor kursu', tagId: 2670 },
      { name: 'Fitness kursu', tagId: 2693 },
      { name: 'Tenis kursu', tagId: 1424 },
      { name: 'Hobi & el sanatları kursu', tagId: 2919 },
      { name: 'Mum yapımı kursu', tagId: 1694 },
      { name: 'Teraryum kursu', tagId: 2925 },
      { name: 'Güzellik kursu', tagId: 2720 },
    ],
  },
  {
    name: 'Hizmet',
    category: 'ev-yasam',
    children: [
      { name: 'Oto kuaför', tagId: 3016 },
      { name: 'Oto bakım', tagId: 3006 },
      {
        name: 'Araba',
        tagId: 11,
        children: [
          { name: 'Oto yıkama', tagId: [143, 759] },
          { name: 'Cilalı yıkama', tagId: 686 },
          { name: 'Pasta cila', tagId: 162 },
          { name: 'Jant temizliği', tagId: 712 },
          { name: 'Motor koruma', tagId: 1738 },
          { name: 'Motor temizliği', tagId: 1733 },
          { name: 'Boya koruma', tagId: 374 },
          { name: 'Cam filmi', tagId: 703 },
          { name: 'Döşeme temizliği', tagId: 1732 },
          { name: 'Far temizliği', tagId: 1918 },
          { name: 'Yağmur kaydırıcı', tagId: 2256 },
        ],
      },
      { name: 'Araç seramik kaplama', tagId: 2457 },
      {
        name: 'Temizlik',
        tagId: 174,
        children: [
          { name: 'Ev temizliği', tagId: 290 },
          { name: 'Halı yıkama', tagId: 148 },
        ],
      },
      { name: 'Koltuk yıkama', tagId: 3281 },
      {
        name: 'Kiralama',
        tagId: 150,
        children: [{ name: 'Yat kiralama', tagId: 1013 }],
      },
      { name: 'Tekne kiralama', tagId: 2100 },
      { name: 'Woist kiralama', tagId: 17766 },
      { name: 'Transfer hizmeti', tagId: 1452 },
      { name: 'Haşere ilaçlama', tagId: 898 },
      { name: 'Organizasyon', tagId: 1394 },
      {
        name: 'Düğün',
        tagId: 3291,
        children: [{ name: 'Düğün organizasyonu', tagId: 83 }],
      },
      {
        name: 'Fal',
        tagId: 210,
        children: [{ name: 'Kahve falı', tagId: 1299 }],
      },
    ],
  },
];

export interface FlatTopic {
  slug: string;
  name: string;
  tagIds: number[];
  /** Ancestor slugs, root first. */
  path: string[];
  /** FırsatBol category of the root node. */
  category: string;
  children: string[];
  depth: number;
}

const slugOf = (name: string) => slugify(name, 60);

/** Flattened tree keyed by slug (slugs are unique across the tree). */
export const TOPICS: ReadonlyMap<string, FlatTopic> = (() => {
  const map = new Map<string, FlatTopic>();
  const walk = (node: TopicNode, path: string[], category: string, depth: number) => {
    const slug = slugOf(node.name);
    if (map.has(slug)) throw new Error(`taxonomy: "${node.name}" iki kez tanımlanmış (${slug})`);
    map.set(slug, {
      slug,
      name: node.name,
      tagIds: node.tagId === undefined ? [] : typeof node.tagId === 'number' ? [node.tagId] : [...node.tagId],
      path,
      category,
      children: (node.children ?? []).map((child) => slugOf(child.name)),
      depth,
    });
    for (const child of node.children ?? []) walk(child, [...path, slug], category, depth + 1);
  };
  for (const root of TAXONOMY) walk(root, [], root.category, 0);
  return map;
})();

export const ROOT_TOPICS: readonly string[] = TAXONOMY.map((root) => slugOf(root.name));
