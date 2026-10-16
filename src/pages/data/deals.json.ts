import type { APIRoute } from 'astro';
import { getDeals } from '../../lib/deals/repository';
import { toIndexEntry } from '../../lib/deals/query';

/** Compact public index for client-side filtering and search (no secrets, public deal data only). */
export const GET: APIRoute = async () => {
  const { deals, generatedAt } = await getDeals();
  return new Response(JSON.stringify({ generatedAt, deals: deals.map(toIndexEntry) }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
