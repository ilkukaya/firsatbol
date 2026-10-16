import { z } from 'zod';

/**
 * Normalised, provider-independent deal record.
 *
 * Rules (enforced here and in `normalize.ts`):
 *  - Optional facts are `null` when the provider does not supply them. We never
 *    manufacture prices, discounts, dates or ratings.
 *  - `discountPercent` is set only when the provider states it or both prices are known.
 *  - `affiliateUrl` is the provider's own referral/tracking URL, passed through unchanged.
 */
const httpsUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });

const isoDate = z.iso.datetime({ offset: true });

export const trackingStatusSchema = z.enum([
  /** The provider documents the URL as a publisher-tracked referral link. */
  'provider-tracked',
  /** URL came from the provider but tracking has not been verified by the owner yet. */
  'unverified',
  /** Plain merchant link (e.g. editorial deal without an affiliate programme). */
  'none',
]);

export const attributionSchema = z.object({
  required: z.boolean(),
  providerId: z.string(),
  text: z.string(),
  url: httpsUrl.nullable(),
});

export const dealSchema = z
  .object({
    id: z.string().min(3),
    externalId: z.string().min(1),
    provider: z.string().min(2),
    providerName: z.string().min(2),
    title: z.string().min(3).max(300),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().nullable(),
    summary: z.string().nullable(),
    category: z.string(),
    sourceCategory: z.string().nullable(),
    merchant: z.string().nullable(),
    city: z.string().nullable(),
    citySlug: z.string().nullable(),
    district: z.string().nullable(),
    originalPrice: z.number().positive().nullable(),
    price: z.number().nonnegative().nullable(),
    currency: z.string().length(3),
    discountPercent: z.number().int().min(1).max(99).nullable(),
    discountSource: z.enum(['provider', 'calculated']).nullable(),
    imageUrl: httpsUrl.nullable(),
    sourceUrl: httpsUrl,
    affiliateUrl: httpsUrl.nullable(),
    trackingStatus: trackingStatusSchema,
    validFrom: isoDate.nullable(),
    validUntil: isoDate.nullable(),
    lastCheckedAt: isoDate,
    status: z.enum(['published', 'draft', 'expired']),
    attribution: attributionSchema,
    featured: z.boolean(),
    /** Provider-supplied popularity signal only (e.g. returned by a "popular" query). */
    popular: z.boolean(),
    /** Provider-supplied "new" signal only. */
    isNew: z.boolean(),
    conditions: z.array(z.string()),
    tags: z.array(z.string()),
    /** Whether the detail page may be indexed (see `indexability` in normalize.ts). */
    indexable: z.boolean(),
  })
  .superRefine((deal, ctx) => {
    if (deal.originalPrice !== null && deal.price !== null && deal.price > deal.originalPrice) {
      ctx.addIssue({
        code: 'custom',
        message: 'İndirimli fiyat, orijinal fiyattan yüksek olamaz',
        path: ['price'],
      });
    }
    if (deal.validFrom && deal.validUntil && deal.validFrom > deal.validUntil) {
      ctx.addIssue({ code: 'custom', message: 'Geçerlilik başlangıcı bitişten sonra', path: ['validFrom'] });
    }
  });

export type Deal = z.infer<typeof dealSchema>;
export type TrackingStatus = z.infer<typeof trackingStatusSchema>;
export type Attribution = z.infer<typeof attributionSchema>;

/** Compact record shipped to the browser for client-side filtering and search. */
export interface DealIndexEntry {
  id: string;
  s: string; // slug
  t: string; // title
  m: string | null; // merchant
  c: string; // category slug
  ct: string | null; // city slug
  cn: string | null; // city name
  d: string | null; // district
  p: number | null; // price
  op: number | null; // original price
  dp: number | null; // discount %
  cur: string;
  img: string | null;
  u: string; // outbound URL (affiliate when available)
  pv: string; // provider id
  pn: string; // provider name
  vu: string | null; // valid until
  vf: string | null; // valid from
  f: 0 | 1; // featured
  q: string; // folded search text
}
