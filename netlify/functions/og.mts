import type { Config, Context } from '@netlify/functions';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import jpeg from 'jpeg-js';
import { OG_HEIGHT, OG_WIDTH, ogLayout, slugFromOgFile, type OgCard } from '../../src/lib/og';

/**
 * GET /og/firsat/<slug>-<version>.jpg — the deal's social preview card (photo, discount, price),
 * drawn on first request and cached by Netlify's CDN (the version in the URL changes with the
 * card's content). JPEG (~100 KB): WhatsApp skips large preview images. Card data is this deploy's
 * /data/og.json, bundled with the function (no network round trip); only known deals can be
 * drawn. Any failure falls back to the deal photo, so a preview is never empty. The deal page
 * requests the card as soon as someone touches a share button, so it is ready when the
 * messenger's crawler asks for it.
 */
const FONT_DIR = 'node_modules/@fontsource/plus-jakarta-sans/files';
const WASM = 'node_modules/@resvg/resvg-wasm/index_bg.wasm';

function asset(relative: string): Buffer {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.cwd(), here, join(here, '..'), join(here, '..', '..'), '/var/task'].map((base) => join(base, relative));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`asset not found: ${relative}`);
  return readFileSync(found);
}

let ready: Promise<{ name: string; data: Buffer; weight: 600 | 800 }[]> | undefined;
function setup() {
  ready ??= (async () => {
    await initWasm(asset(WASM));
    return (['latin', 'latin-ext'] as const).flatMap((subset) =>
      ([600, 800] as const).map((weight) => ({
        // separate family names: satori falls back across families, not across files of one family
        name: subset === 'latin' ? 'Jakarta' : 'JakartaExt',
        data: asset(`${FONT_DIR}/plus-jakarta-sans-${subset}-${weight}-normal.woff`),
        weight,
      })),
    );
  })();
  return ready;
}

let cards: Record<string, OgCard> | undefined;
async function card(origin: string, slug: string): Promise<OgCard | undefined> {
  if (!cards) {
    try {
      cards = JSON.parse(asset('dist/data/og.json').toString('utf8')) as Record<string, OgCard>;
    } catch {
      // not bundled (e.g. local runs): read it from this deploy
      const response = await fetch(new URL('/data/og.json', origin));
      if (!response.ok) throw new Error(`og.json HTTP ${response.status}`);
      cards = (await response.json()) as Record<string, OgCard>;
    }
  }
  return cards[slug];
}

async function photo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    return `data:${type.split(';')[0]};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

export default async (request: Request, context: Context) => {
  const slug = slugFromOgFile(context.params.file ?? '');
  if (!slug) return new Response('not found', { status: 404 });
  const origin = new URL(request.url).origin;
  let data: OgCard | undefined;
  try {
    data = await card(origin, slug);
    if (!data) return new Response('not found', { status: 404 });
    const fonts = await setup();
    const svg = await satori(ogLayout(data, await photo(data.i), new URL(origin).host) as never, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts,
    });
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render();
    const encoded = jpeg.encode({ data: image.pixels, width: image.width, height: image.height }, 82);
    return new Response(new Uint8Array(encoded.data), {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=604800, immutable',
        'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[og]', slug, error instanceof Error ? error.message : error);
    // never leave a preview empty: send the plain photo (or the site card) instead, not cached long
    return new Response(null, {
      status: 302,
      headers: { location: data?.i ?? new URL('/og/default.png', origin).toString(), 'cache-control': 'public, max-age=300' },
    });
  }
};

export const config: Config = {
  path: '/og/firsat/:file',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
