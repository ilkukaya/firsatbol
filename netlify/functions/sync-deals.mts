import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { triggerRebuild } from '../shared/rebuild';

/**
 * Nightly refresh at 02:00 Türkiye time (TSİ = UTC+3 all year, so 23:00 UTC).
 *
 * Always triggers a full rebuild through the build hook: the build fetches the whole catalog,
 * event sessions and category memberships again, drops expired deals and regenerates every page.
 * A failing provider fails that build (DEALS_FAIL_BUILD_ON_PROVIDER_ERROR), so the live site
 * keeps its last good data. Pushes to the production branch still deploy immediately.
 */
export default async () => {
  const now = new Date();
  const result = await triggerRebuild('gece yenilemesi (02:00 TSİ)');
  const action = result.triggered ? 'rebuild-triggered' : `rebuild-skipped: ${result.message}`;
  const store = getStore('sync');
  const previous = ((await store.get('state', { type: 'json' })) as { lastRebuildAt?: string } | null) ?? {};
  await store.setJSON('state', {
    lastRunAt: now.toISOString(),
    lastRebuildAt: result.triggered ? now.toISOString() : previous.lastRebuildAt,
    action,
    schedule: '02:00 TSİ (23:00 UTC)',
  });
  console.info(`[sync] action=${action}`);
};

export const config: Config = {
  // Netlify cron runs in UTC: 23:00 UTC = 02:00 TSİ (Türkiye has no daylight saving time)
  schedule: '0 23 * * *',
};
