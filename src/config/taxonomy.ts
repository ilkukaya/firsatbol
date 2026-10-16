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
  tagId?: number;
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
];

export interface FlatTopic {
  slug: string;
  name: string;
  tagId: number | undefined;
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
    map.set(slug, {
      slug,
      name: node.name,
      tagId: node.tagId,
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
