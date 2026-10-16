import type { Config } from '@netlify/functions';
import { json, requireAdmin } from '../shared/auth';
import { triggerRebuild } from '../shared/rebuild';

/**
 * POST /api/admin/refresh (Authorization: Bearer ADMIN_TOKEN)
 * Manually refresh the deal data by triggering a rebuild (throttled to one per 10 minutes).
 */
export default async (req: Request) => {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const result = await triggerRebuild('manual');
  return json(result, result.triggered ? 202 : 409);
};

export const config: Config = { path: '/api/admin/refresh', method: 'POST' };
