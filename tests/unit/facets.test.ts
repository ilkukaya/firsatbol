import { describe, expect, it } from 'vitest';
import {
  citySegmentPages,
  districtFacets,
  districtTagPages,
  subcategoryFacets,
  tagFacets,
  tagLabel,
  tagSlug,
  topicAncestorCrumbs,
  topicChildLinks,
  topicLinkGroups,
} from '../../src/lib/deals/facets';
import { resolveTopics } from '../../src/lib/deals/topics';
import { TOPICS } from '../../src/config/taxonomy';
import { normalizeDeal, type NormalizeContext } from '../../src/lib/deals/normalize';
import type { Deal } from '../../src/lib/deals/schema';

const ctx: NormalizeContext = {
  providerId: 'test',
  providerName: 'Test',
  attribution: { required: false, providerId: 'test', text: '', url: null },
  trackingStatus: 'unverified',
  now: new Date('2026-10-16T00:00:00Z'),
  redact: [],
  indexProviderPages: false,
};
let n = 0;
const deal = (city: string, district: string, tags: string, topics: string[] = []): Deal => {
  n += 1;
  const result = normalizeDeal({ externalId: n, title: `Fırsat ${n}`, sourceUrl: `https://a.com/${n}`, city, district, tags }, ctx);
  if (!result.ok) throw new Error('fixture');
  // as in the repository: API memberships + tag matches + ancestors
  return { ...result.deal, topics: resolveTopics({ tags: result.deal.tags, topics }) };
};

const deals = [
  ...Array.from({ length: 4 }, () => deal('İstanbul', 'Kadıköy', 'masaj,spa,köpük masajı')),
  ...Array.from({ length: 2 }, () => deal('İstanbul', 'Kadıköy', 'kahvaltı')),
  ...Array.from({ length: 3 }, () => deal('İstanbul', 'Şişli', 'masaj')),
  deal('Ankara', 'Çankaya', 'masaj'),
  // memberships from the partner's tagIds[] queries, without a matching tag
  ...Array.from({ length: 3 }, () => deal('İstanbul', 'Beşiktaş', 'hafta sonu', ['hamam'])),
];

describe('facets', () => {
  it('slugs and labels tags in Turkish', () => {
    expect(tagSlug('Köpük Masajı')).toBe('kopuk-masaji');
    expect(tagLabel('ıslak alan')).toBe('Islak alan');
    expect(tagLabel('istanbul')).toBe('İstanbul');
  });
  it('builds tag facets above the threshold', () => {
    const tags = tagFacets(deals, 5);
    expect(tags.map((t) => [t.slug, t.deals.length])).toEqual([['masaj', 8]]);
  });
  it('builds district facets per city', () => {
    expect(districtFacets(deals).map((d) => [d.citySlug, d.slug, d.deals.length])).toEqual([
      ['istanbul', 'kadikoy', 6],
      ['istanbul', 'sisli', 3],
      ['istanbul', 'besiktas', 3],
    ]);
  });
  it('creates district × tag pages and city × tag pages without slug clashes', () => {
    const dt = districtTagPages(deals).map((p) => `${p.districtSlug}/${p.slug}:${p.deals.length}`);
    expect(dt).toEqual(expect.arrayContaining(['kadikoy/masaj:4', 'kadikoy/spa:4', 'kadikoy/kopuk-masaji:4', 'sisli/masaj:3']));
    expect(dt.some((p) => p.startsWith('kadikoy/kahvalti'))).toBe(false); // only 2 deals
    const segments = citySegmentPages(deals);
    expect(segments.filter((p) => p.kind === 'district').map((p) => p.slug)).toEqual(['kadikoy', 'sisli', 'besiktas']);
    // masaj = tagged deals + the Beşiktaş hamam deals (Hamam › Spa › Masaj)
    expect(segments.find((p) => p.kind === 'tag' && p.slug === 'masaj')?.deals).toHaveLength(10);
    expect(segments.find((p) => p.kind === 'tag' && p.slug === 'masaj')?.topic?.name).toBe('Masaj');
    expect(segments.some((p) => p.citySlug === 'ankara')).toBe(false);
  });

  it('resolves category-tree memberships with ancestors', () => {
    expect(resolveTopics({ tags: ['köpük masajı', 'çok satan'], topics: [] })).toEqual(['masaj', 'kopuk-masaji']);
    expect(resolveTopics({ tags: [], topics: ['kese', 'unknown'] })).toEqual(['masaj', 'spa', 'hamam', 'kese']);
    expect(resolveTopics({ tags: [], topics: ['komedi-tiyatro-oyunlari'] })).toEqual([
      'tiyatro',
      'yetiskin-tiyatrosu',
      'komedi-tiyatro-oyunlari',
    ]);
  });
  it('lets tree nodes win over plain tags and keeps other tags', () => {
    const facets = subcategoryFacets([...deals, deal('İzmir', 'Konak', 'hafta sonu'), deal('İzmir', 'Konak', 'hafta sonu')], 3, 3);
    expect(facets.find((f) => f.slug === 'masaj')?.topic).not.toBeNull();
    expect(facets.find((f) => f.slug === 'hafta-sonu')?.topic).toBeNull();
    expect(facets.filter((f) => f.slug === 'masaj')).toHaveLength(1);
    // a tag that only renames a node ("hamam keyfi" on exactly the Hamam deals) gets no page of its own
    const renamed = deals.map((d) => (d.topics.includes('hamam') ? { ...d, tags: [...d.tags, 'hamam keyfi'] } : d));
    expect(subcategoryFacets(renamed, 3, 3).some((f) => f.slug === 'hamam-keyfi')).toBe(false);
  });
  it('builds tree navigation for a scope', () => {
    const available = new Set(['masaj', 'spa', 'hamam', 'kopuk-masaji']);
    const href = (slug: string) => `/etiket/${slug}/`;
    const groups = topicLinkGroups(deals, available, href);
    expect(groups).toEqual([
      {
        title: 'Masaj',
        items: [
          { href: '/etiket/masaj/', label: 'Masaj', count: 11 },
          { href: '/etiket/spa/', label: 'Spa', count: 7 },
          { href: '/etiket/hamam/', label: 'Hamam', count: 3 },
          { href: '/etiket/kopuk-masaji/', label: 'Köpük masajı', count: 4 },
        ],
      },
    ]);
    expect(topicChildLinks(TOPICS.get('masaj')!, deals, available, href).items.map((i) => i.label)).toEqual(['Spa', 'Köpük masajı']);
    // a leaf lists its siblings
    const leaf = topicChildLinks(TOPICS.get('kopuk-masaji')!, deals, available, href);
    expect(leaf.title).toBe('Diğer masaj kategorileri');
    expect(leaf.items.map((i) => i.label)).toEqual(['Spa']);
    expect(topicAncestorCrumbs(TOPICS.get('hamam')!, available, href)).toEqual([
      { name: 'Masaj', path: '/etiket/masaj/' },
      { name: 'Spa', path: '/etiket/spa/' },
    ]);
  });
});
