/**
 * Small, dependency-free HTTP helper for provider requests:
 * timeout, retry with exponential backoff + jitter, Retry-After support and a
 * per-host minimum interval (simple client-side rate limiting).
 */
export interface FetchPolicy {
  timeoutMs: number;
  retries: number;
  baseDelayMs: number;
  minIntervalMs: number;
  userAgent: string;
}

export const DEFAULT_POLICY: FetchPolicy = {
  timeoutMs: 15_000,
  retries: 3,
  baseDelayMs: 1_000,
  minIntervalMs: 1_000,
  userAgent: 'FirsatBolBot/1.0 (+https://firsatbol.com/firsatlarin-kaynagi/)',
};

export class ProviderHttpError extends Error {
  /** Number of HTTP attempts made before giving up (for diagnostics). */
  attempts = 0;
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

/** Next free request slot per host: requests START at least minIntervalMs apart, even when concurrent. */
const nextSlot = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function respectInterval(host: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + minIntervalMs);
  if (slot > now) await sleep(slot - now);
}

/** Run async tasks with a fixed concurrency limit, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 60_000) : null;
}

export interface FetchedBody {
  status: number;
  contentType: string;
  body: string;
  attempts: number;
}

/**
 * Fetch a URL as text. `redactedUrl` is used in error messages so secrets in the query
 * string never reach logs.
 */
export async function fetchText(
  url: string,
  redactedUrl: string,
  policy: FetchPolicy = DEFAULT_POLICY,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedBody> {
  const host = new URL(url).host;
  let attempt = 0;
  let lastError: ProviderHttpError | null = null;
  while (attempt <= policy.retries) {
    attempt += 1;
    await respectInterval(host, policy.minIntervalMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          accept: 'application/json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
          'user-agent': policy.userAgent,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      const body = await response.text();
      if (response.ok) {
        return {
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          body,
          attempts: attempt,
        };
      }
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new ProviderHttpError(`HTTP ${response.status} (${redactedUrl})`, response.status, retryable);
      if (!retryable) throw lastError;
      const wait = retryAfterMs(response) ?? backoff(policy.baseDelayMs, attempt);
      if (attempt <= policy.retries) await sleep(wait);
    } catch (error) {
      if (error instanceof ProviderHttpError && !error.retryable) {
        error.attempts = attempt;
        throw error;
      }
      if (!(error instanceof ProviderHttpError)) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        lastError = new ProviderHttpError(
          aborted ? `Zaman aşımı (${policy.timeoutMs} ms, ${redactedUrl})` : `Ağ hatası (${redactedUrl})`,
          null,
          true,
        );
        if (attempt <= policy.retries) await sleep(backoff(policy.baseDelayMs, attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const failure = lastError ?? new ProviderHttpError(`İstek başarısız (${redactedUrl})`, null, false);
  failure.attempts = attempt;
  throw failure;
}

export function backoff(baseDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelayMs * 0.5;
  return Math.min(exponential + jitter, 30_000);
}

/** Replace secret query-parameter values so a URL can be logged safely. */
export function redactUrl(url: string, secrets: readonly string[]): string {
  try {
    const parsed = new URL(url);
    for (const [key, value] of [...parsed.searchParams.entries()]) {
      if (secrets.includes(value) || /key|token|secret|password/i.test(key)) parsed.searchParams.set(key, '***');
    }
    return parsed.toString();
  } catch {
    return '[geçersiz URL]';
  }
}
