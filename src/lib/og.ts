import type { Deal } from './deals/schema';
import { formatPrice, formatSession } from './format';

/**
 * Social preview cards for deals (1200×630 PNG with the deal photo, discount and price), drawn on
 * demand by the `og` Netlify Function from /data/og.json and cached by the CDN. The image URL
 * carries a version of the card's content, so a price change gets a new image.
 */
export interface OgCard {
  /** title */
  t: string;
  /** price label ("429 TL", "429 TL’den") */
  p: string | null;
  /** original price label */
  o: string | null;
  /** discount percent */
  d: number | null;
  /** place */
  l: string | null;
  /** next session label */
  s: string | null;
  /** large photo URL */
  i: string | null;
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export function ogCard(deal: Deal): OgCard {
  const original = deal.originalPrice !== null && deal.price !== null && deal.originalPrice > deal.price ? deal.originalPrice : null;
  return {
    t: deal.title,
    p: deal.price !== null ? `${formatPrice(deal.price, deal.currency)}${deal.priceFrom ? '’den' : ''}` : null,
    o: original !== null ? formatPrice(original, deal.currency) : null,
    d: deal.discountPercent,
    l: [deal.district, deal.city].filter(Boolean).join(', ') || null,
    s: deal.sessions[0] ? formatSession(deal.sessions[0].date) : null,
    i: deal.imageLargeUrl ?? deal.imageUrl ?? null,
  };
}

/** Short, stable content hash (FNV-1a) — part of the image URL. */
export function ogVersion(card: OgCard): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(card)) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function ogImagePath(slug: string, card: OgCard): string {
  return `/og/firsat/${slug}-${ogVersion(card)}.png`;
}

/** "/og/firsat/<slug>-<version>.png" → slug (the version only busts caches). */
export function slugFromOgFile(file: string): string | null {
  const match = /^([a-z0-9-]+)-[a-z0-9]+\.png$/.exec(file);
  return match ? match[1]! : null;
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 12)).replace(/[\s,.;:–—-]+$/, '')}…`;
}

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, ...extra, ...(children !== undefined ? { children } : {}) },
});

/** The card as a satori element tree (no JSX needed). `photo` is a data URL or null. */
export function ogLayout(card: OgCard, photo: string | null, host: string): Node {
  const ink = '#0f1b2d';
  const brand = '#ff6a1a';
  return h(
    'div',
    { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', position: 'relative', backgroundColor: ink, fontFamily: 'Jakarta, JakartaExt' },
    [
      photo
        ? h('img', { position: 'absolute', left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT, objectFit: 'cover' }, undefined, {
            src: photo,
            width: OG_WIDTH,
            height: OG_HEIGHT,
          })
        : h('div', {
            position: 'absolute',
            left: 0,
            top: 0,
            width: OG_WIDTH,
            height: OG_HEIGHT,
            backgroundImage: 'linear-gradient(135deg, #ff6a1a 0%, #b23c0a 55%, #0f1b2d 100%)',
          }),
      h('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: OG_WIDTH,
        height: OG_HEIGHT,
        backgroundImage:
          'linear-gradient(90deg, rgba(15,27,45,0.94) 0%, rgba(15,27,45,0.82) 40%, rgba(15,27,45,0.25) 68%, rgba(15,27,45,0) 85%)',
      }),
      h(
        'div',
        {
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: 700,
          height: OG_HEIGHT,
        },
        [
          // satori adds padding to the box height, so the column has none and children are placed directly
          h('div', { position: 'absolute', left: 56, top: 44, display: 'flex', alignItems: 'center' }, [
            h(
              'div',
              {
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                borderRadius: 999,
                padding: '10px 22px',
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: -0.5,
              },
              [h('span', { color: ink }, 'Fırsat'), h('span', { color: '#b23c0a' }, 'Bol')],
            ),
          ]),
          h(
            'div',
            { position: 'absolute', left: 56, width: 620, bottom: 40, display: 'flex', flexDirection: 'column' },
            [
              card.d !== null &&
                h(
                  'div',
                  {
                    display: 'flex',
                    alignSelf: 'flex-start',
                    backgroundColor: brand,
                    color: '#ffffff',
                    borderRadius: 18,
                    padding: '8px 20px',
                    fontSize: 34,
                    fontWeight: 800,
                    marginBottom: 18,
                  },
                  `%${card.d} İNDİRİM`,
                ),
              h(
                'div',
                { display: 'flex', color: '#ffffff', fontSize: 42, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1 },
                clip(card.t, 72),
              ),
              (card.l || card.s) &&
                h(
                  'div',
                  { display: 'flex', color: 'rgba(255,255,255,0.85)', fontSize: 24, fontWeight: 600, marginTop: 12 },
                  [card.l, card.s].filter(Boolean).join('  ·  '),
                ),
              card.p &&
                h(
                  'div',
                  { display: 'flex', alignItems: 'flex-end', marginTop: 18 },
                  [
                    h(
                      'div',
                      { display: 'flex', color: '#ffffff', fontSize: 72, fontWeight: 800, lineHeight: 1, letterSpacing: -2 },
                      card.p,
                    ),
                    card.o &&
                      h(
                        'div',
                        {
                          display: 'flex',
                          color: 'rgba(255,255,255,0.7)',
                          fontSize: 32,
                          fontWeight: 600,
                          textDecoration: 'line-through',
                          marginLeft: 22,
                          marginBottom: 6,
                        },
                        card.o,
                      ),
                  ].filter(Boolean),
                ),
              h('div', { display: 'flex', color: 'rgba(255,255,255,0.7)', fontSize: 20, fontWeight: 600, marginTop: 16 }, host),
            ].filter(Boolean),
          ),
        ],
      ),
    ],
  );
}
