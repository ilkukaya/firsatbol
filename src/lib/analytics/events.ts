import { z } from 'zod';

/**
 * First-party interaction events. Deliberately minimal and anonymous: no IP address,
 * user agent, cookie or identifier is accepted or stored.
 */
export const EVENT_TYPES = ['deal_click', 'deal_view', 'search', 'newsletter_signup', 'contact_submit'] as const;

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[\p{L}\p{N}\s:._\-/]*$/u);

export const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  path: z
    .string()
    .max(300)
    .regex(/^\/[^\s]*$/),
  deal: shortText(200).optional(),
  provider: shortText(60).optional(),
  category: shortText(60).optional(),
  city: shortText(60).optional(),
  placement: shortText(60).optional(),
  q: z.string().trim().max(80).optional(),
  results: z.number().int().min(0).max(1_000_000).optional(),
});

export type AnalyticsEvent = z.infer<typeof eventSchema>;

/** Drop search terms that look like personal data (emails, phone numbers, long digit runs). */
export function scrubQuery(query: string | undefined): string | undefined {
  if (!query) return undefined;
  const value = query.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  if (!value || value.includes('@') || /\d{6,}/.test(value.replace(/[\s-]/g, ''))) return undefined;
  return value.slice(0, 80);
}

export function parseEvent(input: unknown): AnalyticsEvent | null {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return null;
  const event = parsed.data;
  // path without query string (it could contain search terms or tracking ids)
  const path = event.path.split('?')[0]!.split('#')[0]!;
  const q = event.type === 'search' ? scrubQuery(event.q) : undefined;
  if (event.type === 'search' && !q) return null;
  const { q: _q, ...rest } = event;
  return { ...rest, path, ...(q ? { q } : {}) };
}

export interface EventSummary {
  from: string;
  to: string;
  totals: Record<string, number>;
  clicksByProvider: Record<string, number>;
  clicksByCategory: Record<string, number>;
  viewsByCategory: Record<string, number>;
  topDeals: { deal: string; clicks: number; views: number; ctr: number | null }[];
  topSearches: { q: string; count: number; zeroResults: number }[];
  clicksByPlacement: Record<string, number>;
}

const inc = (map: Record<string, number>, key: string | undefined) => {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
};

export function summarizeEvents(events: readonly AnalyticsEvent[], from: string, to: string): EventSummary {
  const totals: Record<string, number> = {};
  const clicksByProvider: Record<string, number> = {};
  const clicksByCategory: Record<string, number> = {};
  const viewsByCategory: Record<string, number> = {};
  const clicksByPlacement: Record<string, number> = {};
  const deals = new Map<string, { clicks: number; views: number }>();
  const searches = new Map<string, { count: number; zeroResults: number }>();
  for (const event of events) {
    inc(totals, event.type);
    if (event.type === 'deal_click') {
      inc(clicksByProvider, event.provider);
      inc(clicksByCategory, event.category);
      inc(clicksByPlacement, event.placement);
    }
    if (event.type === 'deal_view') inc(viewsByCategory, event.category);
    if ((event.type === 'deal_click' || event.type === 'deal_view') && event.deal) {
      const row = deals.get(event.deal) ?? { clicks: 0, views: 0 };
      if (event.type === 'deal_click') row.clicks += 1;
      else row.views += 1;
      deals.set(event.deal, row);
    }
    if (event.type === 'search' && event.q) {
      const row = searches.get(event.q) ?? { count: 0, zeroResults: 0 };
      row.count += 1;
      if (event.results === 0) row.zeroResults += 1;
      searches.set(event.q, row);
    }
  }
  return {
    from,
    to,
    totals,
    clicksByProvider,
    clicksByCategory,
    viewsByCategory,
    clicksByPlacement,
    topDeals: [...deals.entries()]
      .map(([deal, row]) => ({ deal, ...row, ctr: row.views > 0 ? Math.round((row.clicks / row.views) * 1000) / 10 : null }))
      .sort((a, b) => b.clicks - a.clicks || b.views - a.views)
      .slice(0, 50),
    topSearches: [...searches.entries()]
      .map(([q, row]) => ({ q, ...row }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
  };
}
