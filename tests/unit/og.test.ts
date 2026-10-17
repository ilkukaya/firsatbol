import { describe, expect, it } from 'vitest';
import { clip, ogImagePath, ogVersion, slugFromOgFile, type OgCard } from '../../src/lib/og';

const card: OgCard = { t: 'Kahvaltı', p: '780 TL', o: '1.200 TL', d: 35, l: 'Beşiktaş, İstanbul', s: null, i: null };

describe('og cards', () => {
  it('versions the image URL by content', () => {
    expect(ogVersion(card)).toBe(ogVersion({ ...card }));
    expect(ogVersion(card)).not.toBe(ogVersion({ ...card, p: '700 TL' }));
    expect(ogImagePath('kahvalti-1', card)).toMatch(/^\/og\/firsat\/kahvalti-1-[a-z0-9]+\.jpg$/);
  });
  it('parses the slug back and rejects anything else', () => {
    expect(slugFromOgFile(ogImagePath('kahvalti-1', card).split('/').pop()!)).toBe('kahvalti-1');
    expect(slugFromOgFile('../../etc/passwd')).toBeNull();
    expect(slugFromOgFile('kahvalti.png')).toBeNull();
    expect(slugFromOgFile('kahvalti-1-abc.png')).toBe('kahvalti-1'); // links shared before the switch to JPEG
  });
  it('clips long titles on a word boundary', () => {
    expect(clip('kısa başlık', 20)).toBe('kısa başlık');
    expect(clip('Park Of İstanbul Hayvanat Bahçesi Giriş Bileti ve Burger Menü Seçenekleri', 40)).toBe(
      'Park Of İstanbul Hayvanat Bahçesi Giriş…',
    );
  });
});
