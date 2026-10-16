import type { APIRoute } from 'astro';
import { absoluteUrl } from '../config/site';
import { sitemapEntries } from '../lib/sitemap';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = async () => {
  const entries = await sitemapEntries();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url><loc>${escape(absoluteUrl(entry.path))}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
