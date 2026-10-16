import { readBool, readEnv, readInt } from '../../env';
import { normalizeDeal, type NormalizeContext } from '../../deals/normalize';
import type { Deal } from '../../deals/schema';
import { mapRecord, parseFieldMap, type FieldMap } from '../fields';
import { DEFAULT_POLICY, ProviderHttpError, fetchText, redactUrl, type FetchPolicy } from '../http';
import { detectFormat, extractRecords, parseBody } from '../parse';
import { emptyDiagnostics, type ProviderAdapter, type ProviderDiagnostics, type ProviderFetchOptions, type ProviderResult } from '../types';

/**
 * Fırsat Bu Fırsat publisher API adapter.
 *
 * CONFIRMED from the publisher dashboard: endpoint `https://api.firsatbufirsat.com/deal/browse.html`
 * and the `apiKey` + `publisherId` parameters.
 * NOT CONFIRMED: filter/pagination parameter names and the response schema. Those are
 * therefore owner-configurable (copy them exactly from the dashboard's generated URL) and
 * the response is parsed by format detection + candidate field mapping. See docs/PROVIDERS.md.
 */
export const FBF_ATTRIBUTION_TEXT = 'Fırsat bilgileri Fırsat Bu Fırsat tarafından sağlanmaktadır.';
export const FBF_HOME_URL = 'https://www.firsatbufirsat.com/';
export const FBF_DEFAULT_ENDPOINT = 'https://api.firsatbufirsat.com/deal/browse.html';

export interface FbfConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string | undefined;
  publisherId: string | undefined;
  /** Base query copied from the dashboard, e.g. "city=istanbul&limit=50" (names unverified by us). */
  extraQuery: string | undefined;
  /** Optional extra request whose results are flagged as provider "popular". */
  popularQuery: string | undefined;
  /** Optional extra request whose results are flagged as provider "new". */
  newQuery: string | undefined;
  pageParam: string | undefined;
  pageStart: number;
  maxPages: number;
  fieldMap: FieldMap;
  /** Owner confirmed (with the partner) that returned URLs carry publisher tracking. */
  trackingVerified: boolean;
  /** Optional link template from "Link Oluşturma": {url} {urlEncoded} {publisherId} {id}. */
  linkTemplate: string | undefined;
  /** Category hint for records without a category (e.g. the events API → "etkinlik"). */
  categoryHint: string | undefined;
  indexProviderPages: boolean;
  policy: FetchPolicy;
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
    pageParam: readEnv('FIRSATBUFIRSAT_PAGE_PARAM'),
    pageStart: readInt('FIRSATBUFIRSAT_PAGE_START', 1, { min: 0, max: 1 }),
    maxPages: readInt('FIRSATBUFIRSAT_MAX_PAGES', 1, { min: 1, max: 20 }),
    fieldMap: parseFieldMap(readEnv('FIRSATBUFIRSAT_FIELD_MAP')),
    trackingVerified: readBool('FIRSATBUFIRSAT_TRACKING_VERIFIED', false),
    linkTemplate: readEnv('FIRSATBUFIRSAT_LINK_TEMPLATE'),
    categoryHint: isEvents ? 'etkinlik' : undefined,
    indexProviderPages: readBool('DEALS_INDEX_PROVIDER_PAGES', false),
    policy: {
      ...DEFAULT_POLICY,
      timeoutMs: readInt('FIRSATBUFIRSAT_TIMEOUT_MS', 15_000, { min: 2_000, max: 25_000 }),
      retries: readInt('FIRSATBUFIRSAT_RETRIES', 3, { min: 0, max: 5 }),
      minIntervalMs: readInt('FIRSATBUFIRSAT_MIN_INTERVAL_MS', 1_000, { min: 0, max: 10_000 }),
    },
  };
}

