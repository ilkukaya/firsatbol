import type { Deal } from './schema';
import { shortHash } from './normalize';

/**
 * Stable fingerprint of the published deal set. The build publishes it at
 * /data/build-info.json; the scheduled sync recomputes it from the providers and triggers
 * a rebuild only when it differs (new/removed/expired deals, price or date changes).
 */
export function dealsFingerprint(deals: readonly Deal[]): string {
  const rows = deals
    .map((deal) =>
      [
        deal.id,
        deal.title,
        deal.price ?? '',
        deal.originalPrice ?? '',
        deal.validUntil ?? '',
        deal.imageUrl ?? '',
        deal.affiliateUrl ?? deal.sourceUrl,
      ].join('|'),
    )
    .sort();
  return `${rows.length}-${shortHash(rows.join('\n'))}`;
}
