import { describe, expect, it } from 'vitest';
import {
  canonicalDestination,
  dedupeDeals,
  mapCategory,
  normalizeDeal,
  parseDate,
  parsePrice,
  parseUrl,
  resolveDiscount,
  toPlainText,
  type NormalizeContext,
  parseOptions,
} from '../../src/lib/deals/normalize';
import { slugify } from '../../src/lib/slug';
import { normalizeCity } from '../../src/config/cities';

const ctx: NormalizeContext = {
  providerId: 'test',
  providerName: 'Test',
  attribution: { required: true, providerId: 'test', text: 'x', url: null },
  trackingStatus: 'unverified',
  now: new Date('2026-10-16T12:00:00Z'),
  redact: ['SECRETKEY123'],
  indexProviderPages: false,
};

describe('slugify', () => {
  it('handles Turkish characters', () => {
    expect(slugify('Yeme & İçme Fırsatları')).toBe('yeme-ve-icme-firsatlari');
    expect(slugify('ŞIĞÜÖÇ şığüöç')).toBe('siguoc-siguoc');
    expect(slugify('  --Eskişehir!! ')).toBe('eskisehir');
  });
});

describe('parsePrice', () => {
  it.each([
    [1299, 1299],
    ['1.299', 1299],
    ['1.299,90 TL', 1299.9],
    ['₺1,299.90', 1299.9],
    ['49,90', 49.9],
    ['12.99', 12.99],
    ['12.500.000', 12500000],
    ['0,99', 0.99],
    ['1,299', 1299],
  ])('%s → %s', (input, expected) => expect(parsePrice(input)).toBe(expected));
  it('rejects junk', () => {
    expect(parsePrice('ücretsiz')).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('-5')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses Turkish date as end of day Istanbul', () => {
    expect(parseDate('31.12.2026')).toBe('2026-12-31T20:59:59.000Z');
  });
  it('parses Turkish datetime', () => {
    expect(parseDate('01.11.2026 18:30')).toBe('2026-11-01T15:30:00.000Z');
  });
  it('parses unix seconds and ms', () => {
    expect(parseDate(1_800_000_000)).toBe(new Date(1_800_000_000_000).toISOString());
    expect(parseDate('1800000000000')).toBe(new Date(1_800_000_000_000).toISOString());
  });
  it('parses naive ISO as Istanbul time', () => {
    expect(parseDate('2026-10-20 10:00:00')).toBe('2026-10-20T07:00:00.000Z');
  });
  it('returns null for garbage', () => expect(parseDate('yakında')).toBeNull());
});

describe('resolveDiscount', () => {
  it('calculates only when both prices are known', () => {
    expect(resolveDiscount(1000, 650, null)).toEqual({ percent: 35, source: 'calculated' });
    expect(resolveDiscount(null, 650, null)).toEqual({ percent: null, source: null });
  });
  it('rejects provider percent that contradicts prices', () => {
    expect(resolveDiscount(1000, 900, 70)).toEqual({ percent: 10, source: 'calculated' });
    expect(resolveDiscount(1000, 300, 70)).toEqual({ percent: 70, source: 'provider' });
  });
  it('never shows a discount when price is not lower', () => {
    expect(resolveDiscount(500, 500, null).percent).toBeNull();
  });
});

describe('parseUrl', () => {
  it('strips secrets and apiKey params', () => {
    expect(parseUrl('https://a.com/x?apiKey=SECRETKEY123&ref=7', ['SECRETKEY123'])).toBe('https://a.com/x?ref=7');
    expect(parseUrl('https://a.com/x?k=SECRETKEY123', ['SECRETKEY123'])).toBe('https://a.com/x');
    expect(parseUrl('https://a.com/SECRETKEY123/x', ['SECRETKEY123'])).toBeNull();
  });
  it('rejects non-http schemes', () => {
    expect(parseUrl('javascript:alert(1)')).toBeNull();
    expect(parseUrl('//cdn.a.com/i.jpg')).toBe('https://cdn.a.com/i.jpg');
  });
});

describe('toPlainText', () => {
  it('strips tags and decodes entities', () => {
    expect(toPlainText('<p>Merhaba &amp; <b>dünya</b></p><script>x()</script>')).toBe('Merhaba & dünya');
  });
});

