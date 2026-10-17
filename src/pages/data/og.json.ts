import type { APIRoute } from 'astro';
import { getDeals } from '../../lib/deals/repository';
import { ogCard } from '../../lib/og';

/** Card data for the social preview images (netlify/functions/og.mts), keyed by deal slug. */
export const GET: APIRoute = async () => {
  const { deals } = await getDeals();
  const cards = Object.fromEntries(deals.map((deal) => [deal.slug, ogCard(deal)]));
  return new Response(JSON.stringify(cards), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
