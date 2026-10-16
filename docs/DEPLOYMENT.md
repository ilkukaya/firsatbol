# Deployment (Netlify)

## Current status (2026-10-16)

| Item | State |
| --- | --- |
| Netlify project | `firsatbol` on team `ilkukaya` — https://app.netlify.com/projects/firsatbol |
| Live URL | https://firsatbol.netlify.app (production deploys from branch `claude/sweet-mendel-8uunqt`) |
| Continuous deployment | linked — every push deploys automatically |
| Env vars | `FIRSATBUFIRSAT_API_KEY`, `FIRSATBUFIRSAT_PUBLISHER_ID` set (mark the key as **secret** in the UI and rotate it — it was shared in chat) |
| Forms detection | enabled |
| Still to configure | `NETLIFY_BUILD_HOOK_URL` + `ADMIN_TOKEN` (scheduled/manual refresh), analytics, custom domain |

## 1. Connect the repository (continuous deployment)

1. Open https://app.netlify.com/projects/firsatbol → **Project configuration → Build & deploy → Continuous
   deployment → Link repository → GitHub** → `ilkukaya/firsatbol` (authorise the Netlify GitHub app if asked).
2. Build settings are read from `netlify.toml`: command `npm run build`, publish `dist`, Node 22.
3. **Production branch**: `main` is recommended. Until `main` exists, the first pushed branch is the repository's
   only branch — merge the work into `main` (pull request) and select `main` as the production branch.
4. Enable **Forms → Form detection** (needed for the contact form) and add an email notification for form `iletisim`.

Every push to the production branch deploys automatically; pull requests get Deploy Previews
(`noindex`, robots disallow, provider errors never fail preview builds).

## 2. Environment variables

Set in **Project configuration → Environment variables** (never in `netlify.toml`, never with a `PUBLIC_` prefix for
secrets). Full list with explanations: `.env.example`.

| Variable | Secret | Scopes | Needed for |
| --- | --- | --- | --- |
| `FIRSATBUFIRSAT_API_KEY` | yes | Builds, Functions | partner deals |
| `FIRSATBUFIRSAT_PUBLISHER_ID` | no* | Builds, Functions | partner deals / attribution |
| `FIRSATBUFIRSAT_EXTRA_QUERY`, `…_FIELD_MAP`, … | no | Builds, Functions | provider tuning |
| `NETLIFY_BUILD_HOOK_URL` | yes | Functions | scheduled refresh + manual refresh |
| `ADMIN_TOKEN` (≥ 24 random chars) | yes | Functions | `/api/admin/*` |
| `BREVO_API_KEY`, `BREVO_LIST_ID`, `BREVO_DOI_TEMPLATE_ID` + `PUBLIC_NEWSLETTER_ENABLED=true` | key: yes | Builds, Functions | newsletter |
| `SITE_CONTROLLER_NAME`, `SITE_CONTROLLER_ADDRESS`, `SITE_CONTACT_EMAIL` | no | Builds | legal pages |
| `PUBLIC_PLAUSIBLE_DOMAIN` or `PUBLIC_UMAMI_WEBSITE_ID` (or `PUBLIC_GA4_ID`) | no | Builds | analytics |
| `PUBLIC_GOOGLE_SITE_VERIFICATION`, `PUBLIC_BING_SITE_VERIFICATION` | no | Builds | Search Console / Bing |

\* The publisher id appears inside partner referral URLs, so it is excluded from secret scanning in `netlify.toml`.
The API key is **not** excluded: Netlify fails the deploy if it ever appears in the output.

Env changes need a redeploy (Deploys → Trigger deploy).

## 3. Scheduled refresh

1. **Build & deploy → Build hooks → Add build hook** (name `deal-sync`, branch = production) → copy URL into
   `NETLIFY_BUILD_HOOK_URL` (secret).
2. The function `sync-deals` runs hourly (scheduled functions run only on the published production deploy), checks
   providers every `DEALS_REFRESH_INTERVAL_HOURS` (default 6) and triggers the hook only if the data changed.
   Status: `GET /api/admin/stats` → `sync`.
3. Manual refresh: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<site>/api/admin/refresh`
   (throttled to one build per 10 minutes).

Build minutes: each build takes ~1 minute; at most 4 data rebuilds/day with the default interval.

## 4. Custom domain (firsatbol.com)

Only after the domain is purchased and you control DNS:

1. **Domain management → Add a domain** → `firsatbol.com` (Netlify also adds `www`).
2. Either point the registrar's nameservers to Netlify DNS, or create records at your DNS host:
   `A @ → 75.2.60.5` and `CNAME www → <project>.netlify.app` (confirm current values in the Netlify UI).
3. Wait for **HTTPS certificate** provisioning (Let's Encrypt), then enable **Force HTTPS** (default).
4. Set `SITE_URL=https://firsatbol.com` and redeploy (canonicals, sitemap and OG URLs then use the domain;
   until then Netlify's `URL` — the primary domain — is used automatically).
5. Verify: `curl -sI https://firsatbol.com | head -1`, `curl -s https://firsatbol.com/robots.txt`.

## 5. Post-deploy verification

```bash
SITE=https://<project>.netlify.app
curl -s -o /dev/null -w "%{http_code}\n" $SITE/                 # 200
curl -s $SITE/robots.txt                                        # Sitemap line present
curl -s $SITE/data/build-info.json                              # generatedAt, total, providers[].ok
curl -s -o /dev/null -w "%{http_code}\n" -X POST $SITE/api/event -H 'content-type: application/json' \
  -d '{"type":"deal_view","path":"/"}'                          # 204
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$SITE/api/admin/stats?days=1"
```

Netlify build log lines starting with `[deals]` show provider status, accepted/rejected counts and reasons.

## Local checks before pushing

```bash
npm run ci              # typecheck, lint, unit tests, build, internal link + secret leak check
npm run test:e2e:all    # Playwright (desktop + mobile + empty build) incl. axe accessibility
```
