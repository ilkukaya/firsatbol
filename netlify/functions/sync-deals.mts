import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { readInt } from '../../src/lib/env';
import { dealsFingerprint } from '../../src/lib/deals/fingerprint';
import { getNetworkProviders } from '../../src/lib/providers/registry';
import { triggerRebuild } from '../shared/rebuild';

/**
 * Scheduled every hour. Every DEALS_REFRESH_INTERVAL_HOURS (default 6) it computes a cheap
 * change signature per provider — `probe()` (Fırsat Bu Fırsat: ONE unfiltered request) or a
 * fingerprint of a full fetch for small feeds — and triggers a rebuild when any signature
 * changed. Independently, a rebuild is triggered when the live data is older than
 * DEALS_MAX_DATA_AGE_HOURS (default 24) so expiry dates and prices never drift for long.
 * Provider errors never trigger a rebuild: the live site keeps its last good data.
 */
interface SyncState {
  lastRunAt?: string;
  lastRebuildAt?: string;
  signatures?: Record<string, string>;
}

export default async () => {
  const store = getStore('sync');
  const intervalHours = readInt('DEALS_REFRESH_INTERVAL_HOURS', 6, { min: 1, max: 168 });
  const maxAgeHours = readInt('DEALS_MAX_DATA_AGE_HOURS', 24, { min: 1, max: 336 });
  const state = ((await store.get('state', { type: 'json' })) as SyncState | null) ?? {};
  if (state.lastRunAt && Date.now() - Date.parse(state.lastRunAt) < intervalHours * 3_600_000 - 5 * 60_000) return;

  const now = new Date();
  const { providers, configErrors } = getNetworkProviders();
  const configured = providers.filter((provider) => provider.isConfigured());
  const signatures: Record<string, string> = {};
  const errors: string[] = [];
  for (const provider of configured) {
    try {
      if (provider.probe) signatures[provider.id] = await provider.probe({ now });
      else {
        const result = await provider.fetchDeals({ now });
        if (!result.diagnostics.ok) throw new Error(result.diagnostics.error ?? 'bilinmeyen hata');
        signatures[provider.id] = dealsFingerprint(result.deals);
      }
    } catch (error) {
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const previous = state.signatures ?? {};
  const changed = Object.keys(signatures).filter((id) => previous[id] !== undefined && previous[id] !== signatures[id]);
  const isFirstRun = Object.keys(previous).length === 0;
  const stale = !state.lastRebuildAt || Date.now() - Date.parse(state.lastRebuildAt) > maxAgeHours * 3_600_000;

  let action = 'unchanged';
  let lastRebuildAt = state.lastRebuildAt;
  if (configured.length === 0) action = 'no-providers';
  else if (errors.length > 0) action = 'provider-error';
  else if (changed.length > 0 || (stale && !isFirstRun)) {
    const result = await triggerRebuild(changed.length ? `veri değişti: ${changed.join(',')}` : 'günlük yenileme');
    action = result.triggered ? 'rebuild-triggered' : `rebuild-skipped: ${result.message}`;
    if (result.triggered) lastRebuildAt = now.toISOString();
  } else if (isFirstRun) {
    action = 'baseline-recorded';
    lastRebuildAt ??= now.toISOString();
  }

  await store.setJSON('state', {
    lastRunAt: now.toISOString(),
    lastRebuildAt,
    action,
    signatures: errors.length ? previous : { ...previous, ...signatures },
    changed,
    configErrors,
    errors,
  });
  console.info(`[sync] action=${action} changed=${changed.join(',') || '-'} errors=${errors.length}`);
};

export const config: Config = {
  // every hour at minute 17 (UTC); the interval check above decides whether to query
  schedule: '17 * * * *',
};
