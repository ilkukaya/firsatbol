import type { Deal } from './deals/schema';
import { formatPrice, formatSession } from './format';

/** Share channels; `placement` of the deal_share analytics event. */
export type ShareChannel = 'whatsapp' | 'telegram' | 'x' | 'facebook' | 'copy' | 'native';

/** The deal URL as shared, tagged per channel so shared visits show up in analytics. */
export function shareUrl(siteUrl: string, slug: string, channel: ShareChannel): string {
  const url = new URL(`/firsat/${slug}/`, siteUrl);
  url.searchParams.set('utm_source', channel);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'paylas');
  return url.toString();
}

/** Headline used for the message and the link preview: "%43 indirim · 429 TL — Park Of İstanbul…". */
export function shareHeadline(deal: Pick<Deal, 'title' | 'discountPercent' | 'price' | 'priceFrom' | 'currency'>): string {
  const parts = [
    deal.discountPercent !== null ? `%${deal.discountPercent} indirim` : null,
    deal.price !== null ? `${formatPrice(deal.price, deal.currency)}${deal.priceFrom ? '’den başlayan' : ''}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} — ${deal.title}` : deal.title;
}

/**
 * The message people send: short, scannable on a phone, facts only (no invented urgency).
 *   🔥 %43 indirim: Park Of İstanbul Hayvanat Bahçesi Giriş Bileti
 *   💰 429 TL (750 TL yerine)
 *   📍 Çekmeköy, İstanbul
 *   👉 https://…
 */
export function shareMessage(
  deal: Pick<Deal, 'title' | 'discountPercent' | 'price' | 'originalPrice' | 'priceFrom' | 'currency' | 'district' | 'city' | 'sessions'>,
  url: string,
): string {
  const lines = [deal.discountPercent !== null ? `🔥 %${deal.discountPercent} indirim: ${deal.title}` : `🔥 Fırsat: ${deal.title}`];
  if (deal.price !== null) {
    const was =
      deal.originalPrice !== null && deal.originalPrice > deal.price ? ` (${formatPrice(deal.originalPrice, deal.currency)} yerine)` : '';
    lines.push(`💰 ${formatPrice(deal.price, deal.currency)}${deal.priceFrom ? '’den başlayan fiyatlarla' : ''}${was}`);
  }
  const place = [deal.district, deal.city].filter(Boolean).join(', ');
  if (place) lines.push(`📍 ${place}`);
  if (deal.sessions[0]) lines.push(`📅 Sonraki seans: ${formatSession(deal.sessions[0].date)}`);
  lines.push(`👉 ${url}`);
  return lines.join('\n');
}

/** Share intents of the networks (open in a new tab/app; nothing is loaded from them on our page). */
export function shareIntents(siteUrl: string, deal: Parameters<typeof shareMessage>[0] & Pick<Deal, 'slug'>) {
  const link = (channel: ShareChannel) => shareUrl(siteUrl, deal.slug, channel);
  const enc = encodeURIComponent;
  return {
    whatsapp: `https://wa.me/?text=${enc(shareMessage(deal, link('whatsapp')))}`,
    telegram: `https://t.me/share/url?url=${enc(link('telegram'))}&text=${enc(shareMessage(deal, '').replace(/\n👉 $/, ''))}`,
    x: `https://twitter.com/intent/tweet?text=${enc(shareHeadline(deal))}&url=${enc(link('x'))}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(link('facebook'))}`,
    copy: link('copy'),
    native: link('native'),
    message: shareMessage(deal, link('native')),
  };
}
