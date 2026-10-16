# SEO checklist

## Implemented (verified by `npm run links` and e2e tests)

- [x] `<html lang="tr">`, `og:locale=tr_TR`, Turkish URLs (ASCII-folded: `/kategori/yeme-icme/`)
- [x] Unique `<title>` and meta description on every page; exactly one `<h1>` per page
- [x] Absolute canonical on every page; paginated pages self-canonical; filter query strings canonicalise to the base
- [x] `robots` meta per page: noindex for search, thank-you pages, empty categories, thin cities, partner deal pages without original content, fixture builds
- [x] `/robots.txt` (production: allow + sitemap; previews/branch deploys: disallow all)
- [x] `/sitemap.xml` generated from the same data and rules as the robots meta (noindex pages excluded)
- [x] `/rss.xml` (guides + indexable deals)
- [x] Open Graph + Twitter cards, 1200×630 default image, per-deal image when available
- [x] JSON-LD: Organization (name/url/logo only), WebSite + SearchAction, BreadcrumbList, ItemList, Article (guides).
      **No** Offer/Product/Review/AggregateRating markup — we are not the seller and do not fabricate ratings.
- [x] Breadcrumbs (visible + structured), including category-tree ancestors (İstanbul › Masaj › Spa › Hamam)
- [x] Internal linking: header categories, city chips, category ↔ city ↔ deal ↔ guide cross-links, related deals
- [x] Pagination with crawlable `<a>` links (`/firsatlar/sayfa/2/`), 301 from `/sayfa/1/`
- [x] Static HTML for all content (works without JS); JS only enhances filters/search
- [x] Image `width/height`, lazy loading below the fold, `fetchpriority` for LCP candidates
- [x] Self-hosted variable fonts (latin + latin-ext subsets), no render-blocking third parties
- [x] Six original Turkish guides (~950 words each), legal and trust pages
- [x] Verification meta tags via env: `PUBLIC_GOOGLE_SITE_VERIFICATION`, `PUBLIC_BING_SITE_VERIFICATION`, `PUBLIC_YANDEX_VERIFICATION`

## Route map

| Route | Indexable when |
| --- | --- |
| `/` | always |
| `/firsatlar/`, `/firsatlar/sayfa/N/` | at least one deal |
| `/firsat/<slug>/` | original summary (or `DEALS_INDEX_PROVIDER_PAGES=true` + long description), unique title |
| `/kategori/<slug>/` (+ `/sayfa/N/`) | category has deals |
| `/kategori/<slug>/<city>/` | generated only with ≥ 4 deals |
| `/sehir/<city>/` | ≥ 3 deals (8 featured cities always exist, noindex while thin) |
| `/sehir/<city>/<district>/`, `/sehir/<city>/<tag>/`, `/sehir/<city>/<district>/<tag>/` | generated from ≥ 3 (plain tags per city ≥ 4) deals, indexed from ≥ 5 |
| `/etiket/<tag>/` | category-tree node: generated from ≥ 3, indexed from ≥ 5; plain tag: generated from ≥ 5, indexed from ≥ 8 |
| `/sehirler/` | at least one deal |
| `/git/<slug>/` (transition page) | never (noindex, nofollow, robots Disallow) |
| `/rehber/`, `/rehber/<slug>/` | always |
| legal/info pages, `/iletisim/`, `/bulten/` | always |
| `/arama/`, `/iletisim/tesekkurler/`, `/bulten/onay/`, `/404` | never |

## Owner actions (after the domain is live)

- [ ] Google Search Console: add **Domain property** `firsatbol.com` (DNS TXT) or URL-prefix property with the
      `PUBLIC_GOOGLE_SITE_VERIFICATION` meta tag → submit `https://firsatbol.com/sitemap.xml`
- [ ] Bing Webmaster Tools: import from Search Console (or `PUBLIC_BING_SITE_VERIFICATION`) → submit sitemap
- [ ] Yandex Webmaster (relevant in Türkiye): `PUBLIC_YANDEX_VERIFICATION` → submit sitemap
- [ ] Set `SITE_URL=https://firsatbol.com` once HTTPS works on the domain, then redeploy
- [ ] Check Core Web Vitals in Search Console after ~28 days of traffic
- [ ] Add original summaries (deal notes) to the best partner deals so they can rank
- [ ] Publish 1–2 new guides per month targeting real search intent (seasonal: Kasım indirimleri, yılbaşı, bayram)
