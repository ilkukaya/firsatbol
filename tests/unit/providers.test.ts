import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FBF_ATTRIBUTION_TEXT,
  FBF_FIELD_MAP,
  buildRequestUrl,
  createFirsatBuFirsatAdapter,
  readFbfConfig,
  sweepPlan,
  transformResponse,
} from '../../src/lib/providers/firsatbufirsat';
import { detectFormat, extractRecords, parseBody } from '../../src/lib/providers/parse';
import { mapRecord, parseFieldMap } from '../../src/lib/providers/fields';
import { fetchText, redactUrl } from '../../src/lib/providers/http';

const now = new Date('2026-10-16T12:00:00Z');
const baseConfig = {
  id: 'firsatbufirsat',
  name: 'Fırsat Bu Fırsat',
  fieldMap: {},
  publisherId: 'PUBLISHER_TEST',
  apiKey: 'K3Y-SECRET',
  trackingVerified: false,
  linkTemplate: undefined,
  categoryHint: undefined,
  indexProviderPages: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('format detection', () => {
  it('detects json, xml and html', () => {
    expect(detectFormat('application/json', '{}')).toBe('json');
    expect(detectFormat('text/html', '[{"a":1}]')).toBe('json');
    expect(detectFormat('text/xml', '<?xml version="1.0"?><a/>')).toBe('xml');
    expect(detectFormat('text/html', '<?xml version="1.0"?><deals/>')).toBe('xml');
    expect(detectFormat('text/html', '<!DOCTYPE html><html></html>')).toBe('html');
  });
  it('finds the record list', () => {
    expect(extractRecords({ meta: { total: 2 }, data: { items: [{ a: 1 }, { a: 2 }] } }).path).toBe('$.data.items');
    expect(extractRecords([{ a: 1 }]).records).toHaveLength(1);
    expect(extractRecords({ x: 1 }).records).toHaveLength(0);
  });
});

describe('field mapping', () => {
  it('uses candidates and explicit maps', () => {
    const record = { Deal_ID: 5, baslik: 'Başlık', pricing: { final: '10' }, link: 'https://a.com' };
    expect(mapRecord(record).input).toMatchObject({ externalId: 5, title: 'Başlık', sourceUrl: 'https://a.com' });
    expect(mapRecord(record, { price: 'pricing.final' }).input.price).toBe('10');
    expect(parseFieldMap('{"price":"pricing.final","bogus":"x"}')).toEqual({ price: 'pricing.final' });
    expect(parseFieldMap('not json')).toEqual({});
  });
});

describe('transformResponse (real Fırsat Bu Fırsat response)', () => {
  const body = readFileSync('fixtures/firsatbufirsat/real-sample.json', 'utf8');
  const config = { ...baseConfig, fieldMap: FBF_FIELD_MAP };
  const result = transformResponse(body, 'application/json; charset=utf-8', config, now);
  const [zoo, spa, aquarium, nationwide] = result.deals;
  it('reads total, ids and the nationwide tail', () => {
    expect(result.format).toBe('json');
    expect(result.total).toBe(4);
    expect(result.recordIds).toEqual(['1148548', '984426', '632767', '9000001']);
    expect(result.nationwide).toBe(1);
    expect(result.nationwideTrailing).toBe(1);
    expect(result.deals).toHaveLength(4);
  });
  it('maps verified fields', () => {
    expect(zoo).toMatchObject({
      externalId: '1148548',
      merchant: 'Park Of İstanbul',
      city: 'İstanbul',
      district: 'Çekmeköy',
      originalPrice: 750,
      price: 429,
      discountPercent: 43,
      discountSource: 'provider',
      category: 'etkinlik',
      trackingStatus: 'unverified',
      validUntil: '2026-12-30T20:59:59.000Z',
    });
    expect(zoo!.affiliateUrl).toBe(
      'https://www.firsatbufirsat.com/firsat/park-of-istanbul-hayvanat-bahcesi-giris-bileti?pid=PUBLISHER_TEST',
    );
    expect(zoo!.imageUrl).toContain('/400x400/');
    expect(zoo!.imageLargeUrl).toContain('/1200x1200/');
    expect(zoo!.address).toContain('Çekmeköy');
    expect(zoo!.tags).toContain('hayvanat bahçesi');
    expect(zoo!.conditions.length).toBeGreaterThan(2);
    expect(zoo!.options[0]).toEqual({ title: expect.stringContaining('Çocuk'), price: 399, originalPrice: 550 });
  });
  it('never shows a discount when both prices are equal', () => {
    expect(spa).toMatchObject({ price: 2000, originalPrice: null, discountPercent: null, category: 'guzellik-bakim', validUntil: null });
    expect(spa!.options.every((option) => option.originalPrice === null)).toBe(true);
  });
  it('handles nationwide deals without a city', () => {
    expect(aquarium!.category).toBe('etkinlik');
    expect(nationwide).toMatchObject({ city: null, citySlug: null, district: null });
  });
  it('requires the provider attribution', () => {
    expect(zoo!.attribution).toMatchObject({ required: true, text: FBF_ATTRIBUTION_TEXT });
  });
  it('rejects provider error envelopes', () => {
    expect(() =>
      transformResponse('{"result":"ERROR","resultMessage":"Invalid apiKey","deals":[]}', 'application/json', config, now),
    ).toThrow(/Invalid apiKey/);
  });
});

describe('transformResponse (synthetic dev fixture)', () => {
  const body = readFileSync('fixtures/firsatbufirsat/sample.json', 'utf8');
  const result = transformResponse(body, 'application/json', { ...baseConfig, fieldMap: FBF_FIELD_MAP }, now);
  it('accepts valid deals and rejects invalid/expired', () => {
    expect(result.received).toBe(16);
    expect(result.expired).toBe(1);
    expect(result.rejectReasons['missing-url']).toBe(1);
    expect(result.deals.length).toBe(14);
  });
  it('parses Turkish formatted prices and keeps unknown prices null', () => {
    const tech = result.deals.find((deal) => deal.externalId === '1006')!;
    expect(tech).toMatchObject({ price: 1299.9, originalPrice: 1899.9, category: 'teknoloji' });
    const noPrice = result.deals.find((deal) => deal.externalId === '1011')!;
    expect(noPrice).toMatchObject({ price: null, discountPercent: null });
  });
});

describe('transformResponse (XML fixture)', () => {
  const body = readFileSync('fixtures/firsatbufirsat/sample.xml', 'utf8');
  it('parses XML records', () => {
    const result = transformResponse(body, 'text/xml', baseConfig, now);
    expect(result.format).toBe('xml');
    expect(result.deals).toHaveLength(2);
    const [first, second] = result.deals;
    expect(first).toMatchObject({ price: 650, originalPrice: 1000, discountPercent: 35, citySlug: 'izmir', category: 'yeme-icme' });
    expect(first!.description).toBe('XML örnek & açıklama');
    expect(second).toMatchObject({ price: 500, category: 'guzellik-bakim' });
  });
  it('refuses HTML responses with a helpful error', () => {
    expect(() => transformResponse('<!doctype html><html></html>', 'text/html', baseConfig, now)).toThrow(/HTML/);
  });
  it('parses parseBody for xml', () => {
    expect(parseBody('xml', '<a><b>1</b></a>')).toEqual({ a: { b: '1' } });
  });
});

describe('request building & secrets', () => {
  it('appends owner query then credentials', () => {
    vi.stubEnv('FIRSATBUFIRSAT_API_KEY', 'K3Y-SECRET');
    vi.stubEnv('FIRSATBUFIRSAT_PUBLISHER_ID', '42');
    vi.stubEnv('FIRSATBUFIRSAT_EXTRA_QUERY', 'city=istanbul&apiKey=evil');
    const config = readFbfConfig();
    const url = new URL(buildRequestUrl(config, 'popular=1', null));
    expect(url.origin + url.pathname).toBe('https://api.firsatbufirsat.com/deal/browse.html');
    expect(url.searchParams.get('city')).toBe('istanbul');
    expect(url.searchParams.get('popular')).toBe('1');
    expect(url.searchParams.getAll('apiKey')).toEqual(['K3Y-SECRET']);
    expect(redactUrl(url.toString(), ['K3Y-SECRET'])).not.toContain('K3Y-SECRET');
  });
  it('reports not-configured without throwing', async () => {
    vi.stubEnv('FIRSATBUFIRSAT_API_KEY', '');
    const adapter = createFirsatBuFirsatAdapter(readFbfConfig());
    expect(adapter.isConfigured()).toBe(false);
    const result = await adapter.fetchDeals({ now });
    expect(result.deals).toEqual([]);
    expect(result.diagnostics.configured).toBe(false);
  });
  it('never leaks the key in diagnostics on failure', async () => {
    vi.stubEnv('FIRSATBUFIRSAT_API_KEY', 'K3Y-SECRET');
    vi.stubEnv('FIRSATBUFIRSAT_PUBLISHER_ID', '42');
    vi.stubEnv('FIRSATBUFIRSAT_RETRIES', '0');
    vi.stubEnv('FIRSATBUFIRSAT_MIN_INTERVAL_MS', '0');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const result = await createFirsatBuFirsatAdapter(readFbfConfig()).fetchDeals({ now });
    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.error).toContain('401');
    expect(result.diagnostics.requests).toBe(1);
    expect(JSON.stringify(result.diagnostics)).not.toContain('K3Y-SECRET');
  });
  it('sweeps provinces: locals first, nationwide tail collected once, repeated pages stop', async () => {
    vi.stubEnv('FIRSATBUFIRSAT_API_KEY', 'K');
    vi.stubEnv('FIRSATBUFIRSAT_PUBLISHER_ID', 'P');
    vi.stubEnv('FIRSATBUFIRSAT_CITY_IDS', '1,2,3');
    vi.stubEnv('FIRSATBUFIRSAT_MIN_INTERVAL_MS', '0');
    const deal = (id: string, city: string) => ({
      id,
      title: `Fırsat ${id}`,
      city,
      showDealUrl: `https://www.firsatbufirsat.com/firsat/${id}?pid=P`,
      dealPriceWithSymbol: '100 ₺',
    });
    const nationwide = Array.from({ length: 12 }, (_, i) => deal(`n${i}`, ''));
    const locals: Record<string, ReturnType<typeof deal>[]> = {
      '1': Array.from({ length: 4 }, (_, i) => deal(`a${i}`, 'Adana')),
      '2': [],
      '3': [
        ...Array.from({ length: 6 }, (_, i) => deal(`i${i}`, 'İstanbul')),
        deal('mixed', ''),
        ...Array.from({ length: 8 }, (_, i) => deal(`j${i}`, 'İstanbul')),
      ],
    };
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const city = url.searchParams.get('cityId')!;
      const page = Number(url.searchParams.get('p'));
      calls.push(`${city}:${page}`);
      const all = [...locals[city]!, ...nationwide];
      const lastPage = Math.ceil(all.length / 10);
      const slice = all.slice((Math.min(page, lastPage) - 1) * 10, Math.min(page, lastPage) * 10); // API repeats its last page
      return new Response(JSON.stringify({ result: 'SUCCESS', total: all.length, deals: slice }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const result = await createFirsatBuFirsatAdapter(readFbfConfig()).fetchDeals({ now });
    const ids = result.deals.map((d) => d.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('n'))).toHaveLength(12); // nationwide collected once, fully
    expect(ids).toEqual(expect.arrayContaining(['a0', 'a3', 'i0', 'mixed', 'j7']));
    // city 1 paged to the end (short 2nd page ends it), city 2: one page of pure tail, city 3: continues past a mixed-in nationwide deal
    expect(calls.filter((c) => c.startsWith('1:'))).toEqual(['1:1', '1:2']);
    expect(calls.filter((c) => c.startsWith('2:'))).toEqual(['2:1']);
    expect(calls.filter((c) => c.startsWith('3:')).length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.ok).toBe(true);
  });
  it('plans one unfiltered query when the sweep is off', () => {
    expect(sweepPlan({ cityIds: null, extraQueries: [], popularQuery: undefined, newQuery: undefined })).toEqual([
      { query: undefined, scoped: false },
    ]);
    expect(
      sweepPlan({ cityIds: [7], extraQueries: ['cityId=41&townId=9'], popularQuery: undefined, newQuery: undefined }).map((q) => q.query),
    ).toEqual(['cityId=7', 'cityId=41&townId=9']);
  });
});

describe('fetchText retry', () => {
  it('retries 5xx then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('x', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await fetchText(
      'https://retry.test/x',
      'https://retry.test/x',
      { timeoutMs: 1000, retries: 2, baseDelayMs: 1, minIntervalMs: 0, userAgent: 't' },
      {},
      fetchImpl,
    );
    expect(result.attempts).toBe(2);
    expect(result.body).toBe('{"ok":1}');
  });
  it('does not retry 4xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('x', { status: 403 }));
    await expect(
      fetchText(
        'https://retry.test/y',
        'u',
        { timeoutMs: 1000, retries: 3, baseDelayMs: 1, minIntervalMs: 0, userAgent: 't' },
        {},
        fetchImpl,
      ),
    ).rejects.toMatchObject({ status: 403, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
