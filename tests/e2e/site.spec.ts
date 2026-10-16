import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// the partner's official snippet (src/config/attribution/firsatbufirsat.html): text + logo + referral link
const expectAttribution = async (page: Page) => {
  const snippet = page.locator('[data-attribution] a[href="https://yayinci.firsatbufirsat.com/?pid=842"]').first();
  await expect(snippet).toBeVisible();
  await expect(snippet).toContainText(/Fırsat bilgileri\s+tarafından sağlanmaktadır\./);
  await expect(snippet.locator('img[alt="Fırsat Bu Fırsat - Şehir Fırsatları"]')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  // fixtures are dated around 2026-10-16; freeze the browser clock so tests don't drift
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  // never hit real third parties from tests
  await page.route(/^https:\/\/(?!localhost)/, (route) => route.fulfill({ status: 204, body: '' }));
});

test('homepage shows real sections, attribution and fixture warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Fırsat çok');
  await expect(page.getByRole('heading', { name: 'Öne Çıkan Fırsatlar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Şehrindeki Fırsatlar' })).toBeVisible();
  await expectAttribution(page);
  await expect(page.getByText('SENTETİK ÖRNEK VERİDİR')).toBeVisible();
  // fixture builds must never be indexable
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  // no fabricated scarcity
  await expect(page.locator('body')).not.toContainText(/son \d+ ürün/i);
});

test('listing filters, search and sorting work', async ({ page }) => {
  await page.goto('/firsatlar/');
  const count = page.locator('[data-result-count]');
  const cards = page.locator('[data-results] article');
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(5);

  if (await page.locator('[data-filter-toggle]').isVisible()) await page.locator('[data-filter-toggle]').click();
  await page.selectOption('#f-kategori', 'yeme-icme');
  await expect(count).toHaveText(/3 fırsat bulundu/);
  await expect(page).toHaveURL(/kategori=yeme-icme/);
  for (const text of await cards.locator('[data-card-category]').allTextContents()) expect(text).toContain('Yeme');

  await page.selectOption('#f-sehir', 'istanbul');
  await expect(count).toHaveText(/2 fırsat bulundu/);

  await page.click('[data-reset]');
  await page.fill('#f-q', 'masaj');
  await expect(count).toHaveText(/1 fırsat bulundu/);
  await expect(cards.first()).toContainText('masaj');

  await page.click('[data-reset]');
  await page.selectOption('#f-sirala', 'fiyat-artan');
  await expect(page).toHaveURL(/sirala=fiyat-artan/);
  const prices = (await cards.locator('.text-xl').allTextContents()).map((t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.')));
  expect(prices.length).toBeGreaterThan(3);
  expect([...prices].sort((a, b) => a - b)).toEqual(prices);
});

test('filters are restored from the URL', async ({ page }) => {
  await page.goto('/firsatlar/?kategori=etkinlik');
  await expect(page.locator('[data-result-count]')).toHaveText(/fırsat bulundu/);
  await expect(page.locator('#f-kategori')).toHaveValue('etkinlik');
});

test('search page finds deals by district', async ({ page }) => {
  await page.goto('/arama/?q=kadikoy');
  await expect(page.locator('[data-result-count]')).toHaveText(/1 fırsat bulundu/);
});

test('deal detail: gallery, CTA via transition page, disclosure and attribution', async ({ page }) => {
  await page.goto('/firsat/ornek-veri-bogaz-manzarali-serpme-kahvalti-2-kisilik-1001/');
  await expect(page.locator('h1')).toContainText('Boğaz manzaralı');
  await expect(page.locator('[data-gallery-track] li')).toHaveCount(3);
  await expect(page.locator('[data-gallery-counter]')).toHaveText('1 / 3');
  const cta = page.locator('a[data-placement="detail"]');
  await expect(cta).toHaveAttribute('href', '/git/ornek-veri-bogaz-manzarali-serpme-kahvalti-2-kisilik-1001/');
  await expect(page.getByText('%35 indirim')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Fırsat özeti' }).getByText('iş ortaklığı bağlantısıdır')).toBeVisible();
  await expectAttribution(page);
  await expect(page.getByRole('navigation', { name: 'Sayfa konumu' })).toContainText('Yeme İçme');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join('')).toContain('BreadcrumbList');
  expect(ld.join('')).not.toMatch(/"Review"|"AggregateRating"|"Offer"/);
});

test('transition page shows the destination and forwards to the unchanged referral URL', async ({ page }) => {
  const target = 'https://example.com/firsat/1001?pid=PUBLISHER_TEST';
  await page.goto('/git/ornek-veri-bogaz-manzarali-serpme-kahvalti-2-kisilik-1001/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.getByRole('heading', { name: 'Fırsatınız hazır!' })).toBeVisible();
  await expect(page.getByText('Gideceğiniz adres:')).toContainText('example.com');
  const now = page.locator('[data-redirect-now]');
  await expect(now).toHaveAttribute('href', target);
  await expect(now).toHaveAttribute('rel', /sponsored/);
  await expectAttribution(page);
  // the browser clock is frozen in beforeEach; advance it to trigger the automatic redirect
  const navigation = page.waitForRequest((request) => request.url() === target);
  await page.clock.runFor(3500);
  await navigation;
});

test('cancelling the transition keeps the visitor on FırsatBol', async ({ page }) => {
  await page.goto('/git/ornek-veri-60-dakika-aromaterapi-masaji-1002/');
  let left = false;
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.com/firsat/1002')) left = true;
  });
  await page.locator('[data-redirect-cancel]').click();
  await expect(page).toHaveURL(/\/firsat\/ornek-veri-60-dakika-aromaterapi-masaji-1002\/$/);
  await page.clock.runFor(5000);
  expect(left).toBe(false);
});

test('deal without price never shows an invented price or discount', async ({ page }) => {
  await page.goto('/firsat/ornek-veri-fiyati-belirtilmemis-atolye-1011/');
  await expect(page.getByText('Fiyat bilgisi satıcı sayfasında yer alır.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('indirim)');
});

test('deal clicks send an anonymous first-party event', async ({ page }) => {
  await page.goto('/kategori/etkinlik/');
  const beacon = page.waitForRequest((request) => request.url().endsWith('/api/event') && request.method() === 'POST');
  const popup = page.waitForEvent('popup');
  await expect(page.locator('a[data-deal-link]').first()).toHaveAttribute('href', /^\/git\//);
  await page.locator('a[data-deal-link]').first().click();
  const body = JSON.parse((await beacon).postData() ?? '{}');
  expect(body).toMatchObject({ type: 'deal_click', provider: 'firsatbufirsat', category: 'etkinlik' });
  expect(JSON.stringify(body)).not.toMatch(/@|ip|userAgent/i);
  await (await popup).close();
});

test('expired deals are flagged client-side between refreshes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-06-01T00:00:00Z'));
  await page.goto('/firsat/ornek-veri-60-dakika-aromaterapi-masaji-1002/');
  await expect(page.getByText('geçerlilik süresi dolmuş görünüyor')).toBeVisible();
});

