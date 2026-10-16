import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection } from 'astro:content';
import { normalizeCity } from '../../config/cities';
import { readBool, readEnv, isProductionContext } from '../env';
import { getNetworkProviders } from '../providers/registry';
import { transformResponse } from '../providers/firsatbufirsat';
import type { ProviderDiagnostics } from '../providers/types';
import { buildSlug, computeIndexable, dedupeDeals, ensureUniqueSlugs, isActive, markDuplicateTitles, resolveDiscount } from './normalize';
import { dealSchema, type Deal } from './schema';
import { dealsFingerprint } from './fingerprint';

/**
 * Build-time deal repository. Every page that lists deals calls `getDeals()`; the result
 * is memoised so each provider is queried once per build (never once per visitor).
 *
 * Failure policy: if a configured provider fails and DEALS_FAIL_BUILD_ON_PROVIDER_ERROR is
 * true (default on Netlify production), the build fails on purpose — Netlify then keeps
 * the previous deploy (with its last good data) live instead of publishing an empty site.
 */
export interface DealsSnapshot {
  deals: Deal[];
  generatedAt: string;
  fixtureMode: boolean;
  diagnostics: ProviderDiagnostics[];
  duplicates: number;
  /** Fingerprint of active network-provider deals, computed exactly like the scheduled sync. */
  networkFingerprint: string;
}

let snapshotPromise: Promise<DealsSnapshot> | undefined;

export function getDeals(): Promise<DealsSnapshot> {
  snapshotPromise ??= loadSnapshot();
  return snapshotPromise;
}

/** Fixture mode is for local development and tests only — never on Netlify production. */
export function isFixtureMode(): boolean {
  return readBool('DEALS_USE_FIXTURES', false) && !isProductionContext();
}

async function loadSnapshot(): Promise<DealsSnapshot> {
  const now = new Date(readEnv('DEALS_NOW') ?? Date.now());
  const fixtureMode = isFixtureMode();
  if (readBool('DEALS_USE_FIXTURES', false) && isProductionContext()) {
    console.warn('[deals] DEALS_USE_FIXTURES production bağlamında yok sayıldı.');
  }

  const diagnostics: ProviderDiagnostics[] = [];
  const collected: Deal[] = [];

  if (fixtureMode) {
    collected.push(...loadFixtureDeals(now));
  } else {
    const { providers, configErrors } = getNetworkProviders();
    configErrors.forEach((message) => console.warn(`[deals] ${message}`));
    for (const provider of providers) {
      if (!provider.isConfigured()) {
        console.info(`[deals] ${provider.name}: yapılandırılmamış, atlandı.`);
        continue;
      }
      const result = await provider.fetchDeals({ now });
      diagnostics.push(result.diagnostics);
      const d = result.diagnostics;
      console.info(
        `[deals] ${d.providerName} (${d.providerId}): ok=${d.ok} format=${d.responseFormat ?? '-'} alınan=${d.received} kabul=${d.accepted} reddedilen=${d.rejected} süresi-dolmuş=${d.expired} istek=${d.requests} süre=${d.durationMs}ms`,
      );
      if (Object.keys(d.rejectReasons).length) console.info(`[deals]   red nedenleri: ${JSON.stringify(d.rejectReasons)}`);
      d.warnings.forEach((warning) => console.warn(`[deals]   uyarı: ${warning}`));
      if (!d.ok) {
        console.error(`[deals]   HATA: ${d.error}`);
        if (readBool('DEALS_FAIL_BUILD_ON_PROVIDER_ERROR', isProductionContext())) {
          throw new Error(
            `[deals] ${d.providerName} verisi alınamadı (${d.error}). Önceki yayın canlı kalsın diye derleme durduruldu. ` +
              'Geçici olarak devam etmek için DEALS_FAIL_BUILD_ON_PROVIDER_ERROR=false ayarlayın.',
          );
        }
      }
      collected.push(...result.deals);
    }
  }

  const networkFingerprint = dealsFingerprint(dedupeDeals(collected).deals.filter((deal) => isActive(deal, now)));
  collected.push(...(await loadEditorialDeals(now)));
  const withNotes = await applyDealNotes(collected);
  const { deals: unique, duplicates } = dedupeDeals(withNotes);
  const active = unique.filter((deal) => isActive(deal, now));
  const finalDeals = markDuplicateTitles(ensureUniqueSlugs(active)).map((deal) => (fixtureMode ? { ...deal, indexable: false } : deal));

  console.info(`[deals] Toplam yayında: ${finalDeals.length} (yinelenen: ${duplicates}, fixture=${fixtureMode})`);
  return { deals: finalDeals, generatedAt: now.toISOString(), fixtureMode, diagnostics, duplicates, networkFingerprint };
}

