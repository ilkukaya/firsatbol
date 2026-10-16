import type { Deal } from '../deals/schema';

/** Outcome of one provider sync, kept for diagnostics (never contains secrets). */
export interface ProviderDiagnostics {
  providerId: string;
  providerName: string;
  configured: boolean;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requests: number;
  responseFormat: 'json' | 'xml' | 'html' | 'text' | 'unknown' | null;
  received: number;
  accepted: number;
  rejected: number;
  expired: number;
  rejectReasons: Record<string, number>;
  warnings: string[];
  error: string | null;
}

export interface ProviderResult {
  deals: Deal[];
  diagnostics: ProviderDiagnostics;
}

export interface ProviderFetchOptions {
  now: Date;
  signal?: AbortSignal;
}

/**
 * Every data source implements this interface. Adapters must:
 *  - read credentials server-side only (env vars without a PUBLIC_ prefix),
 *  - return normalised, validated deals (see normalizeDeal),
 *  - never throw for "not configured" — report `configured: false` instead.
 */
export interface ProviderAdapter {
  id: string;
  name: string;
  isConfigured(): boolean;
  fetchDeals(options: ProviderFetchOptions): Promise<ProviderResult>;
  /**
   * Optional cheap change signature (e.g. total + first page ids) used by the scheduled sync
   * instead of a full fetch. Different signature ⇒ data probably changed ⇒ rebuild.
   */
  probe?(options: ProviderFetchOptions): Promise<string>;
}

export function emptyDiagnostics(providerId: string, providerName: string, configured: boolean): ProviderDiagnostics {
  const now = new Date().toISOString();
  return {
    providerId,
    providerName,
    configured,
    ok: !configured ? true : false,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    requests: 0,
    responseFormat: null,
    received: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
    rejectReasons: {},
    warnings: [],
    error: null,
  };
}
