import { describe, expect, it } from 'vitest';
import { parseEvent, scrubQuery, summarizeEvents } from '../../src/lib/analytics/events';
import { dealsFingerprint } from '../../src/lib/deals/fingerprint';
import { normalizeDeal } from '../../src/lib/deals/normalize';

describe('analytics events', () => {
  it('accepts valid events and strips query strings from paths', () => {
    expect(parseEvent({ type: 'deal_click', path: '/firsatlar/?q=x', deal: 'firsatbufirsat:1', provider: 'firsatbufirsat' })).toEqual({
      type: 'deal_click',
      path: '/firsatlar/',
      deal: 'firsatbufirsat:1',
      provider: 'firsatbufirsat',
    });
  });
  it('rejects unknown types, extra-long values and markup', () => {
    expect(parseEvent({ type: 'purchase', path: '/' })).toBeNull();
    expect(parseEvent({ type: 'deal_click', path: 'https://evil.test/' })).toBeNull();
    expect(parseEvent({ type: 'deal_click', path: '/', deal: '<script>' })).toBeNull();
  });
  it('drops search terms that look like personal data', () => {
    expect(scrubQuery('Kahvaltı  Beşiktaş')).toBe('kahvaltı beşiktaş');
    expect(scrubQuery('ali@example.com')).toBeUndefined();
    expect(scrubQuery('0532 123 45 67')).toBeUndefined();
    expect(parseEvent({ type: 'search', path: '/arama/', q: 'mail@x.com' })).toBeNull();
  });
  it('summarises clicks, views and CTR', () => {
    const events = [
      { type: 'deal_view' as const, path: '/', deal: 'a', category: 'tatil' },
      { type: 'deal_view' as const, path: '/', deal: 'a', category: 'tatil' },
      { type: 'deal_click' as const, path: '/', deal: 'a', provider: 'p', category: 'tatil', placement: 'detail' },
      { type: 'search' as const, path: '/arama/', q: 'otel', results: 0 },
    ];
    const summary = summarizeEvents(events, '2026-10-10', '2026-10-16');
    expect(summary.totals).toEqual({ deal_view: 2, deal_click: 1, search: 1 });
    expect(summary.topDeals[0]).toEqual({ deal: 'a', clicks: 1, views: 2, ctr: 50 });
    expect(summary.topSearches[0]).toEqual({ q: 'otel', count: 1, zeroResults: 1 });
    expect(summary.clicksByProvider).toEqual({ p: 1 });
  });
});

describe('dealsFingerprint', () => {
  const ctx = {
    providerId: 'test',
    providerName: 'Test',
    attribution: { required: false, providerId: 'test', text: '', url: null },
    trackingStatus: 'unverified' as const,
    now: new Date('2026-10-16T00:00:00Z'),
    redact: [],
    indexProviderPages: false,
  };
  const make = (price: number) => {
    const result = normalizeDeal({ externalId: 1, title: 'Fırsat', sourceUrl: 'https://a.com/1', price }, ctx);
    if (!result.ok) throw new Error('fixture');
    return result.deal;
  };
  it('is order independent and changes when prices change', () => {
    expect(dealsFingerprint([make(10)])).toBe(dealsFingerprint([make(10)]));
    expect(dealsFingerprint([make(10)])).not.toBe(dealsFingerprint([make(11)]));
    expect(dealsFingerprint([])).toMatch(/^0-/);
  });
});
