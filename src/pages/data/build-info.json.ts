import type { APIRoute } from 'astro';
import { getDeals } from '../../lib/deals/repository';

/**
 * Public build metadata: import counts per provider and a coverage summary, readable at
 * /data/build-info.json after every build. Contains only counts, timestamps and a hash — never
 * credentials or raw provider responses.
 */
export const GET: APIRoute = async () => {
  const { deals, generatedAt, diagnostics, fixtureMode, networkFingerprint } = await getDeals();
  return new Response(
    JSON.stringify({
      generatedAt,
      fixtureMode,
      total: deals.length,
      networkFingerprint,
      providers: diagnostics.map((d) => ({
        id: d.providerId,
        ok: d.ok,
        received: d.received,
        accepted: d.accepted,
        expired: d.expired,
        rejected: d.rejected,
        requests: d.requests,
        format: d.responseFormat,
      })),
      // coverage self-check of every build (the full cross-check is `npm run audit:coverage`)
      coverage: {
        withoutCategory: deals.filter((deal) => deal.topics.length === 0).length,
        withoutCity: deals.filter((deal) => !deal.citySlug).length,
        withoutDistrict: deals.filter((deal) => deal.citySlug && !deal.district).length,
        withEventCalendar: deals.filter((deal) => deal.sessions.length > 0).length,
      },
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
};
