import { describe, expect, it } from 'vitest';
import { filterEntries, paginate, sortEntries, merchantKey } from '../../src/lib/deals/query';
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
  it('paginates safely', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], page: 2, totalPages: 3 });
    expect(paginate([], 9, 2)).toEqual({ items: [], page: 1, totalPages: 1 });
  });
});
