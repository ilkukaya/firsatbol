import type { APIRoute } from 'astro';
import { getDeals } from '../../lib/deals/repository';

/**
 * Public build metadata used by the scheduled sync to detect changes. Contains only counts,
 * timestamps and a hash — never credentials or raw provider responses.
 */
export const GET: APIRoute = async () => {
  const { deals, generatedAt, diagnostics, fixtureMode, networkFingerprint } = await getDeals();
  return new Response(
    JSON.stringify({
      generatedAt,
      fixtureMode,
      total: deals.length,
      networkFingerprint,
      providers: diagnostics.map((d) => ({ id: d.providerId, ok: d.ok, accepted: d.accepted, format: d.responseFormat })),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
