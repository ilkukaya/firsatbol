import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { readEnv, readInt } from '../../src/lib/env';
import { dealsFingerprint } from '../../src/lib/deals/fingerprint';
import { dedupeDeals, isActive } from '../../src/lib/deals/normalize';
import type { Deal } from '../../src/lib/deals/schema';
import { getNetworkProviders } from '../../src/lib/providers/registry';
import type { ProviderDiagnostics } from '../../src/lib/providers/types';
import { triggerRebuild } from '../shared/rebuild';

/**
 * Scheduled every hour. Every DEALS_REFRESH_INTERVAL_HOURS (default 6) it queries the
 * providers ONCE, compares the result with the fingerprint of the live build
 * (/data/build-info.json) and triggers a rebuild only if the data changed.
 * If a provider fails, nothing is rebuilt — the live site keeps its last good data.
 */
export default async () => {
  const store = getStore('sync');
  const intervalHours = readInt('DEALS_REFRESH_INTERVAL_HOURS', 6, { min: 1, max: 168 });
  const state = (await store.get('state', { type: 'json' })) as { lastRunAt?: string } | null;
  if (state?.lastRunAt && Date.now() - Date.parse(state.lastRunAt) < intervalHours * 3_600_000 - 5 * 60_000) {
    return;
  }

  const now = new Date();
  const { providers, configErrors } = getNetworkProviders();
  const configured = providers.filter((provider) => provider.isConfigured());
  const diagnostics: ProviderDiagnostics[] = [];
  const deals: Deal[] = [];
  for (const provider of configured) {
    const result = await provider.fetchDeals({ now });
    diagnostics.push(result.diagnostics);
    deals.push(...result.deals);
  }
  const failed = diagnostics.filter((d) => !d.ok);
  const active = dedupeDeals(deals).deals.filter((deal) => isActive(deal, now));
  const fingerprint = dealsFingerprint(active);

  let live: string | null = null;
  const siteUrl = readEnv('URL');
  if (siteUrl) {
    try {
      const response = await fetch(`${siteUrl}/data/build-info.json`, { headers: { 'cache-control': 'no-cache' } });
      if (response.ok) live = ((await response.json()) as { networkFingerprint?: string }).networkFingerprint ?? null;
    } catch {
      live = null;
    }
  }

  let action = 'unchanged';
  if (configured.length === 0) action = 'no-providers';
  else if (failed.length > 0) action = 'provider-error';
  else if (live !== fingerprint) {
    const result = await triggerRebuild(`veri değişti (${active.length})`);
    action = result.triggered ? 'rebuild-triggered' : `rebuild-skipped: ${result.message}`;
  }

  await store.setJSON('state', {
    lastRunAt: now.toISOString(),
    action,
    fingerprint,
    liveFingerprint: live,
    activeDeals: active.length,
    configErrors,
    diagnostics,
  });
  console.info(`[sync] action=${action} active=${active.length} live=${live} new=${fingerprint}`);
};

export const config: Config = {
  // every hour at minute 17 (UTC); the interval check above decides whether to query
  schedule: '17 * * * *',
};