export function buildRequestUrl(config: FbfConfig, extra: string | undefined, page: number | null): string {
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
): {
  deals: Deal[];
  format: ReturnType<typeof detectFormat>;
  received: number;
  expired: number;
  rejectReasons: Record<string, number>;
  recordPath: string;
} {
  const format = detectFormat(contentType, body);
  if (format !== 'json' && format !== 'xml') {
    throw new Error(
      format === 'html'
        ? 'Sağlayıcı HTML döndürdü. Bu uç nokta bir widget/sayfa çıktısı olabilir; `npm run provider:inspect` ile yanıtı inceleyip JSON/XML veren API adresini yapılandırın.'
        : `Tanınmayan yanıt biçimi (${format}).`,
    );
  }
  const tree = parseBody(format, body);
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
  let expired = 0;
  for (const record of records) {
    const { input } = mapRecord(record, config.fieldMap);
    if (config.categoryHint && !input.category) input.category = config.categoryHint;
    if (signals.popular) input.popular = true;
    if (signals.isNew) input.isNew = true;
    // A plain URL that already carries our publisher id is the partner's referral link.
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
  return { deals, format, received: records.length, expired, rejectReasons, recordPath: path };
}

export function createFirsatBuFirsatAdapter(config: FbfConfig = readFbfConfig()): ProviderAdapter {
  const configured = Boolean(config.apiKey && config.publisherId && config.endpoint);
  return {
    id: config.id,
    name: config.name,
    isConfigured: () => configured,
    async fetchDeals({ now }: ProviderFetchOptions): Promise<ProviderResult> {
      const diagnostics: ProviderDiagnostics = emptyDiagnostics(config.id, config.name, configured);
      const started = Date.now();
      if (!configured) {
        diagnostics.warnings.push('API anahtarı veya yayıncı kimliği tanımlı değil; sağlayıcı atlandı.');
        return { deals: [], diagnostics };
      }
      const secrets = [config.apiKey!, config.publisherId!];
      const runs: { extra: string | undefined; signals: { popular?: boolean; isNew?: boolean } }[] = [{ extra: undefined, signals: {} }];
      if (config.popularQuery) runs.push({ extra: config.popularQuery, signals: { popular: true } });
      if (config.newQuery) runs.push({ extra: config.newQuery, signals: { isNew: true } });

      const deals: Deal[] = [];
      try {
        for (const run of runs) {
          const pages = config.pageParam ? config.maxPages : 1;
          const seenOnRun = new Set<string>();
          for (let index = 0; index < pages; index += 1) {
            const page = config.pageParam ? config.pageStart + index : null;
            const url = buildRequestUrl(config, run.extra, page);
            const response = await fetchText(url, redactUrl(url, secrets), config.policy);
            diagnostics.requests += response.attempts;
            const result = transformResponse(response.body, response.contentType, config, now, run.signals);
            diagnostics.responseFormat = result.format;
            diagnostics.received += result.received;
            diagnostics.expired += result.expired;
            for (const [reason, count] of Object.entries(result.rejectReasons)) {
              diagnostics.rejectReasons[reason] = (diagnostics.rejectReasons[reason] ?? 0) + count;
              diagnostics.rejected += count;
            }
            const fresh = result.deals.filter((deal) => !seenOnRun.has(deal.id));
            fresh.forEach((deal) => seenOnRun.add(deal.id));
            deals.push(...fresh);
            // stop paginating when a page is empty or only repeats earlier results
            if (result.received === 0 || fresh.length === 0) break;
          }
        }
        diagnostics.ok = true;
        if (diagnostics.received === 0) diagnostics.warnings.push('Sağlayıcı yanıtında fırsat kaydı bulunamadı.');
      } catch (error) {
        if (error instanceof ProviderHttpError) diagnostics.requests += error.attempts;
        diagnostics.ok = false;
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.error = secrets.reduce((text, secret) => text.split(secret).join('***'), message);
      }
      diagnostics.accepted = deals.length;
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.durationMs = Date.now() - started;
      return { deals: diagnostics.ok ? deals : [], diagnostics };
    },
  };
}
