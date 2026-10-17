import { describe, expect, it } from 'vitest';
import { shareHeadline, shareIntents, shareMessage, shareUrl } from '../../src/lib/share';

const deal = {
  slug: 'park-of-istanbul-1148548',
  title: 'Park Of İstanbul Hayvanat Bahçesi Giriş Bileti',
  discountPercent: 43,
  price: 429,
  originalPrice: 750,
  priceFrom: false,
  currency: 'TRY',
  district: 'Çekmeköy',
  city: 'İstanbul',
  sessions: [],
};

describe('share', () => {
  it('tags shared links per channel', () => {
    expect(shareUrl('https://firsatbol.com', deal.slug, 'whatsapp')).toBe(
      'https://firsatbol.com/firsat/park-of-istanbul-1148548/?utm_source=whatsapp&utm_medium=social&utm_campaign=paylas',
    );
  });
  it('writes a short, factual WhatsApp message', () => {
    expect(shareMessage(deal, 'https://x.test/')).toBe(
      [
        '🔥 %43 indirim: Park Of İstanbul Hayvanat Bahçesi Giriş Bileti',
        '💰 429 TL (750 TL yerine)',
        '📍 Çekmeköy, İstanbul',
        '👉 https://x.test/',
      ].join('\n'),
    );
    expect(shareMessage({ ...deal, discountPercent: null, originalPrice: null, district: null, city: null }, 'u')).toBe(
      '🔥 Fırsat: Park Of İstanbul Hayvanat Bahçesi Giriş Bileti\n💰 429 TL\n👉 u',
    );
  });
  it('puts discount and price into the preview headline', () => {
    expect(shareHeadline(deal)).toBe('%43 indirim · 429 TL — Park Of İstanbul Hayvanat Bahçesi Giriş Bileti');
    expect(shareHeadline({ ...deal, discountPercent: null, price: null })).toBe(deal.title);
  });
  it('builds the network intents with the encoded message', () => {
    const intents = shareIntents('https://firsatbol.com', deal);
    expect(intents.whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(intents.whatsapp.split('text=')[1]!)).toContain('utm_source=whatsapp');
    expect(intents.telegram).toContain('utm_source%3Dtelegram');
    expect(decodeURIComponent(intents.telegram)).not.toContain('👉');
    expect(intents.facebook).toContain('sharer.php?u=');
  });
});
