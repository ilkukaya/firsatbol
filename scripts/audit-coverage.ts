/**
 * Coverage audit: is there any Fırsat Bu Fırsat deal, category, province or district the site
 * does not show? Cross-checks the site's import against independent API queries:
 *
 *   FIRSATBUFIRSAT_API_KEY=… FIRSATBUFIRSAT_PUBLISHER_ID=… npm run audit:coverage
 *
 *  1. unfiltered catalog            → every deal id vs. the site's deals (expired ones explained)
 *  2. Etkinlik API                  → every event's deal id
 *  3. 81 province queries (cityId)  → every deal id (province × category queries are subsets)
 *  4. every category-tree tagId     → every deal id
 *  5. gaps in the data itself       → deals without category, city or district; empty categories
 *
 * Takes ~5–8 minutes (≈ 800 requests). Writes .cache/coverage-report.json (git-ignored).
 * Secrets never appear in the output.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DISTRICTS, isKnownDistrict } from '../src/config/districts';
import { TOPICS } from '../src/config/taxonomy';
import { facetsOf } from '../src/lib/deals/facets';
import { FACET_PAGE_SIZE } from '../src/lib/deals/query';
import { dedupeDeals, isActive } from '../src/lib/deals/normalize';
import { resolveTopics } from '../src/lib/deals/topics';
import { slugify } from '../src/lib/slug';
import { buildRequestUrl, createFirsatBuFirsatAdapter, parseIdPage, readFbfConfig } from '../src/lib/providers/firsatbufirsat';
import { parseEventsResponse } from '../src/lib/providers/firsatbufirsat/events';
import { fetchText, mapWithConcurrency, redactUrl } from '../src/lib/providers/http';
import { detectFormat, extractRecords, parseBody } from '../src/lib/providers/parse';

try {
  process.loadEnvFile?.('.env');
} catch {
  /* optional */
}

const config = readFbfConfig();
if (!config.apiKey || !config.publisherId) {
  console.error('FIRSATBUFIRSAT_API_KEY ve FIRSATBUFIRSAT_PUBLISHER_ID gerekli.');
  process.exit(1);
}
const secrets = [config.apiKey, config.publisherId];
const now = new Date();
let requests = 0;

async function get(query: string | undefined, page: number, endpoint = config.endpoint) {
  const url = buildRequestUrl(config, query, page, endpoint);
  const response = await fetchText(url, redactUrl(url, secrets), config.policy);
  requests += response.attempts;
  return response;
}

/** All raw records of a paged query (stops on a repeated or short page). */
async function records(query: string | undefined) {
  const seen = new Map<string, Record<string, unknown>>();
  let pageSize = 0;
  for (let page = config.pageStart; page < config.pageStart + config.maxPages; page += 1) {
    const response = await get(query, page);
    const list = extractRecords(parseBody(detectFormat(response.contentType, response.body), response.body)).records;
    const fresh = list.filter((record) => !seen.has(String(record.id)));
    if (fresh.length === 0) break;
    fresh.forEach((record) => seen.set(String(record.id), record));
    pageSize = Math.max(pageSize, list.length);
    if (list.length < pageSize) break;
  }
  return seen;
}

async function ids(query: string) {
  const all = new Set<string>();
  let pageSize = 0;
  for (let page = config.pageStart; page < config.pageStart + config.maxPages; page += 1) {
    const response = await get(query, page);
    const result = parseIdPage(response.body, response.contentType, 'id');
    const fresh = result.ids.filter((id) => !all.has(id));
    if (fresh.length === 0) break;
    fresh.forEach((id) => all.add(id));
    pageSize = Math.max(pageSize, result.ids.length);
    if (result.ids.length < pageSize || (result.total !== null && all.size >= result.total)) break;
  }
  return all;
}

const log = (line: string) => console.log(line);
const report: Record<string, unknown> = { generatedAt: now.toISOString() };