function loadFixtureDeals(now: Date): Deal[] {
  const body = readFileSync(join(process.cwd(), 'fixtures/firsatbufirsat/sample.json'), 'utf8');
  const result = transformResponse(
    body,
    'application/json',
    {
      id: 'firsatbufirsat',
      name: 'Fırsat Bu Fırsat',
      fieldMap: {},
      publisherId: 'PUBLISHER_TEST',
      apiKey: undefined,
      trackingVerified: false,
      linkTemplate: undefined,
      categoryHint: undefined,
      indexProviderPages: false,
    },
    now,
  );
  // Give the fixture deterministic signals so every homepage section can be previewed.
  return result.deals.map((deal, index) => ({
    ...deal,
    featured: index < 4,
    popular: index % 3 === 0,
    isNew: index % 2 === 0,
  }));
}

async function loadEditorialDeals(now: Date): Promise<Deal[]> {
  const entries = await getCollection('deals', (entry) => entry.data.status === 'published');
  const deals: Deal[] = [];
  for (const entry of entries) {
    const data = entry.data;
    const city = normalizeCity(data.city);
    const price = data.price ?? null;
    let originalPrice = data.originalPrice ?? null;
    if (originalPrice !== null && price !== null && originalPrice <= price) originalPrice = null;
    const discount = resolveDiscount(originalPrice, price, null);
    const summary = data.summary ?? null;
    const description = entry.body?.trim() ? entry.body.trim() : null;
    const candidate: Deal = {
      id: `editorial:${entry.id}`,
      externalId: entry.id,
      provider: 'editorial',
      providerName: 'FırsatBol Editör',
      title: data.title,
      slug: buildSlug(data.title, entry.id, 'editorial'),
      description,
      summary,
      category: data.category,
      sourceCategory: null,
      merchant: data.merchant,
      city: city?.name ?? null,
      citySlug: city?.slug ?? null,
      district: data.district ?? null,
      originalPrice,
      price,
      currency: 'TRY',
      discountPercent: discount.percent,
      discountSource: discount.source,
      imageUrl: data.imageUrl ?? null,
      sourceUrl: data.sourceUrl,
      affiliateUrl: data.affiliateUrl ?? null,
      trackingStatus: data.affiliateUrl ? 'provider-tracked' : 'none',
      validFrom: data.validFrom?.toISOString() ?? null,
      validUntil: data.validUntil?.toISOString() ?? null,
      lastCheckedAt: data.lastCheckedAt.toISOString(),
      status: data.validUntil && data.validUntil < now ? 'expired' : 'published',
      attribution: { required: false, providerId: 'editorial', text: '', url: null },
      featured: data.featured,
      popular: false,
      isNew: false,
      conditions: data.conditions,
      tags: data.tags,
      indexable: computeIndexable(summary, description, true),
    };
    const parsed = dealSchema.safeParse(candidate);
    if (parsed.success) deals.push(parsed.data);
    else console.warn(`[deals] Editoryal fırsat geçersiz (${entry.id}): ${parsed.error.issues[0]?.message}`);
  }
  return deals;
}

async function applyDealNotes(deals: Deal[]): Promise<Deal[]> {
  const notes = await getCollection('dealNotes');
  if (notes.length === 0) return deals;
  const byId = new Map(notes.map((note) => [note.data.dealId, note.data]));
  return deals
    .filter((deal) => !byId.get(deal.id)?.hidden)
    .map((deal) => {
      const note = byId.get(deal.id);
      if (!note) return deal;
      const summary = note.summary ?? deal.summary;
      return {
        ...deal,
        summary,
        featured: deal.featured || note.featured,
        indexable: computeIndexable(summary, deal.description, false) || deal.indexable,
      };
    });
}
