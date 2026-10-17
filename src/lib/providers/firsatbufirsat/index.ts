import { readBool, readEnv, readInt } from '../../env';
import { normalizeDeal, type NormalizeContext } from '../../deals/normalize';
import type { Deal } from '../../deals/schema';
import { TOPICS } from '../../../config/taxonomy';
import { mergeEventSessions, parseEventsResponse, type EventSessionRecord } from './events';
import { mapRecord, parseFieldMap, readPath, type FieldMap } from '../fields';
import { DEFAULT_POLICY, ProviderHttpError, fetchText, mapWithConcurrency, redactUrl, type FetchPolicy } from '../http';
import { detectFormat, extractRecords, parseBody } from '../parse';
import { emptyDiagnostics, type ProviderAdapter, type ProviderDiagnostics, type ProviderFetchOptions, type ProviderResult } from '../types';

/**
 * Fırsat Bu Fırsat publisher API adapter.
 *
 * VERIFIED against real responses (2026-10-16):
 *  - Deals: `https://api.firsatbufirsat.com/deal/browse.html?apiKey&publisherId`
 *    → `{ result: "SUCCESS", resultMessage, total, deals: [...] }`.
 *  - `itemInPage` = page size (max 100), `p` = page number, at most 20 distinct pages per
 *    query (later pages repeat the last one). With 100 per page the whole catalog (≈2 000)
 *    fits in one unfiltered query; above that we fall back to a province sweep.
 *  - `cityId` = partner province id (1–81, see the owner's list; 41 İstanbul, 7 Ankara, …).
 *    City queries list local deals first, then nationwide deals (empty `city`).
 *  - `showDealUrl` carries our publisher id as `pid` (publisher tracking).
 *  - Events: `/deal/event-deals.html` → `{ events: [...] }`, one record per session
 *    (see ./events.ts); sessions are merged into the matching deal.
 *  - `tagIds[]=<id>` = partner category filter (sub-categories included). One nationwide query per
 *    node of `src/config/taxonomy.ts` gives each deal its category-tree memberships; city and
 *    district pages are then derived from the deal's own location.
 */
export const FBF_ATTRIBUTION_TEXT = 'Fırsat bilgileri Fırsat Bu Fırsat tarafından sağlanmaktadır.';
export const FBF_HOME_URL = 'https://www.firsatbufirsat.com/';
export const FBF_DEFAULT_ENDPOINT = 'https://api.firsatbufirsat.com/deal/browse.html';
export const FBF_EVENTS_ENDPOINT = 'https://api.firsatbufirsat.com/deal/event-deals.html';
export const FBF_PAGE_SIZE_QUERY = 'itemInPage=100';

/** Field paths verified in the real response. Env FIRSATBUFIRSAT_FIELD_MAP overrides single fields. */
export const FBF_FIELD_MAP: FieldMap = {
  externalId: 'id',
  title: 'title',
  description: 'description',
  merchant: 'businessData.0.title',
  address: 'businessData.0.address',
  city: 'city',
  district: 'town',
  originalPrice: 'realPriceWithSymbol',
  price: 'dealPriceWithSymbol',
  discountPercent: 'discountPercent',
  imageUrl: 'image450_H',
  imageLargeUrl: 'image1200x1200',
  images: 'dealImages',
  sourceUrl: 'showDealUrl',
  affiliateUrl: 'showDealUrl',
  validUntil: 'couponEndDate',
  conditions: 'detail',
  tags: 'tags',
  options: 'subDeals',
};

export const FBF_PAGE_LIMIT = 20;

export interface FbfConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string | undefined;
  publisherId: string | undefined;
  /** Base query applied to every request (owner-supplied, e.g. channel filters). */
  extraQuery: string | undefined;
  /** Optional extra request whose results are flagged as provider "popular". */
  popularQuery: string | undefined;
  /** Optional extra request whose results are flagged as provider "new". */
  newQuery: string | undefined;
  pageParam: string | undefined;
  pageStart: number;
  maxPages: number;
  /** Province ids to sweep; null = unfiltered only. */
  cityIds: number[] | null;
  /** "auto": sweep provinces only when the unfiltered query cannot return the whole catalog. */
  cityMode: 'auto' | 'always' | 'off';
  /** Etkinlik API endpoint ('' disables session merging). */
  eventsEndpoint: string;
  /** Category-tree nodes whose `tagIds[]` membership is fetched (empty = off). */
  topics: { slug: string; tagId: number }[];
  /** Additional queries swept like cities, e.g. "cityId=41&townId=123" for big districts. */
  extraQueries: string[];
  concurrency: number;
  fieldMap: FieldMap;
  /** Owner confirmed (Günlük Raporlar) that clicks are attributed. */
  trackingVerified: boolean;
  /** Optional link template from "Link Oluşturma": {url} {urlEncoded} {publisherId} {id}. */
  linkTemplate: string | undefined;
  /** Category hint for records without a category. */
  categoryHint: string | undefined;
  indexProviderPages: boolean;
  policy: FetchPolicy;
}

