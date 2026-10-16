/**
 * Regenerates raster brand assets from public/favicon.svg using Playwright's Chromium.
 *   node scripts/generate-assets.mjs
 * Outputs: favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, logo-512.png, og/default.png
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/favicon.svg', 'utf8');
const fontCss = (pkg, file) =>
  `@font-face{font-family:'${pkg}';src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2');font-weight:200 800;}`;
const fonts =
  fontCss('Display', 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-ext-wght-normal.woff2') +
  fontCss('Display', 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2') +
  fontCss('Sans', 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-ext-wght-normal.woff2') +
  fontCss('Sans', 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2');

const browser = await chromium.launch();
async function render(html, width, height, path, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>${fonts}html,body{margin:0;width:${width}px;height:${height}px;${transparent ? 'background:transparent' : ''}}</style></head><body>${html}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: transparent });
  await page.close();
}

const mark = (size, radius = 0) =>
  `<div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`;
await render(mark(32), 32, 32, 'public/favicon-32.png', true);
// apple-touch / maskable icons: full-bleed tile (iOS applies its own rounding)
const fullBleed = (size) =>
  `<div style="width:${size}px;height:${size}px;background:#ff6a1a">${svg.replace('rx="13"', 'rx="0"').replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`;
await render(fullBleed(180), 180, 180, 'public/apple-touch-icon.png');
await render(fullBleed(192), 192, 192, 'public/icon-192.png');
await render(fullBleed(512), 512, 512, 'public/icon-512.png');
await render(mark(512), 512, 512, 'public/logo-512.png', true);

const og = `<div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;background:radial-gradient(900px 500px at 95% -10%,#ffd9bf 0%,transparent 60%),#f7f5f2;font-family:Sans;color:#0f1b2d;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden">
  <div style="display:flex;align-items:center;gap:22px">${mark(88)}<div style="font-family:Display;font-weight:800;font-size:64px;letter-spacing:-2px">Fırsat<span style="color:#c2410c">Bol</span></div></div>
  <div>
    <div style="font-family:Display;font-weight:800;font-size:92px;line-height:1;letter-spacing:-3.5px">Fırsat çok,<br><span style="color:#c2410c">kaçırmak yok!</span></div>
    <div style="margin-top:28px;max-width:720px;font-size:32px;line-height:1.3;color:#2a3647;font-weight:500">Yetkili kaynaklardan güncel indirim, kampanya ve etkinlik fırsatları</div>
  </div>
  <div style="position:absolute;right:-60px;bottom:-60px;width:360px;height:360px;border-radius:80px;background:#0f1b2d;transform:rotate(-14deg)"></div>
  <div style="position:absolute;right:70px;bottom:90px;width:150px;height:150px;border-radius:999px;background:#ff6a1a"></div>
</div>`;
await render(og, 1200, 630, 'public/og/default.png');
await browser.close();
console.log('assets generated');
