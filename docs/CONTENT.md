# Content management (no admin panel required)

All editorial content lives in the repository. Edit files directly on GitHub (pencil icon → commit) — every commit to
the production branch triggers a Netlify deploy automatically. Schemas are validated at build time; a typo fails the
build instead of breaking the live site.

| Task | Where |
| --- | --- |
| Add / update an editorial deal | `src/content/deals/<name>.md` — copy `_ornek.md`, set `status: published` |
| Remove an expired editorial deal | delete the file, or let `validUntil` pass (it disappears automatically) |
| Add an original summary to a partner deal | `src/content/deal-notes/<anything>.md` with `dealId` (shown on each deal page) |
| Feature a deal on the homepage | `featured: true` in an editorial deal or deal note |
| Hide a partner deal | deal note with `hidden: true` |
| Publish a guide | `src/content/guides/<slug>.md` (see existing frontmatter). `relatedTopics` (category-tree slugs, e.g. `masaj`) links the guide from those category pages and fills its "live deals" block; `relatedCity` (e.g. `istanbul`) keeps both in one city |
| Edit legal / info pages | `src/content/pages/*.md` |
| Edit category names, intros, tips, keyword mapping | `src/config/categories.ts` |
| Edit city intros / featured cities | `src/config/cities.ts` |
| Business / controller details, analytics IDs | Netlify environment variables (see `.env.example`) |
| Provider connections | Netlify environment variables (see `docs/PROVIDERS.md`) |
| Force a data refresh | `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<site>/api/admin/refresh` |
| See clicks, CTR, searches, sync status | `curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://<site>/api/admin/stats?days=7"` |

## Editorial rules (summary of /editoryal-ilkeler/)

* Publish only deals you verified on the merchant page; fill `lastCheckedAt`.
* Leave unknown fields empty — never estimate prices, discounts or dates.
* `affiliateUrl` only for links from an approved programme; otherwise use `sourceUrl` only.
* Images only if you have the right to use them.
* Summaries must be your own words. Pages with an original summary (≥ 120 characters) become indexable.

## Indexing rules

* Partner deal pages are `noindex, follow` by default (their text is shared by every publisher). Add a deal note with
  an original summary to make a page indexable, or set `DEALS_INDEX_PROVIDER_PAGES=true` to index pages with long
  descriptions.
* Category pages with no deals, city pages with < 3 deals and search pages are `noindex`.
* Category × city pages are generated only when ≥ 4 deals exist.
