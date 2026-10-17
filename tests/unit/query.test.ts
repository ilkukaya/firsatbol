import { describe, expect, it } from 'vitest';
import { NATIONWIDE, filterEntries, paginate, sortEntries, merchantKey } from '../../src/lib/deals/query';
import { laterPages } from '../../src/lib/deals/pages';
import type { DealIndexEntry } from '../../src/lib/deals/schema';

const entry = (over: Partial<DealIndexEntry>): DealIndexEntry => ({
  id: 'x',
  s: 's',
  t: 'T',
  m: null,
  c: 'yeme-icme',
  ct: null,
  cn: null,
  d: null,
  p: null,
  op: null,
  dp: null,
  cur: 'TRY',
  img: null,
  pv: 'p',
  pn: 'P',
  vu: null,
  vf: null,
  f: 0,
  ns: null,
  pf: 0,
  q: '',
  ...over,
});

const list = [
  entry({ id: 'a', p: 300, dp: 10, ct: 'istanbul', t: 'Kahvaltı', d: 'Beşiktaş', q: '', m: 'Örnek Kafe', vf: '2026-10-01T00:00:00Z' }),
  entry({ id: 'b', p: 100, c: 'tatil', t: 'Otel', cn: 'Bursa', q: '', vf: '2026-10-10T00:00:00Z', vu: '2026-10-20T00:00:00Z' }),
  entry({ id: 'c', p: null, dp: 50, ct: 'istanbul', t: 'Spa', q: 'masaj', f: 1 }),
];

describe('filters', () => {
  it('filters by category, city, merchant and query', () => {
    expect(filterEntries(list, { kategori: 'tatil' }).map((e) => e.id)).toEqual(['b']);
    expect(filterEntries(list, { sehir: 'istanbul' }).map((e) => e.id)).toEqual(['a', 'c']);
    expect(filterEntries(list, { q: 'Kahvaltı' }).map((e) => e.id)).toEqual(['a']);
    expect(filterEntries(list, { magaza: merchantKey('Örnek Kafe') }).map((e) => e.id)).toEqual(['a']);
  });
  it('sorts with null prices last', () => {
    expect(sortEntries(list, 'fiyat-artan').map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(sortEntries(list, 'fiyat-azalan').map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(sortEntries(list, 'yeni').map((e) => e.id)[0]).toBe('b');
    expect(sortEntries(list, 'onerilen').map((e) => e.id)[0]).toBe('c');
    expect(sortEntries(list, 'bitis').map((e) => e.id)[0]).toBe('b');
  });
  it('filters by price band and Türkiye-wide deals', () => {
    expect(filterEntries(list, { fiyat: '0-250' }).map((e) => e.id)).toEqual(['b']);
    expect(filterEntries(list, { fiyat: '250-500' }).map((e) => e.id)).toEqual(['a']);
    // deals without a price never match a band; an unknown band filters nothing
    expect(filterEntries(list, { fiyat: '5000-' }).map((e) => e.id)).toEqual([]);
    expect(filterEntries(list, { fiyat: 'yok' }).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(filterEntries(list, { sehir: NATIONWIDE }).map((e) => e.id)).toEqual(['b']);
  });
  it('sorts by newest id when the source has no start dates, and by next session', () => {
    const plain = [entry({ id: 'p:10' }), entry({ id: 'p:30' }), entry({ id: 'p:20' })];
    expect(sortEntries(plain, 'yeni').map((e) => e.id)).toEqual(['p:30', 'p:20', 'p:10']);
    const events = [entry({ id: 'x', ns: '2026-11-02T18:00:00Z' }), entry({ id: 'y' }), entry({ id: 'z', ns: '2026-10-20T18:00:00Z' })];
    expect(sortEntries(events, 'seans').map((e) => e.id)).toEqual(['z', 'x', 'y']);
  });
  it('lists the numbered pages after the first', () => {
    expect(laterPages(48, 48)).toEqual([]);
    expect(laterPages(49, 48)).toEqual([2]);
    expect(laterPages(150, 48)).toEqual([2, 3, 4]);
    expect(laterPages(0, 48)).toEqual([]);
  });
  it('paginates safely', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], page: 2, totalPages: 3 });
    expect(paginate([], 9, 2)).toEqual({ items: [], page: 1, totalPages: 1 });
  });
});
