import { createFeedAdapter, readFeedConfigs } from './feed';
import { createFirsatBuFirsatAdapter, readFbfConfig } from './firsatbufirsat';
import type { ProviderAdapter } from './types';

/**
 * All network data sources. Used by the Astro build (static pages) and by the scheduled
 * sync function (change detection). Editorial deals from the repository are added on top
 * of these in `src/lib/deals/repository.ts`.
 *
 * To add a provider with a bespoke API: implement `ProviderAdapter` in a new folder and
 * append it here. Feeds that only need a URL + field map go into `DEAL_FEEDS` instead.
 */
export function getNetworkProviders(): { providers: ProviderAdapter[]; configErrors: string[] } {
  const providers: ProviderAdapter[] = [createFirsatBuFirsatAdapter(readFbfConfig('deals'))];
  const events = readFbfConfig('events');
  if (events.endpoint) providers.push(createFirsatBuFirsatAdapter(events));
  const { feeds, errors } = readFeedConfigs();
  providers.push(...feeds.map(createFeedAdapter));
  return { providers, configErrors: errors };
}
