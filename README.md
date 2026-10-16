# FırsatBol

**Fırsat çok, kaçırmak yok!** — an independent Turkish deal-discovery publisher (tr-TR, TRY, Europe/Istanbul).
FırsatBol lists deals from **authorised** partner sources and sends visitors to the original merchant. It never sells,
takes payments or holds inventory. Revenue: affiliate / publisher referral commissions (ads later, only after approval).

Production domain (when connected): https://firsatbol.com

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Astro 7, `output: "static"` | Crawlable HTML for every deal/category/guide page, near-zero JS |
| Language | TypeScript (strictest) | |
| Styling | Tailwind CSS 4 (CSS-first `@theme`) | Design tokens in `src/styles/global.css` |
| Validation | Zod 4 | Deal model, content collections, events, API inputs |
| Hosting | Netlify (static CDN + Functions + Blobs + Forms) | Free/low-cost tiers |
| Tests | Vitest (unit) · Playwright + axe (e2e, a11y) · link checker | |

No SSR adapter is needed: pages are prerendered; the few dynamic pieces are standalone Netlify Functions
(`netlify/functions/`). The official `@astrojs/netlify` adapter can be added later if on-demand pages are needed.

## How deal data flows

```
Provider API/feed ──(build time, server-side secrets)──▶ adapters (src/lib/providers)
   ▶ format detection (JSON/XML) ▶ field mapping ▶ normalizeDeal() + Zod ▶ dedupe ▶ drop expired
   ▶ static pages (/firsatlar, /firsat/…, /kategori/…, /sehir/…) + /data/deals.json (client filters)

Scheduled function sync-deals (hourly; queries providers every DEALS_REFRESH_INTERVAL_HOURS)
   ▶ compares fingerprint with live /data/build-info.json ▶ triggers a build hook only when data changed
```

* Visitors never trigger partner API calls. One build = one provider query (plus pagination).
* If a configured provider fails during a **production** build, the build fails on purpose and Netlify keeps the
  previous deploy (last good data) live. Previews never fail on provider errors.
* Without credentials, the site builds and shows honest empty states — never fake deals.
* Synthetic fixtures (`fixtures/`) exist only for local development/tests and are refused in production context.

## Quick start

```bash
npm install
npm run dev:fixtures     # local dev with SYNTHETIC sample deals (yellow banner, noindex)
npm run dev              # local dev with real providers (needs .env) or empty states
npm run ci               # typecheck + lint + unit tests + build + link check
npm run test:e2e:all     # builds fixture + empty sites and runs Playwright (desktop, mobile, a11y)
npm run provider:inspect # inspect the real Fırsat Bu Fırsat response with your credentials (local only)
```

Copy `.env.example` to `.env` for local work. **Never commit `.env`.**

## Project structure

```
src/
  config/            site.ts (env-driven owner/analytics config), categories.ts, cities.ts, attribution/
  content/           guides/ (rehberler), pages/ (legal & info), deals/ (editorial deals), deal-notes/ (overlays)
  lib/
    deals/           schema (Zod), normalize, repository (build-time), query (shared filters), taxonomy, fingerprint
    providers/       types, http (timeout/retry/backoff/rate-limit), parse, fields, firsatbufirsat/, feed/, registry
    analytics/       event schema + PII scrubbing + aggregation
  components/        DealCard, DealListing, AttributionNotice, Header, Footer, NewsletterForm, …
  pages/             routes (see docs/SEO_CHECKLIST.md for the route map)
  scripts/           small client scripts (site, listing, analytics)
netlify/functions/   event, admin-stats, admin-refresh, sync-deals (scheduled), newsletter
scripts/             inspect-provider.ts, check-links.mjs, generate-assets.mjs
tests/               unit/ (Vitest), e2e/ (Playwright)
docs/                DEPLOYMENT, PROVIDERS, CONTENT, SEO_CHECKLIST, LAUNCH_CHECKLIST
```

## Documentation

* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Netlify setup, env vars, build hook, domain, verification
* [docs/PROVIDERS.md](docs/PROVIDERS.md) — Fırsat Bu Fırsat integration, attribution, adding new affiliate sources
* [docs/CONTENT.md](docs/CONTENT.md) — editorial deals, featuring, guides, category texts (no admin panel needed)
* [docs/SEO_CHECKLIST.md](docs/SEO_CHECKLIST.md) — what is implemented and what to do in Search Console/Bing
* [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) — owner actions before/after launch

## Non-negotiables (enforced in code and tests)

* No secrets in source, HTML, JS bundles, logs or analytics. API keys are server/build-only; URLs carrying the key are
  stripped; the link checker and Netlify's secret scanner fail the build on leaks.
* No fabricated prices, discounts, dates, ratings, reviews, scarcity ("son 2 ürün") or structured data.
  Discount % is shown only when the provider states it consistently or both prices are known.
* Partner attribution ("Fırsat bilgileri Fırsat Bu Fırsat tarafından sağlanmaktadır.") on every page with that data.
* Affiliate links are passed through unchanged, marked `rel="sponsored"`, and disclosed.