function parseCityIds(raw: string | undefined): { mode: FbfConfig['cityMode']; ids: number[] | null } {
  const value = (raw ?? 'auto').trim().toLowerCase();
  const all = Array.from({ length: 81 }, (_, index) => index + 1);
  if (value === 'none' || value === 'off' || value === '0') return { mode: 'off', ids: null };
  if (value === 'auto') return { mode: 'auto', ids: all };
  if (value === 'all') return { mode: 'always', ids: all };
  const ids = value
    .split(/[\s,;]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => Number.isInteger(id) && id > 0 && id < 1000);
  return ids.length ? { mode: 'always', ids: [...new Set(ids)] } : { mode: 'auto', ids: all };
}

export function readFbfConfig(): FbfConfig {
  const cities = parseCityIds(readEnv('FIRSATBUFIRSAT_CITY_IDS'));
  const eventsSetting = readEnv('FIRSATBUFIRSAT_EVENTS_API_URL');
  return {
    id: 'firsatbufirsat',
    name: 'Fırsat Bu Fırsat',
    endpoint: readEnv('FIRSATBUFIRSAT_API_BASE_URL') ?? FBF_DEFAULT_ENDPOINT,
    apiKey: readEnv('FIRSATBUFIRSAT_API_KEY'),
    publisherId: readEnv('FIRSATBUFIRSAT_PUBLISHER_ID'),
    extraQuery: readEnv('FIRSATBUFIRSAT_EXTRA_QUERY') ?? FBF_PAGE_SIZE_QUERY,
    popularQuery: readEnv('FIRSATBUFIRSAT_POPULAR_QUERY'),
    newQuery: readEnv('FIRSATBUFIRSAT_NEW_QUERY'),
    pageParam: readEnv('FIRSATBUFIRSAT_PAGE_PARAM') ?? 'p',
    pageStart: readInt('FIRSATBUFIRSAT_PAGE_START', 1, { min: 0, max: 1 }),
    maxPages: readInt('FIRSATBUFIRSAT_MAX_PAGES', FBF_PAGE_LIMIT, { min: 1, max: 50 }),
    cityIds: cities.ids,
    cityMode: cities.mode,
    eventsEndpoint: eventsSetting === 'off' ? '' : (eventsSetting ?? FBF_EVENTS_ENDPOINT),
    topics: readBool('FIRSATBUFIRSAT_TOPICS', true)
      ? [...TOPICS.values()].flatMap((topic) => topic.tagIds.map((tagId) => ({ slug: topic.slug, tagId })))
      : [],
    extraQueries: (readEnv('FIRSATBUFIRSAT_QUERIES') ?? '')
      .split(/[\n|]+/)
      .map((query) => query.trim().replace(/^\?/, ''))
      .filter(Boolean),
    concurrency: readInt('FIRSATBUFIRSAT_CONCURRENCY', 3, { min: 1, max: 6 }),
    fieldMap: { ...FBF_FIELD_MAP, ...parseFieldMap(readEnv('FIRSATBUFIRSAT_FIELD_MAP')) },
    trackingVerified: readBool('FIRSATBUFIRSAT_TRACKING_VERIFIED', false),
    linkTemplate: readEnv('FIRSATBUFIRSAT_LINK_TEMPLATE'),
    categoryHint: undefined,
    indexProviderPages: readBool('DEALS_INDEX_PROVIDER_PAGES', false),
    policy: {
      ...DEFAULT_POLICY,
      timeoutMs: readInt('FIRSATBUFIRSAT_TIMEOUT_MS', 30_000, { min: 2_000, max: 60_000 }),
      retries: readInt('FIRSATBUFIRSAT_RETRIES', 3, { min: 0, max: 5 }),
      minIntervalMs: readInt('FIRSATBUFIRSAT_MIN_INTERVAL_MS', 350, { min: 0, max: 10_000 }),
    },
  };
}

