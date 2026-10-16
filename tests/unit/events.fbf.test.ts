import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeEventSessions, parseEventsResponse } from '../../src/lib/providers/firsatbufirsat/events';
import { FBF_ATTRIBUTION_TEXT, FBF_FIELD_MAP, transformResponse } from '../../src/lib/providers/firsatbufirsat';

const now = new Date('2026-10-16T12:00:00Z');
const body = readFileSync('fixtures/firsatbufirsat/events-sample.json', 'utf8');
const ctx = {
  providerId: 'firsatbufirsat',
  providerName: 'Fırsat Bu Fırsat',
  attribution: { required: true, providerId: 'firsatbufirsat', text: FBF_ATTRIBUTION_TEXT, url: 'https://www.firsatbufirsat.com/' },
  trackingStatus: 'unverified' as const,
  now,
  redact: [],
  indexProviderPages: false,
  publisherId: 'PUBLISHER_TEST',
};

describe('Etkinlik API (real response shape)', () => {
  const page = parseEventsResponse(body, 'application/json', [], now);
  it('parses sessions with Istanbul time and venue data', () => {
    expect(page.total).toBe(5);
    expect(page.records).toHaveLength(5);
    const first = page.records[0]!;
    expect(first.dealId).toBe('55028');
    expect(first.session).toMatchObject({ date: '2026-10-17T10:00:00.000Z', price: 480, city: 'İstanbul', citySlug: 'istanbul' });
    expect(first.url).toContain('pid=PUBLISHER_TEST');
  });
  it('drops past sessions', () => {
    const later = parseEventsResponse(body, 'application/json', [], new Date('2026-10-20T00:00:00Z'));
    expect(later.records.map((record) => record.session.date)).toEqual(['2026-10-24T10:00:00.000Z', '2026-11-07T10:00:00.000Z']);
    expect(later.keys).toHaveLength(5); // repeated-page detection still sees every raw record
  });
  it('creates event-only deals with a "from" price and sorted sessions', () => {
    const { deals, created, attached } = mergeEventSessions([], page.records, ctx);
    expect(created).toBe(2);
    expect(attached).toBe(0);
    const multi = deals.find((deal) => deal.externalId === '55028')!;
    expect(multi.sessions).toHaveLength(4);
    expect(multi.sessions.map((session) => session.date)).toEqual([...multi.sessions.map((session) => session.date)].sort());
    expect(multi).toMatchObject({ category: 'etkinlik', price: 320, priceFrom: true, city: 'İstanbul', indexable: false });
    expect(multi.validUntil).toBe(multi.sessions.at(-1)!.date);
    expect(multi.affiliateUrl).toContain('pid=PUBLISHER_TEST');
  });
  it('attaches sessions to the matching deal from the deals API', () => {
    const dealsBody = readFileSync('fixtures/firsatbufirsat/real-sample.json', 'utf8');
    const base = transformResponse(
      dealsBody,
      'application/json',
      {
        id: 'firsatbufirsat',
        name: 'Fırsat Bu Fırsat',
        fieldMap: FBF_FIELD_MAP,
        publisherId: 'PUBLISHER_TEST',
        apiKey: undefined,
        trackingVerified: false,
        linkTemplate: undefined,
        categoryHint: undefined,
        indexProviderPages: false,
      },
      now,
    ).deals;
    const target = base[1]!; // spa deal
    const records = page.records.filter((record) => record.dealId === '55028').map((record) => ({ ...record, dealId: target.externalId }));
    const { deals, attached, created } = mergeEventSessions(base, records, ctx);
    expect(attached).toBe(1);
    expect(created).toBe(0);
    const merged = deals.find((deal) => deal.id === target.id)!;
    expect(merged.sessions).toHaveLength(4);
    expect(merged.title).toBe(target.title); // deal API data wins, sessions are added
    expect(deals).toHaveLength(base.length);
  });
});
