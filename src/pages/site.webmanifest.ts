import type { APIRoute } from 'astro';
import { SITE } from '../config/site';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: SITE.name,
      short_name: SITE.name,
      description: SITE.description,
      lang: 'tr-TR',
      start_url: '/',
      display: 'standalone',
      background_color: '#f7f5f2',
      theme_color: SITE.themeColor,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    }),
    { headers: { 'content-type': 'application/manifest+json' } },
  );