export function buildRequestUrl(
  config: Pick<FbfConfig, 'endpoint' | 'extraQuery' | 'pageParam' | 'apiKey' | 'publisherId'>,
  extra: string | undefined,
  page: number | null,
  endpoint: string = config.endpoint,
): string {
  const url = new URL(endpoint);
  for (const query of [config.extraQuery, extra]) {
    if (!query) continue;
    for (const [key, value] of new URLSearchParams(query.replace(/^\?/, ''))) url.searchParams.set(key, value);
  }
  if (config.pageParam && page !== null) url.searchParams.set(config.pageParam, String(page));
  // credentials last so a pasted query can never override or duplicate them
  url.searchParams.set('apiKey', config.apiKey ?? '');
  url.searchParams.set('publisherId', config.publisherId ?? '');
  return url.toString();
}

function applyLinkTemplate(template: string, url: string, publisherId: string, id: string): string {
  return template
    .replaceAll('{urlEncoded}', encodeURIComponent(url))
    .replaceAll('{url}', url)
    .replaceAll('{publisherId}', encodeURIComponent(publisherId))
    .replaceAll('{id}', encodeURIComponent(id));
}

export interface TransformResult {
  deals: Deal[];
  format: ReturnType<typeof detectFormat>;
  received: number;
  expired: number;
  rejectReasons: Record<string, number>;
  recordPath: string;
  /** Raw record ids in response order (used to detect repeated pages). */
  recordIds: string[];
  /** Records with an empty city (nationwide offers). */
  nationwide: number;
  /** Consecutive nationwide records at the end of the page (the tail of a city query). */
  nationwideTrailing: number;
  /** Provider-reported total for the query, when present. */
  total: number | null;
}

/**
 * Pure transformation of one response body into deals — shared by the adapter, the
 * inspection script and unit tests (fixtures).
 */
export function transformResponse(
  body: string,
  contentType: string,
  config: Pick<
    FbfConfig,
    'id' | 'name' | 'fieldMap' | 'publisherId' | 'apiKey' | 'trackingVerified' | 'linkTemplate' | 'categoryHint' | 'indexProviderPages'
  >,
  now: Date,
  signals: { popular?: boolean; isNew?: boolean } = {},
): TransformResult {
  const format = detectFormat(contentType, body);
  if (format !== 'json' && format !== 'xml') {
    throw new Error(
      format === 'html'
        ? 'Sağlayıcı HTML döndürdü (geçersiz parametre ya da anahtar olabilir). `npm run provider:inspect` ile yanıtı inceleyin.'
        : `Tanınmayan yanıt biçimi (${format}).`,
    );
  }
  const tree = parseBody(format, body);
  if (tree && typeof tree === 'object' && 'result' in tree) {
    const result = String((tree as { result: unknown }).result).toUpperCase();
    if (result !== 'SUCCESS') {
      const message = String((tree as { resultMessage?: unknown }).resultMessage ?? '').slice(0, 200);
      throw new Error(`Sağlayıcı hata döndürdü: ${result}${message ? ` — ${message}` : ''}`);
    }
  }
  const totalRaw = readPath(tree, 'total');
  const total = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' && /^\d+$/.test(totalRaw) ? Number(totalRaw) : null;
  const { records, path } = extractRecords(tree);
  const redact = [config.apiKey].filter((value): value is string => Boolean(value));
  const ctx: NormalizeContext = {
    providerId: config.id,
    providerName: config.name,
    attribution: { required: true, providerId: config.id, text: FBF_ATTRIBUTION_TEXT, url: FBF_HOME_URL },
    trackingStatus: config.trackingVerified ? 'provider-tracked' : 'unverified',
    now,
    redact,
    indexProviderPages: config.indexProviderPages,
    publisherId: config.publisherId,
  };
  const deals: Deal[] = [];
  const rejectReasons: Record<string, number> = {};
  const recordIds: string[] = [];
  let expired = 0;
  let nationwide = 0;
  let nationwideTrailing = 0;
  for (const record of records) {
    const { input } = mapRecord(record, config.fieldMap);
    recordIds.push(String(input.externalId ?? input.sourceUrl ?? recordIds.length));
    if (typeof input.city !== 'string' || input.city.trim() === '') {
      nationwide += 1;
      nationwideTrailing += 1;
    } else nationwideTrailing = 0;
    const howToUse = readPath(record, 'howToUse');
    if (typeof howToUse === 'string' && howToUse.trim()) {
      input.conditions = `${typeof input.conditions === 'string' ? input.conditions : ''}\n${howToUse}`;
    }
    if (config.categoryHint && !input.category) input.category = config.categoryHint;
    if (signals.popular) input.popular = true;
    // the partner tags its best sellers ("çok satan", "çok satan istanbul"): a real popularity signal
    if (typeof input.tags === 'string' && input.tags.toLocaleLowerCase('tr-TR').includes('çok satan')) input.popular = true;
    if (signals.isNew) input.isNew = true;
    // The partner's URLs carry our publisher id (pid=…): that is the referral link.
    if (typeof input.affiliateUrl === 'string' && config.publisherId && !input.affiliateUrl.includes(config.publisherId)) {
      delete input.affiliateUrl;
    }
    if (!input.affiliateUrl && typeof input.sourceUrl === 'string' && config.publisherId && input.sourceUrl.includes(config.publisherId)) {
      input.affiliateUrl = input.sourceUrl;
    }
    if (!input.affiliateUrl && config.linkTemplate && typeof input.sourceUrl === 'string' && config.publisherId) {
      input.affiliateUrl = applyLinkTemplate(config.linkTemplate, input.sourceUrl, config.publisherId, String(input.externalId ?? ''));
    }
    const result = normalizeDeal(input, ctx);
    if (!result.ok) {
      rejectReasons[result.reason] = (rejectReasons[result.reason] ?? 0) + 1;
      continue;
    }
    if (result.deal.status === 'expired') {
      expired += 1;
      continue;
    }
    deals.push(result.deal);
  }
  return {
    deals,
    format,
    received: records.length,
    expired,
    rejectReasons,
    recordPath: path,
    recordIds,
    nationwide,
    nationwideTrailing,
    total,
  };
}

