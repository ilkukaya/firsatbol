import { timingSafeEqual } from 'node:crypto';
import { readEnv } from '../../src/lib/env';

/**
 * Admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.
 * ADMIN_TOKEN must be at least 24 characters; if it is missing the endpoints are disabled.
 */
export function requireAdmin(req: Request): Response | null {
  const expected = readEnv('ADMIN_TOKEN');
  if (!expected || expected.length < 24) {
    return json({ error: 'Yönetim uç noktaları devre dışı (ADMIN_TOKEN tanımlı değil).' }, 503);
  }
  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: 'Yetkisiz.' }, 401);
  return null;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
