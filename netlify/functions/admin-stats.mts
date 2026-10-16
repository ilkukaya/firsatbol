import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { summarizeEvents, type AnalyticsEvent } from '../../src/lib/analytics/events';
import { json, requireAdmin } from '../shared/auth';

/**
 * GET /api/admin/stats?days=7 (Authorization: Bearer ADMIN_TOKEN)
 * Aggregated clicks, views, outbound CTR, category/provider performance, popular searches,
 * plus the last scheduled sync diagnostics.
 */
export default async (req: Request) => {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const days = Math.min(31, Math.max(1, Number(new URL(req.url).searchParams.get('days') ?? '7') || 7));
  const store = getStore('events');
  const events: AnalyticsEvent[] = [];
  const dayKeys: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dayKeys.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() - offset * 86_400_000)));
  }
  let scanned = 0;
  for (const day of dayKeys) {
    const { blobs } = await store.list({ prefix: `${day}/` });
    for (const blob of blobs) {
      if (scanned >= 20_000) break; // keep the function well inside its time limit
      scanned += 1;
      const value = (await store.get(blob.key, { type: 'json' })) as AnalyticsEvent | null;
      if (value) events.push(value);
    }
  }
  const sync = await getStore('sync').get('state', { type: 'json' });
  return json({
    summary: summarizeEvents(events, dayKeys.at(-1)!, dayKeys[0]!),
    scanned,
    truncated: scanned >= 20_000,
    sync,
  });
};

export const config: Config = { path: '/api/admin/stats', method: 'GET' };
