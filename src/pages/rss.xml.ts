import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../config/site';
import { getDeals } from '../lib/deals/repository';
import { formatPrice } from '../lib/format';

/** RSS: newest guides + currently published deals (indexable ones only, to mirror the sitemap). */
export async function GET(context: APIContext) {
  const { deals, generatedAt } = await getDeals();
  const guides = await getCollection('guides', (entry) => !entry.data.draft);
  const dealItems = deals
    .filter((deal) => deal.indexable)
    .slice(0, 50)
    .map((deal) => ({
      title: deal.title,
      link: `/firsat/${deal.slug}/`,
      pubDate: new Date(deal.validFrom ?? generatedAt),
      description: [
        deal.summary ?? deal.description?.slice(0, 280) ?? '',
        deal.price !== null ? `Fiyat: ${formatPrice(deal.price, deal.currency)}` : '',
        `Kaynak: ${deal.providerName}`,
      ]
        .filter(Boolean)
        .join(' · '),
      categories: [deal.category],
    }));
  const guideItems = guides.map((guide) => ({
    title: guide.data.title,
    link: `/rehber/${guide.id}/`,
    pubDate: guide.data.publishedAt,
    description: guide.data.description,
    categories: ['rehber'],
  }));
  return rss({
    title: `${SITE.name} — Yeni fırsatlar ve rehberler`,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: [...guideItems, ...dealItems].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime()),
    customData: '<language>tr-TR</language>',
    trailingSlash: true,
  });
}
