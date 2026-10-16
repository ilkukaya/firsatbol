import { describe, expect, it } from 'vitest';
import { citySegmentPages, districtFacets, districtTagPages, tagFacets, tagLabel, tagSlug } from '../../src/lib/deals/facets';
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
const deal = (city: string, district: string, tags: string): Deal => {
  n += 1;
  const result = normalizeDeal({ externalId: n, title: `Fırsat ${n}`, sourceUrl: `https://a.com/${n}`, city, district, tags }, ctx);
  if (!result.ok) throw new Error('fixture');
  return result.deal;
};

const deals = [
  ...Array.from({ length: 4 }, () => deal('İstanbul', 'Kadıköy', 'masaj,spa,köpük masajı')),
  ...Array.from({ length: 2 }, () => deal('İstanbul', 'Kadıköy', 'kahvaltı')),
  ...Array.from({ length: 3 }, () => deal('İstanbul', 'Şişli', 'masaj')),
  deal('Ankara', 'Çankaya', 'masaj'),
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
    ]);
  });
  it('creates district × tag pages and city × tag pages without slug clashes', () => {
    const dt = districtTagPages(deals).map((p) => `${p.districtSlug}/${p.slug}:${p.deals.length}`);
    expect(dt).toEqual(expect.arrayContaining(['kadikoy/masaj:4', 'kadikoy/spa:4', 'kadikoy/kopuk-masaji:4', 'sisli/masaj:3']));
    expect(dt.some((p) => p.startsWith('kadikoy/kahvalti'))).toBe(false); // only 2 deals
    const segments = citySegmentPages(deals);
    expect(segments.filter((p) => p.kind === 'district').map((p) => p.slug)).toEqual(['kadikoy', 'sisli']);
    expect(segments.find((p) => p.kind === 'tag' && p.slug === 'masaj')?.deals).toHaveLength(7);
    expect(segments.some((p) => p.citySlug === 'ankara')).toBe(false);
  });
});
