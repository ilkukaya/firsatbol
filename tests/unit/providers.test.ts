import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRequestUrl,
  createFirsatBuFirsatAdapter,
  readFbfConfig,
  transformResponse,
  FBF_ATTRIBUTION_TEXT,
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

describe('transformResponse (JSON fixture)', () => {
  const body = readFileSync('fixtures/firsatbufirsat/sample.json', 'utf8');
  const result = transformResponse(body, 'application/json', baseConfig, now);
  it('accepts valid deals and rejects invalid/expired', () => {
    expect(result.format).toBe('json');
    expect(result.received).toBe(16);
    expect(result.expired).toBe(1);
    expect(result.rejectReasons['missing-url']).toBe(1);
    expect(result.deals.length).toBe(14); // incl. one duplicate removed later by dedupeDeals
  });
  it('attaches required attribution and detects publisher-tracked links', () => {
    const deal = result.deals[0]!;
    expect(deal.attribution).toMatchObject({ required: true, text: FBF_ATTRIBUTION_TEXT });
    expect(deal.affiliateUrl).toContain('PUBLISHER_TEST');
    expect(deal.trackingStatus).toBe('unverified');
    expect(deal.category).toBe('yeme-icme');
    expect(deal.citySlug).toBe('istanbul');
    expect(deal.discountPercent).toBe(35);
  });
  it('keeps unknown prices null', () => {
    const noPrice = result.deals.find((deal) => deal.externalId === '1011')!;
    expect(noPrice.price).toBeNull();
    expect(noPrice.discountPercent).toBeNull();
  });
  it('parses Turkish formatted prices', () => {
    const tech = result.deals.find((deal) => deal.externalId === '1006')!;
    expect(tech.price).toBe(1299.9);
    expect(tech.originalPrice).toBe(1899.9);
    expect(tech.category).toBe('teknoloji');
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
  it('paginates until an empty page', async () => {
    vi.stubEnv('FIRSATBUFIRSAT_API_KEY', 'K');
    vi.stubEnv('FIRSATBUFIRSAT_PUBLISHER_ID', 'P');
    vi.stubEnv('FIRSATBUFIRSAT_PAGE_PARAM', 'page');
    vi.stubEnv('FIRSATBUFIRSAT_MAX_PAGES', '5');
    vi.stubEnv('FIRSATBUFIRSAT_MIN_INTERVAL_MS', '0');
    const pages: Record<string, unknown> = {
      '1': { deals: [{ id: 1, title: 'Bir', url: 'https://a.com/1' }] },
      '2': { deals: [{ id: 2, title: 'İki', url: 'https://a.com/2' }] },
      '3': { deals: [] },
    };
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const page = new URL(String(input)).searchParams.get('page') ?? '1';
      return new Response(JSON.stringify(pages[page] ?? { deals: [] }), { headers: { 'content-type': 'application/json' } });
    });
    const result = await createFirsatBuFirsatAdapter(readFbfConfig()).fetchDeals({ now });
    expect(result.deals.map((d) => d.externalId)).toEqual(['1', '2']);
    expect(spy).toHaveBeenCalledTimes(3);
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
