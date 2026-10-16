import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { parseEvent } from '../../src/lib/analytics/events';

/**
 * POST /api/event — anonymous first-party interaction events (deal clicks/views, searches).
 * Append-only: each event is its own blob under "YYYY-MM-DD/type/…". No IP address,
 * user agent or identifier is stored.
 */
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > 2_000) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse((await req.text()).slice(0, 2_000));
  } catch {
    return new Response(null, { status: 400 });
  }
  const event = parseEvent(body);
  if (!event) return new Response(null, { status: 400 });

  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  const key = `${day}/${event.type}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await getStore('events').setJSON(key, { ...event, at: now.toISOString() });
  } catch (error) {
    console.error('event store failed', error instanceof Error ? error.message : error);
    return new Response(null, { status: 202 });
  }
  return new Response(null, { status: 204 });
};

export const config: Config = {
  path: '/api/event',
  method: 'POST',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