describe('mapCategory', () => {
  it('maps provider categories', () => {
    expect(mapCategory('Yeme İçme', 'x')).toBe('yeme-icme');
    expect(mapCategory('Güzellik & Spa', 'x')).toBe('guzellik-bakim');
    expect(mapCategory('Tatil / Otel', 'x')).toBe('tatil');
    expect(mapCategory(null, 'Stand-up gösterisi bileti')).toBe('etkinlik');
    expect(mapCategory(null, 'Tanımsız şey')).toBe('alisveris');
  });
});

describe('normalizeCity', () => {
  it('maps variants to provinces', () => {
    expect(normalizeCity('ISTANBUL')).toEqual({ name: 'İstanbul', slug: 'istanbul' });
    expect(normalizeCity('istanbul avrupa yakası')?.slug).toBe('istanbul');
    expect(normalizeCity('İZMİR')?.name).toBe('İzmir');
    expect(normalizeCity('Atlantis')).toBeUndefined();
  });
});

describe('normalizeDeal', () => {
  it('builds a valid deal without inventing facts', () => {
    const result = normalizeDeal({ externalId: 7, title: 'Kahvaltı', sourceUrl: 'https://a.com/7', price: '100' }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deal.originalPrice).toBeNull();
    expect(result.deal.discountPercent).toBeNull();
    expect(result.deal.validUntil).toBeNull();
    expect(result.deal.trackingStatus).toBe('none');
    expect(result.deal.indexable).toBe(false);
    expect(result.deal.id).toBe('test:7');
  });
  it('rejects records without title or URL', () => {
    expect(normalizeDeal({ sourceUrl: 'https://a.com' }, ctx)).toMatchObject({ ok: false, reason: 'missing-title' });
    expect(normalizeDeal({ title: 'Başlık' }, ctx)).toMatchObject({ ok: false, reason: 'missing-url' });
  });
  it('marks expired deals', () => {
    const result = normalizeDeal({ title: 'Eski', sourceUrl: 'https://a.com/e', validUntil: '01.01.2026' }, ctx);
    expect(result.ok && result.deal.status).toBe('expired');
  });
  it('drops an original price that is not higher than the price', () => {
    const result = normalizeDeal({ title: 'Eşit', sourceUrl: 'https://a.com/e', price: 100, originalPrice: 100 }, ctx);
    expect(result.ok && result.deal.originalPrice).toBeNull();
  });
});

describe('dedupeDeals', () => {
  it('dedupes by id and canonical destination', () => {
    const make = (id: string, url: string) => {
      const result = normalizeDeal({ externalId: id, title: `T ${id}`, sourceUrl: url }, ctx);
      if (!result.ok) throw new Error('fixture');
      return result.deal;
    };
    const { deals, duplicates } = dedupeDeals([
      make('1', 'https://www.a.com/x?utm_source=z'),
      make('2', 'https://a.com/x'),
      make('1', 'https://a.com/other'),
      make('3', 'https://a.com/y'),
    ]);
    expect(deals.map((d) => d.externalId)).toEqual(['1', '3']);
    expect(duplicates).toBe(2);
    expect(canonicalDestination('https://www.a.com/x/?b=2&a=1&utm_medium=x#f')).toBe('a.com/x?a=1&b=2');
  });
});

describe('parseOptions', () => {
  const raw = [
    { id: 11, title: 'Tek kişilik', dealPriceWithSymbol: '3.031 TL', checkoutLink: 'https://p.example/cart?pid=842&subDealId=11' },
    { id: 12, title: 'İki kişilik', dealPriceWithSymbol: '4.038 TL', checkoutLink: 'https://p.example/cart?subDealId=12' },
    { title: 'Gizli', dealPriceWithSymbol: '1 TL', checkoutLink: 'https://p.example/cart?pid=842&apiKey=SECRET' },
  ];
  it('keeps only tracked option links and redacts secrets', () => {
    const options = parseOptions(raw, ['SECRET'], '842');
    expect(options.map((o) => [o.id, o.price, o.url])).toEqual([
      ['11', 3031, 'https://p.example/cart?pid=842&subDealId=11'],
      ['12', 4038, null], // no publisher id → not a referral link
      [null, 1, 'https://p.example/cart?pid=842'],
    ]);
  });
  it('drops links when the publisher id is unknown', () => {
    expect(parseOptions(raw).every((o) => o.url === null)).toBe(true);
  });
});