// --- the site's own import (exactly what a build publishes) ---------------------------------
log('1/6 Sitenin içe aktarımı çalıştırılıyor…');
const imported = await createFirsatBuFirsatAdapter(config).fetchDeals({ now });
if (!imported.diagnostics.ok) throw new Error(imported.diagnostics.error ?? 'sağlayıcı hatası');
const deals = dedupeDeals(imported.deals)
  .deals.filter((deal) => isActive(deal, now))
  .map((deal) => ({ ...deal, topics: resolveTopics(deal) }));
const site = new Set(deals.map((deal) => deal.externalId));
requests += imported.diagnostics.requests;

// --- 1. catalog --------------------------------------------------------------------------------
log('2/6 Katalog karşılaştırılıyor…');
const catalog = await records(undefined);
const missingCatalog = [...catalog.values()].filter((record) => !site.has(String(record.id)));
const expired = missingCatalog.filter((record) => {
  // "2026-12-30 23:59:59" (İstanbul time); `true` means no end date
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(String(record.couponEndDate ?? ''));
  return match ? new Date(`${match[1]}T${match[2]}+03:00`) < now : false;
});
const otherMissing = missingCatalog.filter((record) => !expired.includes(record));
// expired vouchers still listed by the partner are skipped on purpose, not missing
const skipped = new Set(expired.map((record) => String(record.id)));
const absent = (id: string) => !site.has(id) && !skipped.has(id);
report.catalog = {
  api: catalog.size,
  site: deals.length,
  expiredSkipped: expired.map((r) => ({ id: r.id, title: r.title, couponEndDate: r.couponEndDate })),
  missing: otherMissing.map((r) => ({ id: r.id, title: r.title, couponEndDate: r.couponEndDate })),
};

// --- 2. events -------------------------------------------------------------------------------
log('3/6 Etkinlik API karşılaştırılıyor…');
const eventDeals = new Set<string>();
const eventKeys = new Set<string>();
for (let page = config.pageStart; page < config.pageStart + config.maxPages; page += 1) {
  const response = await get(undefined, page, config.eventsEndpoint);
  const parsed = parseEventsResponse(response.body, response.contentType, secrets, now);
  const fresh = parsed.keys.filter((key) => !eventKeys.has(key));
  if (parsed.received === 0 || fresh.length === 0) break;
  fresh.forEach((key) => eventKeys.add(key));
  parsed.records.forEach((record) => eventDeals.add(record.dealId));
}
const missingEvents = [...eventDeals].filter(absent);
report.events = { sessions: eventKeys.size, deals: eventDeals.size, missing: missingEvents };

// --- 3. provinces ----------------------------------------------------------------------------
log('4/6 81 il sorgusu karşılaştırılıyor…');
const cityIds = Array.from({ length: 81 }, (_, index) => index + 1);
const cityMissing: Record<number, string[]> = {};
await mapWithConcurrency(cityIds, config.concurrency, async (cityId) => {
  const found = await ids(`cityId=${cityId}`);
  const missing = [...found].filter(absent);
  if (missing.length) cityMissing[cityId] = missing;
});
report.provinces = { queried: cityIds.length, missing: cityMissing };

// --- 4. categories ---------------------------------------------------------------------------
log('5/6 Kategori sorguları karşılaştırılıyor…');
const topicMissing: Record<string, string[]> = {};
const emptyTopics: string[] = [];
await mapWithConcurrency(config.topics, config.concurrency, async (topic) => {
  const found = await ids(`tagIds[]=${topic.tagId}`);
  if (found.size === 0) emptyTopics.push(`${TOPICS.get(topic.slug)?.name} (${topic.tagId})`);
  const missing = [...found].filter(absent);
  if (missing.length) topicMissing[`${topic.slug} (${topic.tagId})`] = missing;
});
report.categories = { queried: config.topics.length, empty: emptyTopics, missing: topicMissing };

