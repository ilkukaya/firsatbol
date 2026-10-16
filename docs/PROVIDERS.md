# Data providers

## Architecture

Every source implements `ProviderAdapter` (`src/lib/providers/types.ts`):

```ts
interface ProviderAdapter {
  id: string; name: string;
  isConfigured(): boolean;                       // false → skipped, never throws
  fetchDeals({ now }): Promise<{ deals: Deal[]; diagnostics: ProviderDiagnostics }>;
}
```

Adapters return **normalised, Zod-validated** `Deal` objects (`src/lib/deals/schema.ts`) built with
`normalizeDeal()` (`src/lib/deals/normalize.ts`), which:

* parses Turkish/international prices (`1.299,90 TL`, `₺1,299.90`) and dates (`31.12.2026`, ISO, unix);
* computes discount % **only** from two known prices, or accepts the provider's figure if it is consistent (±2 points);
* treats a price of `0` as unknown (never shows "free" by accident);
* strips HTML from provider text, rejects non-http(s) URLs, removes any URL parameter carrying the API key;
* maps provider categories to FırsatBol categories via keywords (`src/config/categories.ts`);
* normalises cities to the 81 provinces (`src/config/cities.ts`) — unknown values stay `null`, never guessed;
* marks expired deals; the repository drops them and deduplicates by id and canonical destination URL.

Registered sources live in `src/lib/providers/registry.ts`.

## Fırsat Bu Fırsat (first provider) — verified 2026-10-16

Verified against real responses with the owner's credentials:

| Fact | Value |
| --- | --- |
| Endpoint | `https://api.firsatbufirsat.com/deal/browse.html?apiKey=…&publisherId=…` |
| Format | JSON `{ result: "SUCCESS", resultMessage, total, deals: [...] }` — non-SUCCESS results fail the build (production) |
| Page size | 10 deals, not configurable (20+ candidate parameter names tested without effect) |
| Pagination | `p=<n>`; **max 20 distinct pages (200 deals) per query**, later pages repeat the last one |
| Province filter | `cityId=<1–81>` (partner's own ids, roughly Turkish alphabetical: 1 Adana, 7 Ankara, 8 Antalya, 21 Bursa, 32 Eskişehir, 41 İstanbul, 42 İzmir, 53 Kocaeli, 59 Muğla; 82 = all) |
| District filter | `townId=<id>` (ids not enumerated; wrong ids return 0 results) |
| Result order per province | local deals first, then the ~78 nationwide deals (empty `city`); single nationwide deals can appear mid-list |
| Tracking | `showDealUrl`/`buyDealUrl` carry `pid=<publisherId>` |

Field mapping (`FBF_FIELD_MAP` in `src/lib/providers/firsatbufirsat/index.ts`): `id`, `title`, `description`,
`businessData[0].title` (merchant), `businessData[0].address`, `city`, `town`, `realPriceWithSymbol` (original),
`dealPriceWithSymbol` (price), `discountPercent` ("0" when no discount → not shown), `image450_H` (cards),
`image1200x1200` (detail), `showDealUrl` (outbound, tracked), `couponEndDate` (voucher end, shown as "Son kullanım";
`true` means no date), `detail` + `howToUse` (conditions), `tags` (comma list → category mapping; there is no
category field), `subDeals` (options with their own prices).

### Sweep strategy (why "il il" requests are needed)

Unfiltered queries stop at 200 deals, so the adapter sweeps all 81 provinces (`FIRSATBUFIRSAT_CITY_IDS=all`):
each province is paged until its local deals end (the page ends in ≥2 nationwide deals); the nationwide tail is
collected once. Measured: **154 requests, ~56 s, 851 unique deals** (of 1 946 listed). The gap is İstanbul
(1 361 deals, capped at 200 per query) — add district queries to `FIRSATBUFIRSAT_QUERIES`
(`cityId=41&townId=<id>|…`) once the district ids are known; the build log reports how many records were cut off.

### Activation steps

1. **Rotate the API key** in the publisher dashboard if it was ever shared outside the dashboard.
2. Netlify → environment variables: `FIRSATBUFIRSAT_API_KEY` (secret) and `FIRSATBUFIRSAT_PUBLISHER_ID`,
   scopes Builds + Functions. Redeploy.
3. Optional local check: `npm run provider:inspect` (one page, structure) or `npm run provider:inspect -- --sweep`
   (full import with category/city statistics). In restricted sandboxes prefix with `NODE_USE_ENV_PROXY=1`.
4. Confirm clicks in Günlük Raporlar → set `FIRSATBUFIRSAT_TRACKING_VERIFIED=true`.

### Tracking / attribution

* Outbound links use the provider's URL **unchanged**. If a record has a tracking/affiliate field, it is used; if the
  plain URL contains your publisher id, it is treated as the referral link; `FIRSATBUFIRSAT_LINK_TEMPLATE` can apply
  the "Link Oluşturma" format (`{url}`, `{urlEncoded}`, `{publisherId}`, `{id}`) if the dashboard documents one.
* `trackingStatus` is `unverified` until you set `FIRSATBUFIRSAT_TRACKING_VERIFIED=true` after confirming with the
  partner (e.g. via Günlük Raporlar showing clicks). Nothing on the site claims guaranteed commissions.
* Required attribution text is rendered on every page using this data (`AttributionNotice`). To use the partner's
  official HTML snippet (logo + link), save it as `src/config/attribution/firsatbufirsat.html` (scripts are refused).

### Rate limits & caching

One provider query per build (plus configured popular/new/pagination requests), ≥ 1 s between requests,
15 s timeout, 3 retries with exponential backoff + jitter, `Retry-After` honoured. The scheduled sync queries at most
once per `DEALS_REFRESH_INTERVAL_HOURS` (default 6) and rebuilds only when the data fingerprint changed. Adjust the
interval to the partner's terms.

## Adding another affiliate source

Only after the programme has **approved** FırsatBol and you have the documentation/usage rights.

**Feed-based (most networks: Admitad, Awin, CJ, direct merchant programmes)** — no code needed. Put the authorised
JSON/XML feed in `DEAL_FEEDS` (secret if the URL contains a token):

```json
[{
  "id": "awin-magaza-adi",
  "name": "Mağaza Adı",
  "url": "https://<feed-url-from-the-network>",
  "fieldMap": { "title": "product_name", "sourceUrl": "aw_deep_link", "price": "search_price", "imageUrl": "merchant_image_url" },
  "attributionRequired": false,
  "trackingVerified": true,
  "category": "alisveris"
}]
```

Field names in the example are illustrative — always take them from the network's own feed documentation.
Run a local build and check the `[deals]` log lines for accepted/rejected counts.

**API-based** — create `src/lib/providers/<name>/index.ts` implementing `ProviderAdapter` using `fetchText()`
(timeouts, retries, rate limiting, redaction) and `normalizeDeal()`, register it in `registry.ts`, add unit tests
with a real (anonymised) response fixture. The frontend needs no changes.

**Never** scrape marketplaces or competitors (Trendyol, Hepsiburada, Amazon, DonanımHaber, …) without written
authorisation.
