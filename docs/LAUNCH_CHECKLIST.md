# Launch checklist

Legend: **[x]** done in the codebase and verified · **[ ]** owner action required

## Product & content
- [x] Homepage, listings with working search/filters/sort/pagination, deal detail, category, category×city, city pages
- [x] Six original Turkish guides; Hakkımızda, İletişim, Gizlilik, Çerez, Kullanım Koşulları, İş Ortaklığı Açıklaması,
      Editoryal İlkeler, Fırsatların Kaynağı, İş Birliği, Bülten pages
- [x] Honest empty states (no fake deals) when no provider is configured
- [ ] Legal review of the privacy, cookie, terms and affiliate pages by a lawyer (they are careful drafts)
- [ ] Fill `SITE_CONTROLLER_NAME`, `SITE_CONTROLLER_ADDRESS` (and optionally `SITE_CONTACT_EMAIL`, `SITE_KEP_ADDRESS`,
      `SITE_MERSIS_NO`) — legal pages show "Güncelleniyor" until then
- [ ] Decide on the İYS registration requirement before sending any commercial e-mail

## Data & monetisation
- [x] Fırsat Bu Fırsat adapter (format detection, mapping, validation, pagination, retries, rate limiting)
- [x] Required attribution component on every page with partner data
- [x] Affiliate links passed through unchanged, `rel="sponsored"`, disclosed on cards' detail pages and in the footer
- [x] Anonymous first-party click/view/search tracking + `/api/admin/stats` (CTR, category/provider performance)
- [ ] **Rotate** the Fırsat Bu Fırsat API key if it was ever shared, then set `FIRSATBUFIRSAT_API_KEY` +
      `FIRSATBUFIRSAT_PUBLISHER_ID` in Netlify (secret; Builds + Functions)
- [ ] Run `npm run provider:inspect` locally and share the (secret-free) output to confirm field mapping
- [ ] Copy any filter parameters from the dashboard into `FIRSATBUFIRSAT_EXTRA_QUERY` (exact names)
- [ ] Paste the official attribution snippet into `src/config/attribution/firsatbufirsat.html` if the dashboard offers one
- [ ] Confirm referral tracking in Günlük Raporlar after a test click → set `FIRSATBUFIRSAT_TRACKING_VERIFIED=true`
- [ ] Apply to additional programmes (Admitad, Awin, direct merchants); add approved feeds via `DEAL_FEEDS`

## Operations
- [x] `netlify.toml`: build, security headers (CSP, HSTS, nosniff, frame-deny), caching, redirects, secret scanning
- [x] Scheduled sync function + throttled build hook trigger + secured manual refresh
- [ ] Create build hook → `NETLIFY_BUILD_HOOK_URL`; set `ADMIN_TOKEN` (≥ 24 random chars)
- [ ] Netlify: enable Forms detection and add an e-mail notification for form `iletisim`
- [ ] Link the GitHub repository to the Netlify project for continuous deployment; set production branch `main`

## Analytics, search & newsletter
- [ ] Choose analytics: Plausible or Umami (cookieless, no banner needed) or GA4 (consent banner appears automatically)
- [ ] Domain live → `SITE_URL=https://firsatbol.com` → redeploy → Search Console, Bing, Yandex + sitemap
- [ ] Newsletter: Brevo account, list, double opt-in template → `BREVO_*` env vars + `PUBLIC_NEWSLETTER_ENABLED=true`

## Ads (later)
- [ ] Only after approval by an ad network: `PUBLIC_ADS_ENABLED=true` and add the network tag to `src/components/AdSlot.astro`
      (update the CSP in `netlify.toml` for the network's domains)
