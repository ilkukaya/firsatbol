import { CATEGORIES, DEFAULT_CATEGORY_SLUG } from '../../config/categories';
import { normalizeCity } from '../../config/cities';
import { searchFold, slugify } from '../slug';
import { dealSchema, type Attribution, type Deal, type TrackingStatus } from './schema';

/** Values an adapter extracted from one provider record, before normalisation. */
export interface RawDealInput {
  externalId?: unknown;
  title?: unknown;
  description?: unknown;
  summary?: unknown;
  merchant?: unknown;
  category?: unknown;
  city?: unknown;
  district?: unknown;
  originalPrice?: unknown;
  price?: unknown;
  discountPercent?: unknown;
  currency?: unknown;
  imageUrl?: unknown;
  sourceUrl?: unknown;
  affiliateUrl?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  conditions?: unknown;
  tags?: unknown;
  featured?: unknown;
  popular?: unknown;
  isNew?: unknown;
}

export interface NormalizeContext {
  providerId: string;
  providerName: string;
  attribution: Attribution;
  trackingStatus: TrackingStatus;
  now: Date;
  /** Secret values (API keys) that must never appear in public output. */
  redact: readonly string[];
  /** Allow detail pages from this provider to be indexed when content is substantial. */
  indexProviderPages: boolean;
}

export type NormalizeResult = { ok: true; deal: Deal } | { ok: false; reason: string; title?: string };

// ---------------------------------------------------------------------------
// Primitive parsers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  hellip: '…',
  bull: '•',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Provider HTML → plain text. We never render provider HTML directly. */
export function toPlainText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = decodeEntities(
    String(value)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? null : text;
}