// --- 5. gaps in the data ---------------------------------------------------------------------
log('6/6 Veri boşlukları inceleniyor…');
const withoutTopic = deals.filter((deal) => deal.topics.length === 0);
const tagCounts = new Map<string, number>();
for (const deal of withoutTopic) for (const tag of deal.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
const unknownDistricts = new Map<string, number>();
for (const deal of deals) {
  if (deal.citySlug && deal.district && !isKnownDistrict(deal.citySlug, slugify(deal.district, 60))) {
    const key = `${deal.city} / ${deal.district}`;
    unknownDistricts.set(key, (unknownDistricts.get(key) ?? 0) + 1);
  }
}
const facets = facetsOf(deals);
const longLists = facets.tags.filter((facet) => facet.deals.length > FACET_PAGE_SIZE).length;
const istanbulWithout = (DISTRICTS.istanbul ?? []).filter(
  (d) => !facets.districts.some((f) => f.citySlug === 'istanbul' && f.slug === slugify(d.name, 60)),
);
report.gaps = {
  withoutCategory: withoutTopic.length,
  topTagsWithoutCategory: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
  withoutCity: deals.filter((deal) => !deal.citySlug).length,
  withoutDistrict: deals.filter((deal) => deal.citySlug && !deal.district).length,
  districtOutsideProvince: [...unknownDistricts.entries()],
  istanbulDistrictsWithoutDeals: istanbulWithout.map((d) => d.name),
  categoryPagesWithSeveralPages: longLists,
};
report.requests = requests;

mkdirSync('.cache', { recursive: true });
writeFileSync('.cache/coverage-report.json', JSON.stringify(report, null, 2));

const n = (value: number) => value.toLocaleString('tr-TR');
const missingTotal =
  otherMissing.length + missingEvents.length + Object.values(cityMissing).flat().length + Object.values(topicMissing).flat().length;
log('');
log('=== KAPSAM RAPORU ===');
log(
  `Katalog: API ${n(catalog.size)} · sitede ${n(deals.length)} · süresi dolduğu için alınmayan ${n(expired.length)} · diğer eksik ${n(otherMissing.length)}`,
);
log(`Etkinlik API: ${n(eventKeys.size)} seans, ${n(eventDeals.size)} fırsat · sitede olmayan ${n(missingEvents.length)}`);
log(`81 il sorgusu · sitede olmayan fırsat: ${n(Object.values(cityMissing).flat().length)}`);
log(
  `${n(config.topics.length)} kategori sorgusu · sitede olmayan: ${n(Object.values(topicMissing).flat().length)} · boş kategori: ${emptyTopics.join(', ') || '-'}`,
);
log(
  `Kategorisi olmayan fırsat: ${n(withoutTopic.length)} · şehri olmayan (Türkiye geneli): ${n(deals.filter((d) => !d.citySlug).length)} · ilçesi olmayan: ${n(deals.filter((d) => d.citySlug && !d.district).length)}`,
);
log(`İl dışı ilçe kaydı: ${[...unknownDistricts.entries()].map(([k, v]) => `${k} (${v})`).join(', ') || '-'}`);
log(`Fırsatı olmayan İstanbul ilçeleri: ${istanbulWithout.map((d) => d.name).join(', ') || '-'}`);
log(`Birden fazla sayfaya bölünen kategori sayfası: ${n(longLists)} (sayfa başına ${FACET_PAGE_SIZE} fırsat, /sayfa/2/ …)`);
for (const record of expired)
  log(`Süresi dolmuş kupon (sitede gösterilmiyor): ${record.id} · ${String(record.title)} · son kullanım ${String(record.couponEndDate)}`);
log(
  missingTotal === 0
    ? 'SONUÇ: API’de olup sitede olmayan fırsat yok.'
    : `SONUÇ: ${n(missingTotal)} eksik kayıt — ayrıntılar .cache/coverage-report.json`,
);
log(`(${n(requests)} istek)`);