/** Record ids (and the reported total) of one page — used for category membership queries. */
export function parseIdPage(body: string, contentType: string, idPath: string): { ids: string[]; total: number | null } {
  const format = detectFormat(contentType, body);
  if (format !== 'json' && format !== 'xml') throw new Error(`Tanınmayan yanıt biçimi (${format}).`);
  const tree = parseBody(format, body);
  if (tree && typeof tree === 'object' && 'result' in tree) {
    const result = String((tree as { result: unknown }).result).toUpperCase();
    if (result !== 'SUCCESS') throw new Error(`Sağlayıcı hata döndürdü: ${result}`);
  }
  const totalRaw = readPath(tree, 'total');
  const total = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' && /^\d+$/.test(totalRaw) ? Number(totalRaw) : null;
  const ids = extractRecords(tree)
    .records.map((record) => readPath(record, idPath))
    .filter((id): id is string | number => (typeof id === 'string' && id.trim() !== '') || typeof id === 'number')
    .map((id) => String(id).trim());
  return { ids, total };
}

export interface SweepQuery {
  query: string | undefined;
  /** City/district-scoped queries end with the nationwide tail; stop there once it was collected. */
  scoped: boolean;
  signals?: { popular?: boolean; isNew?: boolean };
}

/** Province sweep queries (+ owner queries and optional popular/new signal queries). */
export function sweepPlan(
  config: Pick<FbfConfig, 'cityIds' | 'extraQueries' | 'popularQuery' | 'newQuery'>,
  includeCities = true,
): SweepQuery[] {
  const plan: SweepQuery[] = includeCities && config.cityIds ? config.cityIds.map((id) => ({ query: `cityId=${id}`, scoped: true })) : [];
  for (const query of config.extraQueries) plan.push({ query, scoped: true });
  if (config.popularQuery) plan.push({ query: config.popularQuery, scoped: false, signals: { popular: true } });
  if (config.newQuery) plan.push({ query: config.newQuery, scoped: false, signals: { isNew: true } });
  return plan;
}