test('event calendar: this-week section and session table', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bu Hafta Etkinlikler' })).toBeVisible();
  await page.goto('/firsat/ornek-veri-stand-up-gosterisi-bileti-1004/');
  await expect(page.getByRole('heading', { name: 'Etkinlik takvimi' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="takvim"] li')).toHaveCount(3);
  await expect(page.getByText('Sonraki seans')).toBeVisible();
});

test('category, city and guide pages render', async ({ page }) => {
  await page.goto('/kategori/yeme-icme/');
  await expect(page.locator('h1')).toHaveText('Yeme İçme Fırsatları');
  await expect(page.getByRole('heading', { name: 'Dikkat edilecekler' })).toBeVisible();
  await page.goto('/sehir/istanbul/');
  await expect(page.locator('h1')).toHaveText('İstanbul fırsatları');
  await page.goto('/rehber/gercek-indirim-nasil-anlasilir/');
  await expect(page.locator('h1')).toContainText('Gerçek İndirim');
  await expect(page.locator('.prose-fb h2').first()).toBeVisible();
});

test('contact form is a real Netlify form with honeypot', async ({ page }) => {
  await page.goto('/iletisim/');
  const form = page.locator('form[name="iletisim"]');
  await expect(form).toHaveAttribute('data-netlify', 'true');
  await expect(form).toHaveAttribute('netlify-honeypot', 'bot-field');
  await expect(form.locator('input[name="form-name"]')).toHaveValue('iletisim');
  await expect(form.locator('[name="email"]')).toHaveAttribute('required', '');
});

test('legal pages show controller box and pending notice', async ({ page }) => {
  await page.goto('/gizlilik-politikasi/');
  await expect(page.getByRole('heading', { name: 'Veri Sorumlusu' })).toBeVisible();
  await expect(page.getByText('güncellenmektedir')).toBeVisible();
});

test('newsletter is honestly disabled when not configured', async ({ page }) => {
  await page.goto('/bulten/');
  await expect(page.getByText('Bülten çok yakında.')).toBeVisible();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
});

test('mobile menu and no horizontal overflow', async ({ page, isMobile }) => {
  for (const path of [
    '/',
    '/firsatlar/',
    '/firsat/ornek-veri-bluetooth-kulaklik-1006/',
    '/rehber/indirimli-urun-fiyat-karsilastirmasi/',
    '/kategori/tatil/',
    '/iletisim/',
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} yatay taşma`).toBeLessThanOrEqual(0);
  }
  if (isMobile) {
    await page.goto('/');
    const toggle = page.locator('[data-menu-toggle]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-menu')).toBeVisible();
  }
});

for (const path of [
  '/',
  '/firsatlar/',
  '/firsat/ornek-veri-bogaz-manzarali-serpme-kahvalti-2-kisilik-1001/',
  '/kategori/guzellik-bakim/',
  '/rehber/kampanya-sartlari-nasil-kontrol-edilir/',
  '/iletisim/',
  '/gizlilik-politikasi/',
  '/git/ornek-veri-bogaz-manzarali-serpme-kahvalti-2-kisilik-1001/',
]) {
  test(`accessibility (axe) ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      serious.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(', ')}`,
      ),
    ).toEqual([]);
  });
}
