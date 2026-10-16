/**
 * Environment access shared by Astro build code and Netlify Functions.
 * Netlify Functions expose `Netlify.env`; the Astro build and Node scripts use `process.env`.
 * Empty strings are treated as "not set" so a blank variable in the Netlify UI never
 * silently enables a feature.
 */
type NetlifyGlobal = { env: { get(key: string): string | undefined } };

export function readEnv(name: string): string | undefined {
  const netlify = (globalThis as { Netlify?: NetlifyGlobal }).Netlify;
  let value: string | undefined;
  try {
    value = netlify?.env.get(name);
  } catch {
    value = undefined;
  }
  if (value === undefined && typeof process !== 'undefined') value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function readBool(name: string, fallback: boolean): boolean {
  const value = readEnv(name)?.toLowerCase();
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on', 'evet'].includes(value);
}

export function readInt(name: string, fallback: number, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const raw = readEnv(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** True on Netlify production deploys (CONTEXT is injected by Netlify builds). */
export function isProductionContext(): boolean {
  return readEnv('CONTEXT') === 'production';
}
