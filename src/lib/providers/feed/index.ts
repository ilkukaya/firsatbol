import { z } from 'zod';
import { readBool, readEnv } from '../../env';
import { normalizeDeal, type NormalizeContext } from '../../deals/normalize';
import type { Deal } from '../../deals/schema';
import { mapRecord, type FieldMap } from '../fields';
import { DEFAULT_POLICY, fetchText, redactUrl } from '../http';
import { detectFormat, extractRecords, parseBody } from '../parse';
import { emptyDiagnostics, type ProviderAdapter, type ProviderResult } from '../types';

/**
 * Generic JSON/XML feed adapter for affiliate networks or merchants that give the owner an
 * authorised feed URL (Admitad, Awin, CJ and direct programmes all offer feed exports).
 * Nothing here is network-specific: each feed is declared by the owner in the
 * `DEAL_FEEDS` env var (JSON array) once the programme has approved the site.
 *
 *   DEAL_FEEDS='[{"id":"awin-ornek","name":"Örnek Mağaza","url":"https://…","fieldMap":{"title":"product_name"},
 *     "attributionText":"…","attributionUrl":"https://…","attributionRequired":false,"trackingVerified":true,
 *     "category":"alisveris"}]'
 */
const feedSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{3,40}$/)
    .refine((id) => !id.startsWith('firsatbufirsat') && id !== 'editorial', 'reserved id'),
  name: z.string().min(2).max(80),
  url: z.url({ protocol: /^https$/ }),
  fieldMap: z.record(z.string(), z.string()).optional(),
  attributionText: z.string().max(300).optional(),
  attributionUrl: z.url({ protocol: /^https$/ }).optional(),
  attributionRequired: z.boolean().optional(),
  trackingVerified: z.boolean().optional(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type FeedConfig = z.infer<typeof feedSchema>;

export function readFeedConfigs(): { feeds: FeedConfig[]; errors: string[] } {
  const raw = readEnv('DEAL_FEEDS');
  if (!raw) return { feeds: [], errors: [] };
  try {
    const parsed = z.array(feedSchema).safeParse(JSON.parse(raw));
    if (!parsed.success) return { feeds: [], errors: [`DEAL_FEEDS geçersiz: ${parsed.error.issues[0]?.message ?? ''}`] };
    return { feeds: parsed.data.filter((feed) => feed.enabled !== false), errors: [] };
  } catch {
    return { feeds: [], errors: ['DEAL_FEEDS geçerli bir JSON değil.'] };
  }
}

export function createFeedAdapter(feed: FeedConfig): ProviderAdapter {
  const indexProviderPages = readBool('DEALS_INDEX_PROVIDER_PAGES', false);
  return {
    id: feed.id,
    name: feed.name,
    isConfigured: () => true,
    async fetchDeals({ now }): Promise<ProviderResult> {
      const diagnostics = emptyDiagnostics(feed.id, feed.name, true);
      const started = Date.now();
      const deals: Deal[] = [];
      const secrets = [new URL(feed.url).search].filter((value) => value.length > 1);
      try {
        const response = await fetchText(feed.url, redactUrl(feed.url, []), DEFAULT_POLICY);
        diagnostics.requests = response.attempts;
        const format = detectFormat(response.contentType, response.body);
        diagnostics.responseFormat = format;
        if (format !== 'json' && format !== 'xml') throw new Error(`Desteklenmeyen akış biçimi: ${format}`);
        const { records } = extractRecords(parseBody(format, response.body));
        diagnostics.received = records.length;
        const ctx: NormalizeContext = {
          providerId: feed.id,
          providerName: feed.name,
          attribution: {
            required: feed.attributionRequired ?? false,
            providerId: feed.id,
            text: feed.attributionText ?? `Fırsat bilgileri ${feed.name} tarafından sağlanmaktadır.`,
            url: feed.attributionUrl ?? null,
          },
          trackingStatus: feed.trackingVerified ? 'provider-tracked' : 'unverified',
          now,
          redact: [],
          indexProviderPages,
        };
        for (const record of records) {
          const { input } = mapRecord(record, (feed.fieldMap ?? {}) as FieldMap);
          if (feed.category && !input.category) input.category = feed.category;
          const result = normalizeDeal(input, ctx);
          if (!result.ok) {
            diagnostics.rejected += 1;
            diagnostics.rejectReasons[result.reason] = (diagnostics.rejectReasons[result.reason] ?? 0) + 1;
          } else if (result.deal.status === 'expired') diagnostics.expired += 1;
          else deals.push(result.deal);
        }
        diagnostics.ok = true;
      } catch (error) {
        diagnostics.ok = false;
        diagnostics.error = error instanceof Error ? error.message : String(error);
        for (const secret of secrets) diagnostics.error = diagnostics.error.split(secret).join('?***');
      }
      diagnostics.accepted = deals.length;
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.durationMs = Date.now() - started;
      return { deals: diagnostics.ok ? deals : [], diagnostics };
    },
  };
}
