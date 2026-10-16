import { readBool, readEnv, readInt } from '../../env';
import { normalizeDeal, type NormalizeContext } from '../../deals/normalize';
import type { Deal } from '../../deals/schema';
import { mapRecord, parseFieldMap, readPath, type FieldMap } from '../fields';
import { DEFAULT_POLICY, ProviderHttpError, fetchText, mapWithConcurrency, redactUrl, type FetchPolicy } from '../http';
import { detectFormat, extractRecords, parseBody } from '../parse';
import { emptyDiagnostics, type ProviderAdapter, type ProviderDiagnostics, type ProviderFetchOptions, type ProviderResult } from '../types';

/**
 * Fırsat Bu Fırsat publisher API adapter.
 *
 * VERIFIED against real responses (2026-10-16):
 *  - Endpoint `https://api.firsatbufirsat.com/deal/browse.html` with `apiKey` + `publisherId`.
 *  - JSON: `{ result: "SUCCESS", resultMessage, total, deals: [...] }`, 10 deals per page.
 *  - `p` = page number. The API serves at most 20 distinct pages (200 deals) per query; later
 *    pages repeat the last one.
 *  - `cityId` = the partner's own province id (1–81, roughly Turkish alphabetical order;
 *    e.g. 7 Ankara, 41 İstanbul, 42 İzmir). Each city query lists that city's local deals
 *    first, followed by the nationwide deals (empty `city`, shipped/online offers).
 *  - `townId` filters by district (ids not enumerated yet; add via FIRSATBUFIRSAT_QUERIES).
 *  - `showDealUrl` / `buyDealUrl` carry our publisher id as `pid` (publisher tracking).
 * To get more than 200 deals we therefore sweep the provinces (see `sweepPlan`).
 */
export const FBF_ATTRIBUTION_TEXT = 'Fırsat bilgileri Fırsat Bu Fırsat tarafından sağlanmaktadır.';
export const FBF_HOME_URL = 'https://www.firsatbufirsat.com/';
export const FBF_DEFAULT_ENDPOINT = 'https://api.firsatbufirsat.com/deal/browse.html';

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
  /** Province ids to sweep (null = one unfiltered query). */
  cityIds: number[] | null;
  /** Additional queries swept like cities, e.g. "cityId=41&townId=123" for big districts. */
  extraQueries: string[];
  concurrency: number;
  fieldMap: FieldMap;
  /** Owner confirmed (Günlük Raporlar) that clicks are attributed. */
  trackingVerified: boolean;
  /** Optional link template from "Link Oluşturma": {url} {urlEncoded} {publisherId} {id}. */
  linkTemplate: string | undefined;
  /** Category hint for records without a category (e.g. the events API → "etkinlik"). */
  categoryHint: string | undefined;
  indexProviderPages: boolean;
  policy: FetchPolicy;
}

function parseCityIds(raw: string | undefined): number[] | null {
  const value = (raw ?? 'all').trim().toLowerCase();
  if (value === 'none' || value === 'off' || value === '0') return null;
  if (value === 'all') return Array.from({ length: 81 }, (_, index) => index + 1);
  const ids = value
    .split(/[\s,;]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => Number.isInteger(id) && id > 0 && id < 1000);
  return ids.length ? [...new Set(ids)] : null;
}

