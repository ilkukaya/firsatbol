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

## Fırsat Bu Fırsat (first provider)

**Confirmed** (publisher dashboard): endpoint `https://api.firsatbufirsat.com/deal/browse.html` and the `apiKey`
and `publisherId` parameters.

**Not confirmed yet**: response format/schema, filter and pagination parameter names. The adapter therefore:

1. sends `apiKey` + `publisherId` server-side (build or function only) and any extra parameters **you** copy from
   the dashboard's generated URL into `FIRSATBUFIRSAT_EXTRA_QUERY` (we do not invent names);
2. detects JSON or XML (HTML responses are rejected with a clear message);
3. locates the record list automatically and maps fields via candidate keys (`src/lib/providers/fields.ts`);
4. lets you pin exact fields with `FIRSATBUFIRSAT_FIELD_MAP` once you have seen a real response.

### Activation steps

1. **Rotate the API key** in the publisher dashboard if it was ever shared outside the dashboard.
2. Locally, create `.env` with `FIRSATBUFIRSAT_API_KEY` and `FIRSATBUFIRSAT_PUBLISHER_ID`, then run:
   ```bash
   npm run provider:inspect            # deals API
   npm run provider:inspect -- --events   # Etkinlik API (needs FIRSATBUFIRSAT_EVENTS_API_URL)
   ```
   It prints the format, structure, record keys, which keys were mapped, how many records normalise, and saves the
   (secret-redacted) raw response to `.cache/` (git-ignored).
3. If a field maps wrongly, set e.g. `FIRSATBUFIRSAT_FIELD_MAP={"title":"name","price":"prices.deal","sourceUrl":"link"}`.
   Paths are dotted, case/underscore-insensitive; array indexes allowed (`images.0`).
4. Optional parameters (copy names/values exactly from the dashboard):
   * `FIRSATBUFIRSAT_EXTRA_QUERY` — channel, city, district, tags, page size…
   * `FIRSATBUFIRSAT_POPULAR_QUERY` / `FIRSATBUFIRSAT_NEW_QUERY` — extra request whose results are labelled
     popular/new (powers the homepage "Popüler" / "Yeni" sections with real provider signals).
   * `FIRSATBUFIRSAT_PAGE_PARAM`, `FIRSATBUFIRSAT_PAGE_START`, `FIRSATBUFIRSAT_MAX_PAGES` — pagination; stops early on
     an empty or repeated page.
5. Add the same variables in Netlify (scopes: **Builds** and **Functions**; mark the key as secret) and redeploy.
6. Please send the inspection output (it contains no secrets) so the field map and a real-shaped test fixture can
   be committed.

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
