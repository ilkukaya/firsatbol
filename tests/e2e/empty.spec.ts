import { expect, test } from '@playwright/test';

/** Build without any provider credentials: the site must be honest, never fake-filled. */
test('homepage without data shows honest state and no deal cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fırsat akışımız hazırlanıyor' })).toBeVisible();
  await expect(page.locator('article a[data-deal-link]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Öne Çıkan Fırsatlar' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Popüler Fırsatlar' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Alışveriş Rehberleri' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index/);
});

test('empty category page is noindex with an honest empty state', async ({ page }) => {
  await page.goto('/kategori/teknoloji/');
  await expect(page.getByText('Şu anda burada yayında fırsat yok')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('sitemap contains guides and legal pages but no empty listings', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('/rehber/gercek-indirim-nasil-anlasilir/');
  expect(xml).toContain('/gizlilik-politikasi/');
  expect(xml).not.toContain('/kategori/teknoloji/');
  expect(xml).not.toContain('/firsat/');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap:');
});
