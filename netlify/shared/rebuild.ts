import { getStore } from '@netlify/blobs';
import { readEnv } from '../../src/lib/env';

/**
 * Trigger a Netlify build through a build hook (NETLIFY_BUILD_HOOK_URL, a secret URL created
 * in Site configuration → Build & deploy → Build hooks). Throttled so that neither the
 * scheduler nor the manual endpoint can start builds in a tight loop.
 */
const MIN_INTERVAL_MS = 10 * 60 * 1000;

export async function triggerRebuild(reason: string): Promise<{ triggered: boolean; message: string }> {
  const hook = readEnv('NETLIFY_BUILD_HOOK_URL');
  if (!hook || !hook.startsWith('https://api.netlify.com/build_hooks/')) {
    return { triggered: false, message: 'NETLIFY_BUILD_HOOK_URL tanımlı değil.' };
  }
  const store = getStore('sync');
  const last = (await store.get('last-rebuild', { type: 'json' })) as { at: string } | null;
  if (last && Date.now() - Date.parse(last.at) < MIN_INTERVAL_MS) {
    return { triggered: false, message: `Son tetiklemeden bu yana 10 dakika geçmedi (${last.at}).` };
  }
  const title = encodeURIComponent(`firsatbol-sync: ${reason}`.slice(0, 80));
  const response = await fetch(`${hook}?trigger_title=${title}`, { method: 'POST' });
  if (!response.ok) return { triggered: false, message: `Build hook HTTP ${response.status}` };
  await store.setJSON('last-rebuild', { at: new Date().toISOString(), reason });
  return { triggered: true, message: 'Yeniden derleme başlatıldı.' };
}
