import { normalizeCity } from '../../../config/cities';
import { buildSlug, computeIndexable, parseDate, parsePrice, parseUrl, toSingleLine, type NormalizeContext } from '../../deals/normalize';
import { dealSchema, type Deal, type DealSession } from '../../deals/schema';
import { readPath } from '../fields';
import { detectFormat, parseBody } from '../parse';

/**
 * Fırsat Bu Fırsat "Etkinlik API" (`/deal/event-deals.html`), verified 2026-10-16:
 * `{ result, page, itemInPage, total, events: [...] }`, one record per SESSION with
 * dealId, subDealId, eventTitle, eventDate ("YYYY-MM-DD HH:mm:ss", Istanbul), realPrice,
 * dealPrice, businessTitle/Address/Town/City, dealUrl (pid-tracked), image400x400, image1200x1200.
 * Sessions are grouped by dealId and attached to the matching deal from the deals API.
 */
export interface EventSessionRecord {
  dealId: string;
  title: string;
  session: DealSession;
  url: string | null;
  imageUrl: string | null;
  imageLargeUrl: string | null;
  venue: string | null;
}

export interface EventsPage {
  records: EventSessionRecord[];
  /** Raw session keys in response order (detects repeated pages). */
  keys: string[];
  total: number | null;
  received: number;
}

export function parseEventsResponse(body: string, contentType: string, redact: readonly string[], now: Date): EventsPage {
  const format = detectFormat(contentType, body);
  if (format !== 'json') throw new Error(`Etkinlik API beklenmeyen biçim döndürdü (${format}).`);
  const tree = parseBody(format, body) as Record<string, unknown>;
  const result = String(tree.result ?? 'SUCCESS').toUpperCase();
  if (result !== 'SUCCESS')
    throw new Error(`Etkinlik API hata döndürdü: ${result} ${String(tree.resultMessage ?? '').slice(0, 200)}`.trim());
  const totalRaw = tree.total;
  const total = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' && /^\d+$/.test(totalRaw) ? Number(totalRaw) : null;
  const list = Array.isArray(tree.events) ? (tree.events as Record<string, unknown>[]) : [];
  const records: EventSessionRecord[] = [];
  const keys: string[] = [];
  for (const raw of list) {
    const dealId = toSingleLine(readPath(raw, 'dealId'), 40);
    const date = parseDate(readPath(raw, 'eventDate'));
    keys.push(`${String(readPath(raw, 'subDealId') ?? '')}@${String(readPath(raw, 'eventDate') ?? '')}`);
    if (!dealId || !date || Date.parse(date) < now.getTime()) continue; // past sessions are irrelevant
    const city = normalizeCity(toSingleLine(readPath(raw, 'businessCity'), 80));
    const price = parsePrice(readPath(raw, 'dealPrice'));
    let originalPrice = parsePrice(readPath(raw, 'realPrice'));
    if (originalPrice !== null && (price === null || originalPrice <= price)) originalPrice = null;
    const venue = toSingleLine(readPath(raw, 'businessTitle'), 120);
    records.push({
      dealId,
      title: toSingleLine(readPath(raw, 'eventTitle'), 200) ?? '',
      url: parseUrl(readPath(raw, 'dealUrl'), redact),
      imageUrl: parseUrl(readPath(raw, 'image400x400'), redact),
      imageLargeUrl: parseUrl(readPath(raw, 'image1200x1200'), redact),
      venue,
      session: {
        date,
        venue,
        address: toSingleLine(readPath(raw, 'businessAddress'), 300),
        city: city?.name ?? null,
        citySlug: city?.slug ?? null,
        district: toSingleLine(readPath(raw, 'businessTown'), 80),
        price: price === 0 ? null : price,
        originalPrice,
      },
    });
  }
  return { records, keys, total, received: list.length };
}

function mostCommon<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const MAX_SESSIONS = 60;

/**
 * Attach sessions to deals with the same external id; create event deals for the rest.
 * Returns the merged list and how many event-only deals were created.
 */
