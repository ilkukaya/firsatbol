import type { APIRoute } from 'astro';
import { absoluteUrl } from '../config/site';
import { readEnv } from '../lib/env';

/** Production allows crawling; Netlify previews/branch deploys are blocked to avoid duplicates. */
export const GET: APIRoute = () => {
  const context = readEnv('CONTEXT');
  const isPreview = context !== undefined && context !== 'production';
  const body = isPreview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