export function toSingleLine(value: unknown, max = 300): string | null {
  const text = toPlainText(value)?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Parse prices in Turkish or international notation:
 * 1299 · "1.299" · "1.299,90 TL" · "₺1,299.90" · "49,90" · 1299.9
 * Returns null when the value is missing, zero-like text, or unparseable.
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? round2(value) : null;
  if (typeof value !== 'string') return null;
  let text = value.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(text) || text.startsWith('-')) return null;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // the right-most separator is the decimal separator
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // "1,299" (3 decimals) is a thousands separator; "49,90" is a Turkish decimal comma
    const decimals = text.length - lastComma - 1;
    text = decimals === 3 && !/^0,/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (lastDot !== -1) {
    const groups = text.split('.');
    const decimals = text.length - lastDot - 1;
    // "1.299" or "12.500.000" → thousands; "12.99" → decimal
    if (decimals === 3 && groups.length >= 2 && !/^0\./.test(text)) text = groups.join('');
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) && parsed >= 0 ? round2(parsed) : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePercent(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? parsePrice(value.replace('%', '')) : null;
  if (parsed === null || !Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 1 && rounded <= 99 ? rounded : null;
}

const ISTANBUL_OFFSET = '+03:00'; // Türkiye has used UTC+3 year-round since 2016.

/**
 * Parse provider dates into ISO-8601 with offset. Supports ISO strings, unix seconds or
 * milliseconds, and Turkish "dd.mm.yyyy[ hh:mm[:ss]]" (interpreted as Istanbul time).
 */
export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{9,13}$/.test(value.trim()))) {
    const numeric = Number(value);
    const ms = numeric < 1e12 ? numeric * 1000 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (tr) {
    const [, d, m, y, hh, mm, ss] = tr;
    // date only → end of that day; time without seconds → :00
    const time = hh !== undefined ? `${hh.padStart(2, '0')}:${mm}:${ss ?? '00'}` : '23:59:59';
    const iso = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}T${time}${ISTANBUL_OFFSET}`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  // "2026-10-31" (date only) → end of that day in Istanbul
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T23:59:59${ISTANBUL_OFFSET}`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  // "2026-10-31 18:00:00" without offset → Istanbul time
  const naive = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(text);
  if (naive) {
    const date = new Date(`${naive[1]}T${naive[2]}${ISTANBUL_OFFSET}`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'evet', 'on'].includes(value.trim().toLowerCase());
  return false;
}

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toSingleLine(item, 200)).filter((item): item is string => item !== null);
  }
  const text = toPlainText(value);
  if (!text) return [];
  return text
    .split(/\n|•|;/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

/** Accept only absolute http(s) URLs; upgrade protocol-relative URLs. */
export function parseUrl(value: unknown, redact: readonly string[] = []): string | null {
  if (typeof value !== 'string') return null;
  let text = decodeEntities(value.trim());
  if (text.startsWith('//')) text = `https:${text}`;
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    // Never publish a URL that carries one of our secrets (e.g. the API key).
    for (const [key, val] of [...url.searchParams.entries()]) {
      if (redact.some((secret) => secret.length > 3 && val === secret) || key.toLowerCase() === 'apikey') {
        url.searchParams.delete(key);
      }
    }
    const serialised = url.toString();
    if (redact.some((secret) => secret.length > 3 && serialised.includes(secret))) return null;
    return serialised;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Derived facts
// ---------------------------------------------------------------------------

/**
 * Discount shown to visitors. Provider-stated value wins; otherwise calculated only when
 * BOTH prices are known and the discounted price is genuinely lower.
 */
export function resolveDiscount(
  originalPrice: number | null,
  price: number | null,
  providerPercent: number | null,
): { percent: number | null; source: 'provider' | 'calculated' | null } {
  if (originalPrice !== null && price !== null && originalPrice > 0 && price < originalPrice) {
    const calculated = Math.floor(((originalPrice - price) / originalPrice) * 100);
    if (providerPercent !== null) {
      // trust the provider only if it is consistent with its own prices (±2 points)
      return Math.abs(providerPercent - calculated) <= 2
        ? { percent: providerPercent, source: 'provider' }
        : { percent: calculated >= 1 ? calculated : null, source: calculated >= 1 ? 'calculated' : null };
    }
    return calculated >= 1 ? { percent: calculated, source: 'calculated' } : { percent: null, source: null };
  }
  if (providerPercent !== null && (originalPrice === null || price === null)) {
    return { percent: providerPercent, source: 'provider' };
  }
  return { percent: null, source: null };
}

const CATEGORY_KEYWORDS = CATEGORIES.map((category) => ({
  slug: category.slug,
  keywords: category.keywords.map((keyword) => ` ${keyword} `),
}));

/**
 * Map a provider category (and, as a fallback, the title) to a FırsatBol category slug.
 * The provider's own category text is weighted much more than the title.
 */
export function mapCategory(sourceCategory: string | null, title: string, tags: readonly string[] = []): string {
  const score = new Map<string, number>();
  const add = (text: string, weight: number) => {
    const folded = ` ${searchFold(text)} `;
    for (const { slug, keywords } of CATEGORY_KEYWORDS) {
      for (const keyword of keywords) {
        if (folded.includes(keyword)) score.set(slug, (score.get(slug) ?? 0) + weight);
      }
    }
  };
  if (sourceCategory) add(sourceCategory, 10);
  for (const tag of tags) add(tag, 3);
  add(title, 1);
  let best = DEFAULT_CATEGORY_SLUG;
  let bestScore = 0;
  for (const [slug, value] of score) {
    if (value > bestScore) {
      best = slug;
      bestScore = value;
    }
  }
  return best;
}

export function shortHash(value: string): string {
  // FNV-1a 32-bit — stable, dependency-free, good enough for slugs/ids
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildSlug(title: string, externalId: string, providerId: string): string {
  const base = slugify(title, 70) || 'firsat';
  const suffix = slugify(externalId, 16) || shortHash(`${providerId}:${externalId}`);
  return `${base}-${suffix}`;
}

/**
 * Detail pages are indexable only when they carry original value: an editorial summary
 * written for FırsatBol, or (if the owner opts in) a substantial provider description.
 * Everything else is rendered for users but marked `noindex, follow`.
 */
export function computeIndexable(summary: string | null, description: string | null, indexProviderPages: boolean): boolean {
  if (summary && summary.length >= 120) return true;
  return indexProviderPages && (description?.length ?? 0) >= 200;
}

// ---------------------------------------------------------------------------
// Record normalisation
// ---------------------------------------------------------------------------

export function normalizeDeal(raw: RawDealInput, ctx: NormalizeContext): NormalizeResult {
  const title = toSingleLine(raw.title, 200);
  if (!title || title.length < 3) return { ok: false, reason: 'missing-title' };

  const sourceUrl = parseUrl(raw.sourceUrl, ctx.redact);
  const affiliateUrl = parseUrl(raw.affiliateUrl, ctx.redact);
  const outbound = sourceUrl ?? affiliateUrl;
  if (!outbound) return { ok: false, reason: 'missing-url', title };

  const rawId = raw.externalId;
  const externalId =
    (typeof rawId === 'string' || typeof rawId === 'number') && String(rawId).trim() !== '' ? String(rawId).trim() : shortHash(outbound);

  const description = toPlainText(raw.description);
  const summary = toPlainText(raw.summary);
  const sourceCategory = toSingleLine(raw.category, 120);
  const tags = parseStringList(raw.tags).slice(0, 12);
  const city = normalizeCity(toSingleLine(raw.city, 80));
  const district = toSingleLine(raw.district, 80);

  let originalPrice = parsePrice(raw.originalPrice);
  // a price of 0 is far more often a missing value than a free offer — never imply "free"
  const parsedPrice = parsePrice(raw.price);
  const price = parsedPrice === 0 ? null : parsedPrice;
  if (originalPrice !== null && originalPrice <= 0) originalPrice = null;
  // an "original price" equal to the price is not a discount — drop it rather than imply one
  if (originalPrice !== null && price !== null && originalPrice <= price) originalPrice = null;
  const discount = resolveDiscount(originalPrice, price, parsePercent(raw.discountPercent));

  const currencyRaw = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  const currency = ['TL', 'YTL', '₺', ''].includes(currencyRaw) ? 'TRY' : currencyRaw.slice(0, 3);

  const validFrom = parseDate(raw.validFrom);
  const validUntil = parseDate(raw.validUntil);
  const expired = validUntil !== null && new Date(validUntil).getTime() < ctx.now.getTime();

  const candidate: Deal = {
    id: `${ctx.providerId}:${externalId}`,
    externalId,
    provider: ctx.providerId,
    providerName: ctx.providerName,
    title,
    slug: buildSlug(title, externalId, ctx.providerId),
    description,
    summary,
    category: mapCategory(sourceCategory, title, tags),
    sourceCategory,
    merchant: toSingleLine(raw.merchant, 120),
    city: city?.name ?? null,
    citySlug: city?.slug ?? null,
    district,
    originalPrice,
    price,
    currency: currency.length === 3 ? currency : 'TRY',
    discountPercent: discount.percent,
    discountSource: discount.source,
    imageUrl: parseUrl(raw.imageUrl, ctx.redact),
    sourceUrl: sourceUrl ?? outbound,
    affiliateUrl,
    trackingStatus: affiliateUrl ? ctx.trackingStatus : 'none',
    validFrom: validFrom && validUntil && validFrom > validUntil ? null : validFrom,
    validUntil,
    lastCheckedAt: ctx.now.toISOString(),
    status: expired ? 'expired' : 'published',
    attribution: ctx.attribution,
    featured: parseBoolean(raw.featured),
    popular: parseBoolean(raw.popular),
    isNew: parseBoolean(raw.isNew),
    conditions: parseStringList(raw.conditions).slice(0, 20),
    tags,
    indexable: computeIndexable(summary, description, ctx.indexProviderPages),
  };

  const parsed = dealSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: `invalid:${issue?.path.join('.') ?? '?'}`, title };
  }
  return { ok: true, deal: parsed.data };
}

// ---------------------------------------------------------------------------
// Collection-level helpers
// ---------------------------------------------------------------------------

const TRACKING_PARAMS = /^(utm_|gclid$|fbclid$|yclid$|msclkid$)/i;

/** Canonical form of a destination URL for duplicate detection (tracking params removed). */
export function canonicalDestination(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}?${url.searchParams.toString()}`;
  } catch {
    return value;
  }
}

function completeness(deal: Deal): number {
  return [
    deal.description,
    deal.imageUrl,
    deal.price,
    deal.originalPrice,
    deal.validUntil,
    deal.merchant,
    deal.city,
    deal.affiliateUrl,
  ].filter((value) => value !== null).length;
}

/**
 * Remove duplicates by internal id, then by canonical destination URL. When two records
 * collide, the more complete one wins; provider signals (popular/new/featured) are merged.
 */
export function dedupeDeals(deals: readonly Deal[]): { deals: Deal[]; duplicates: number } {
  const byKey = new Map<string, Deal>();
  const keyOf = new Map<string, string>();
  let duplicates = 0;
  for (const deal of deals) {
    const destination = `dest:${canonicalDestination(deal.sourceUrl)}`;
    const existingKey = keyOf.get(`id:${deal.id}`) ?? keyOf.get(destination);
    if (!existingKey) {
      byKey.set(deal.id, deal);
      keyOf.set(`id:${deal.id}`, deal.id);
      keyOf.set(destination, deal.id);
      continue;
    }
    duplicates += 1;
    const existing = byKey.get(existingKey)!;
    const winner = completeness(deal) > completeness(existing) ? deal : existing;
    byKey.set(existingKey, {
      ...winner,
      id: existing.id,
      slug: existing.slug,
      popular: existing.popular || deal.popular,
      isNew: existing.isNew || deal.isNew,
      featured: existing.featured || deal.featured,
    });
  }
  return { deals: [...byKey.values()], duplicates };
}

/** Make slugs unique across providers (rare collisions get a short hash suffix). */
export function ensureUniqueSlugs(deals: Deal[]): Deal[] {
  const seen = new Set<string>();
  return deals.map((deal) => {
    if (!seen.has(deal.slug)) {
      seen.add(deal.slug);
      return deal;
    }
    const slug = `${deal.slug}-${shortHash(deal.id)}`;
    seen.add(slug);
    return { ...deal, slug };
  });
}

/** Mark duplicate titles (same title from different records) as non-indexable. */
export function markDuplicateTitles(deals: Deal[]): Deal[] {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    const key = searchFold(deal.title);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return deals.map((deal) => ((counts.get(searchFold(deal.title)) ?? 0) > 1 ? { ...deal, indexable: false } : deal));
}

export function isActive(deal: Deal, now: Date): boolean {
  if (deal.status !== 'published') return false;
  if (deal.validUntil && new Date(deal.validUntil).getTime() < now.getTime()) return false;
  return true;
}