export function createFirsatBuFirsatAdapter(config: FbfConfig = readFbfConfig()): ProviderAdapter {
  const configured = Boolean(config.apiKey && config.publisherId && config.endpoint);
  const secrets = [config.apiKey, config.publisherId].filter((value): value is string => Boolean(value));
  const scrub = (text: string) => secrets.reduce((value, secret) => value.split(secret).join('***'), text);

  async function request(
    query: string | undefined,
    page: number | null,
    diagnostics: ProviderDiagnostics,
    now: Date,
    signals: SweepQuery['signals'],
  ) {
    const url = buildRequestUrl(config, query, page);
    try {
      const response = await fetchText(url, redactUrl(url, secrets), config.policy);
      diagnostics.requests += response.attempts;
      return transformResponse(response.body, response.contentType, config, now, signals ?? {});
    } catch (error) {
      if (error instanceof ProviderHttpError) diagnostics.requests += error.attempts;
      throw error;
    }
  }

  return {
    id: config.id,
    name: config.name,
    isConfigured: () => configured,

    /** Cheap change signature for the scheduled sync: one unfiltered request. */
    async probe({ now }: ProviderFetchOptions): Promise<string> {
      const diagnostics = emptyDiagnostics(config.id, config.name, configured);
      const result = await request(undefined, config.pageParam ? config.pageStart : null, diagnostics, now, {});
      let events = '';
      if (config.eventsEndpoint) {
        const url = buildRequestUrl(config, undefined, config.pageStart, config.eventsEndpoint);
        const response = await fetchText(url, redactUrl(url, secrets), config.policy);
        const page = parseEventsResponse(response.body, response.contentType, secrets, now);
        events = `|e${page.total ?? page.received}:${page.keys.slice(0, 20).join(',')}`;
      }
      return `${result.total ?? result.received}:${result.recordIds.join(',')}${events}`;
    },

    async fetchDeals({ now }: ProviderFetchOptions): Promise<ProviderResult> {
      const diagnostics: ProviderDiagnostics = emptyDiagnostics(config.id, config.name, configured);
      const started = Date.now();
      if (!configured) {
        diagnostics.warnings.push('API anahtarı veya yayıncı kimliği tanımlı değil; sağlayıcı atlandı.');
        return { deals: [], diagnostics };
      }
      const byId = new Map<string, Deal>();
      let nationwideCollected = false;
      let truncated = 0;

      const sweep = async (item: SweepQuery, collectNationwide: boolean) => {
        const seen = new Set<string>();
        const pages = config.pageParam ? config.maxPages : 1;
        let pageSize = 0;
        for (let index = 0; index < pages; index += 1) {
          const page = config.pageParam ? config.pageStart + index : null;
          const result = await request(item.query, page, diagnostics, now, item.signals);
          diagnostics.responseFormat = result.format;
          const freshIds = result.recordIds.filter((id) => !seen.has(id));
          if (freshIds.length === 0) break; // the API repeats its last page beyond the limit
          freshIds.forEach((id) => seen.add(id));
          pageSize = Math.max(pageSize, result.received);
          diagnostics.received += result.received;
          diagnostics.expired += result.expired;
          for (const [reason, count] of Object.entries(result.rejectReasons)) {
            diagnostics.rejectReasons[reason] = (diagnostics.rejectReasons[reason] ?? 0) + count;
            diagnostics.rejected += count;
          }
          for (const deal of result.deals) {
            const existing = byId.get(deal.id);
            byId.set(
              deal.id,
              existing ? { ...existing, popular: existing.popular || deal.popular, isNew: existing.isNew || deal.isNew } : deal,
            );
          }
          if (result.received < pageSize) break; // short page = last page
          // Local deals come first, the nationwide tail last (single nationwide deals may be mixed in):
          // stop once the page ends in the tail.
          const tailReached = result.nationwideTrailing >= 2 || (result.received > 0 && result.nationwide === result.received);
          if (item.scoped && tailReached && !collectNationwide) break;
          if (index === pages - 1 && result.total !== null && seen.size < result.total) truncated += result.total - seen.size;
        }
      };

      const fetchEvents = async () => {
        const records: EventSessionRecord[] = [];
        const seen = new Set<string>();
        let pageSize = 0;
        for (let index = 0; index < config.maxPages; index += 1) {
          const url = buildRequestUrl(config, undefined, config.pageStart + index, config.eventsEndpoint);
          let page;
          try {
            const response = await fetchText(url, redactUrl(url, secrets), config.policy);
            diagnostics.requests += response.attempts;
            page = parseEventsResponse(response.body, response.contentType, secrets, now);
          } catch (error) {
            if (error instanceof ProviderHttpError) diagnostics.requests += error.attempts;
            throw error;
          }
          const fresh = page.keys.filter((key) => !seen.has(key));
          if (fresh.length === 0) break;
          fresh.forEach((key) => seen.add(key));
          records.push(...page.records);
          pageSize = Math.max(pageSize, page.received);
          if (page.received < pageSize) break;
        }
        return { records, sessions: seen.size };
      };

      /** Ids of every deal carrying one partner category (paged like the catalog). */
      const fetchTopicIds = async (tagId: number) => {
        const ids = new Set<string>();
        let pageSize = 0;
        for (let index = 0; index < config.maxPages; index += 1) {
          const url = buildRequestUrl(config, `tagIds[]=${tagId}`, config.pageStart + index);
          let page;
          try {
            const response = await fetchText(url, redactUrl(url, secrets), config.policy);
            diagnostics.requests += response.attempts;
            page = parseIdPage(response.body, response.contentType, config.fieldMap.externalId ?? 'id');
          } catch (error) {
            if (error instanceof ProviderHttpError) diagnostics.requests += error.attempts;
            throw error;
          }
          const fresh = page.ids.filter((id) => !ids.has(id));
          if (fresh.length === 0) break;
          fresh.forEach((id) => ids.add(id));
          pageSize = Math.max(pageSize, page.ids.length);
          if (page.ids.length < pageSize || (page.total !== null && ids.size >= page.total)) break;
        }
        return ids;
      };

      try {
        // 1) whole catalog in one unfiltered, paginated query (100 per page)
        const catalog = { query: undefined, scoped: false } satisfies SweepQuery;
        const before = truncated;
        await sweep(catalog, true);
        const catalogIncomplete = truncated > before;
        // 2) province sweep: always if requested, or automatically when the catalog was cut off
        const plan = sweepPlan(config, config.cityMode === 'always' || (config.cityMode === 'auto' && catalogIncomplete));
        if (catalogIncomplete && config.cityMode === 'auto') truncated = before; // the sweep covers the gap
        nationwideCollected = true; // the unfiltered query already contains the nationwide deals
        await mapWithConcurrency(plan, config.concurrency, (item) => sweep(item, !nationwideCollected && !item.scoped));
        // 3) event sessions
        if (config.eventsEndpoint) {
          const events = await fetchEvents();
          const ctx = {
            providerId: config.id,
            providerName: config.name,
            attribution: { required: true, providerId: config.id, text: FBF_ATTRIBUTION_TEXT, url: FBF_HOME_URL },
            trackingStatus: config.trackingVerified ? ('provider-tracked' as const) : ('unverified' as const),
            now,
            redact: secrets,
            indexProviderPages: config.indexProviderPages,
            publisherId: config.publisherId,
          };
          const merged = mergeEventSessions([...byId.values()], events.records, ctx);
          byId.clear();
          for (const deal of merged.deals) byId.set(deal.id, deal);
          diagnostics.warnings.push(
            `Etkinlik API: ${events.sessions} seans; ${merged.attached} fırsata takvim eklendi, ${merged.created} yalnızca etkinlik olan fırsat oluşturuldu.`,
          );
        }
        // 4) category tree memberships (a failed node only loses its own pages; tags still match)
        if (config.topics.length > 0) {
          const byExternal = new Map([...byId.values()].map((deal) => [deal.externalId, deal]));
          let failed = 0;
          let linked = 0;
          await mapWithConcurrency(config.topics, config.concurrency, async (topic) => {
            let ids: Set<string>;
            try {
              ids = await fetchTopicIds(topic.tagId);
            } catch {
              failed += 1;
              return;
            }
            for (const id of ids) {
              const deal = byExternal.get(id);
              if (!deal || deal.topics.includes(topic.slug)) continue;
              deal.topics = [...deal.topics, topic.slug];
              linked += 1;
            }
          });
          diagnostics.warnings.push(
            `Kategori ağacı: ${config.topics.length} kategori sorgulandı, ${linked} fırsat-kategori eşleşmesi${failed ? `, ${failed} kategori alınamadı` : ''}.`,
          );
        }
        diagnostics.ok = true;
        if (diagnostics.received === 0) diagnostics.warnings.push('Sağlayıcı yanıtında fırsat kaydı bulunamadı.');
        if (truncated > 0) {
          diagnostics.warnings.push(
            `API sorgu başına ${FBF_PAGE_LIMIT} sayfa sınırı nedeniyle yaklaşık ${truncated} kayıt alınamadı (FIRSATBUFIRSAT_CITY_IDS=all ya da ilçe sorguları ekleyin).`,
          );
        }
      } catch (error) {
        diagnostics.ok = false;
        diagnostics.error = scrub(error instanceof Error ? error.message : String(error));
      }
      const deals = [...byId.values()];
      diagnostics.accepted = deals.length;
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.durationMs = Date.now() - started;
      return { deals: diagnostics.ok ? deals : [], diagnostics };
    },
  };
}