export function mergeEventSessions(
  deals: readonly Deal[],
  records: readonly EventSessionRecord[],
  ctx: NormalizeContext & { publisherId?: string | undefined },
): { deals: Deal[]; attached: number; created: number } {
  const groups = new Map<string, EventSessionRecord[]>();
  for (const record of records) {
    const list = groups.get(record.dealId) ?? [];
    list.push(record);
    groups.set(record.dealId, list);
  }
  const byExternal = new Map(deals.map((deal) => [deal.externalId, deal]));
  const merged = [...deals];
  let attached = 0;
  let created = 0;
  for (const [dealId, group] of groups) {
    const sessions = group
      .map((record) => record.session)
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((session, index, all) => index === 0 || session.date !== all[index - 1]!.date || session.venue !== all[index - 1]!.venue)
      .slice(0, MAX_SESSIONS);
    const existing = byExternal.get(dealId);
    if (existing) {
      const index = merged.indexOf(existing);
      merged[index] = { ...existing, sessions, category: 'etkinlik' };
      attached += 1;
      continue;
    }
    const first = group[0]!;
    const url = group.find((record) => record.url)?.url;
    if (!url || !first.title) continue;
    const prices = sessions.map((session) => session.price).filter((price): price is number => price !== null);
    const price = prices.length ? Math.min(...prices) : null;
    const cheapest = sessions.find((session) => session.price === price);
    const citySlug = mostCommon(sessions.map((session) => session.citySlug).filter(Boolean));
    const cityName = sessions.find((session) => session.citySlug === citySlug)?.city ?? null;
    const venues = [...new Set(sessions.map((session) => session.venue).filter(Boolean))];
    const candidate: Deal = {
      id: `${ctx.providerId}:${dealId}`,
      externalId: dealId,
      provider: ctx.providerId,
      providerName: ctx.providerName,
      title: first.title,
      slug: buildSlug(first.title, dealId, ctx.providerId),
      description: null,
      summary: null,
      category: 'etkinlik',
      sourceCategory: 'Etkinlik',
      merchant: venues.length === 1 ? venues[0]! : null,
      address: venues.length === 1 ? (sessions[0]?.address ?? null) : null,
      city: cityName,
      citySlug: citySlug ?? null,
      district: venues.length === 1 ? (sessions[0]?.district ?? null) : null,
      originalPrice: cheapest?.originalPrice ?? null,
      price,
      currency: 'TRY',
      discountPercent: null,
      discountSource: null,
      imageUrl: first.imageUrl,
      imageLargeUrl: first.imageLargeUrl,
      images: first.imageLargeUrl ? [first.imageLargeUrl] : [],
      sourceUrl: url,
      affiliateUrl: ctx.publisherId && url.includes(ctx.publisherId) ? url : null,
      trackingStatus: ctx.publisherId && url.includes(ctx.publisherId) ? ctx.trackingStatus : 'none',
      validFrom: null,
      validUntil: sessions.at(-1)?.date ?? null,
      lastCheckedAt: ctx.now.toISOString(),
      status: 'published',
      attribution: ctx.attribution,
      featured: false,
      popular: false,
      isNew: false,
      conditions: [],
      options: [],
      sessions,
      priceFrom: new Set(prices).size > 1,
      tags: [],
      topics: [],
      indexable: computeIndexable(null, null, false),
    };
    if (candidate.originalPrice !== null && candidate.price !== null && candidate.originalPrice > candidate.price) {
      const percent = Math.floor(((candidate.originalPrice - candidate.price) / candidate.originalPrice) * 100);
      if (percent >= 1) {
        candidate.discountPercent = percent;
        candidate.discountSource = 'calculated';
      }
    }
    const parsed = dealSchema.safeParse(candidate);
    if (parsed.success) {
      merged.push(parsed.data);
      created += 1;
    }
  }
  return { deals: merged, attached, created };
}