export function readFbfConfig(variant: 'deals' | 'events' = 'deals'): FbfConfig {
  const isEvents = variant === 'events';
  return {
    id: isEvents ? 'firsatbufirsat-etkinlik' : 'firsatbufirsat',
    name: 'Fırsat Bu Fırsat',
    endpoint: isEvents
      ? (readEnv('FIRSATBUFIRSAT_EVENTS_API_URL') ?? '')
      : (readEnv('FIRSATBUFIRSAT_API_BASE_URL') ?? FBF_DEFAULT_ENDPOINT),
    apiKey: readEnv('FIRSATBUFIRSAT_API_KEY'),
    publisherId: readEnv('FIRSATBUFIRSAT_PUBLISHER_ID'),
    extraQuery: readEnv(isEvents ? 'FIRSATBUFIRSAT_EVENTS_EXTRA_QUERY' : 'FIRSATBUFIRSAT_EXTRA_QUERY'),
    popularQuery: isEvents ? undefined : readEnv('FIRSATBUFIRSAT_POPULAR_QUERY'),
    newQuery: isEvents ? undefined : readEnv('FIRSATBUFIRSAT_NEW_QUERY'),
    pageParam: readEnv('FIRSATBUFIRSAT_PAGE_PARAM') ?? 'p',
    pageStart: readInt('FIRSATBUFIRSAT_PAGE_START', 1, { min: 0, max: 1 }),
    maxPages: readInt('FIRSATBUFIRSAT_MAX_PAGES', FBF_PAGE_LIMIT, { min: 1, max: 50 }),
    cityIds: isEvents ? null : parseCityIds(readEnv('FIRSATBUFIRSAT_CITY_IDS')),
    extraQueries: isEvents
      ? []
      : (readEnv('FIRSATBUFIRSAT_QUERIES') ?? '')
          .split(/[\n|]+/)
          .map((query) => query.trim().replace(/^\?/, ''))
          .filter(Boolean),
    concurrency: readInt('FIRSATBUFIRSAT_CONCURRENCY', 3, { min: 1, max: 6 }),
    fieldMap: { ...FBF_FIELD_MAP, ...parseFieldMap(readEnv('FIRSATBUFIRSAT_FIELD_MAP')) },
    trackingVerified: readBool('FIRSATBUFIRSAT_TRACKING_VERIFIED', false),
    linkTemplate: readEnv('FIRSATBUFIRSAT_LINK_TEMPLATE'),
    categoryHint: isEvents ? 'etkinlik' : undefined,
    indexProviderPages: readBool('DEALS_INDEX_PROVIDER_PAGES', false),
    policy: {
      ...DEFAULT_POLICY,
      timeoutMs: readInt('FIRSATBUFIRSAT_TIMEOUT_MS', 20_000, { min: 2_000, max: 30_000 }),
      retries: readInt('FIRSATBUFIRSAT_RETRIES', 3, { min: 0, max: 5 }),
      minIntervalMs: readInt('FIRSATBUFIRSAT_MIN_INTERVAL_MS', 350, { min: 0, max: 10_000 }),
    },
  };
}

export function buildRequestUrl(
  config: Pick<FbfConfig, 'endpoint' | 'extraQuery' | 'pageParam' | 'apiKey' | 'publisherId'>,
  extra: string | undefined,
  page: number | null,
): string {
  const url = new URL(config.endpoint);
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

export interface SweepQuery {
  query: string | undefined;
  /** City/district-scoped queries end with the nationwide tail; stop there once it was collected. */
  scoped: boolean;
  signals?: { popular?: boolean; isNew?: boolean };
}

/** Which queries to run: one unfiltered query, or a sweep over provinces (+ owner queries). */
export function sweepPlan(config: Pick<FbfConfig, 'cityIds' | 'extraQueries' | 'popularQuery' | 'newQuery'>): SweepQuery[] {
  const plan: SweepQuery[] = config.cityIds
    ? config.cityIds.map((id) => ({ query: `cityId=${id}`, scoped: true }))
    : [{ query: undefined, scoped: false }];
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
      return `${result.total ?? result.received}:${result.recordIds.join(',')}`;
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

      try {
        const plan = sweepPlan(config);
        // The first scoped query is paged to the end once so the nationwide tail is collected exactly once.
        const [first, ...rest] = plan;
        if (first) {
          await sweep(first, first.scoped);
          nationwideCollected = first.scoped;
        }
        await mapWithConcurrency(rest, config.concurrency, (item) => sweep(item, !nationwideCollected && !item.scoped));
        diagnostics.ok = true;
        if (diagnostics.received === 0) diagnostics.warnings.push('Sağlayıcı yanıtında fırsat kaydı bulunamadı.');
        if (truncated > 0) {
          diagnostics.warnings.push(
            `API sorgu başına ${FBF_PAGE_LIMIT} sayfa sınırı nedeniyle yaklaşık ${truncated} kayıt alınamadı (büyük iller için ilçe sorguları ekleyin: FIRSATBUFIRSAT_QUERIES).`,
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
